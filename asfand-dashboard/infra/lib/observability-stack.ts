/**
 * STACK 4 — Observability: alarms, dashboard, alert topic (Lambda log retention is set on functions in ComputeStack).
 */
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';
import type { EnvironmentContext } from './env-config';
import type { ObservedLambda } from './compute-stack';

export interface ObservabilityStackProps extends cdk.StackProps {
  deployEnv: string;
  envConfig: EnvironmentContext;
  adminAlertEmail: string;
  incidentStream: kinesis.IStream;
  rdsInstance: rds.DatabaseInstance;
  httpApi: apigwv2.IHttpApi;
  observedLambdas: ObservedLambda[];
  audioTranscriptionFnName: string;
  incidentSummariserFnName: string;
  escalationHandlerFnName: string;
}

export class ObservabilityStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const {
      deployEnv,
      envConfig,
      adminAlertEmail,
      incidentStream,
      rdsInstance,
      httpApi,
      observedLambdas,
      audioTranscriptionFnName,
      incidentSummariserFnName,
      escalationHandlerFnName,
    } = props;

    this.alertTopic = new sns.Topic(this, 'OpsAlerts', {
      topicName: `era-ops-alerts-${deployEnv}`,
      displayName: `ERA ops ${deployEnv}`,
    });
    this.alertTopic.addSubscription(new subscriptions.EmailSubscription(adminAlertEmail));

    const errPct = envConfig.lambdaErrorRateThresholdPercent;
    const iterMs = envConfig.kinesisIteratorAgeMsThreshold;
    const rdsCpu = envConfig.rdsCpuThresholdPercent;

    // ── Alarms: Lambda error rate (%) ───────────────────────────────────────
    for (const { fn, id, timeout } of observedLambdas) {
      const inv = fn.metricInvocations({ statistic: 'Sum', period: cdk.Duration.minutes(5) });
      const err = fn.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(5) });
      const errorPct = new cloudwatch.MathExpression({
        expression: '100 * (errors / FILL(invocations, 1))',
        usingMetrics: { errors: err, invocations: inv },
        label: `${id} error %`,
        period: cdk.Duration.minutes(5),
      });
      new cloudwatch.Alarm(this, `${id}ErrorRateAlarm`, {
        alarmName: `era-${deployEnv}-${id}-error-rate`,
        alarmDescription: `Lambda ${id} error rate > ${errPct}%`,
        metric: errorPct,
        threshold: errPct,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

      const timeoutMs = timeout.toMilliseconds();
      const warnMs = timeoutMs * 0.8;
      new cloudwatch.Alarm(this, `${id}DurationAlarm`, {
        alarmName: `era-${deployEnv}-${id}-duration-warn`,
        alarmDescription: `Lambda ${id} p99 duration > 80% of timeout (${warnMs}ms)`,
        metric: fn.metricDuration({ statistic: 'p99', period: cdk.Duration.minutes(5) }),
        threshold: warnMs,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    }

    // ── Kinesis iterator age ───────────────────────────────────────────────
    const iterAge = new cloudwatch.Metric({
      namespace: 'AWS/Kinesis',
      metricName: 'GetRecords.IteratorAgeMilliseconds',
      dimensionsMap: { StreamName: incidentStream.streamName },
      statistic: 'Maximum',
      period: cdk.Duration.minutes(1),
    });
    new cloudwatch.Alarm(this, 'KinesisIteratorAge', {
      alarmName: `era-${deployEnv}-kinesis-iterator-age`,
      alarmDescription: 'Kinesis consumer falling behind (IteratorAge)',
      metric: iterAge,
      threshold: iterMs,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // ── RDS CPU ────────────────────────────────────────────────────────────
    new cloudwatch.Alarm(this, 'RdsCpu', {
      alarmName: `era-${deployEnv}-rds-cpu`,
      alarmDescription: `RDS CPUUtilization > ${rdsCpu}%`,
      metric: rdsInstance.metricCPUUtilization({ statistic: 'Average', period: cdk.Duration.minutes(5) }),
      threshold: rdsCpu,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // ── Dashboard ──────────────────────────────────────────────────────────
    const throughput = new cloudwatch.GraphWidget({
      title: 'Incident throughput (Kinesis incoming records)',
      left: [incidentStream.metricIncomingRecords({ statistic: 'Sum' })],
      width: 24,
    });

    const aiLatency = new cloudwatch.GraphWidget({
      title: 'AI pipeline latency (p99)',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: audioTranscriptionFnName },
          statistic: 'p99',
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: incidentSummariserFnName },
          statistic: 'p99',
        }),
      ],
      width: 24,
    });

    const escalation = new cloudwatch.GraphWidget({
      title: 'Escalation rate (invocations / 5m)',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: escalationHandlerFnName },
          statistic: 'Sum',
        }),
      ],
      width: 12,
    });

    const apiErrors = new cloudwatch.GraphWidget({
      title: 'HTTP API 5xx',
      left: [
        httpApi.metricServerError({
          statistic: 'Sum',
        }),
      ],
      width: 12,
    });

    const lambdaAggErrors = new cloudwatch.GraphWidget({
      title: 'Lambda aggregate errors (sum)',
      left: observedLambdas.map(({ fn }) => fn.metricErrors({ statistic: 'Sum' })),
      width: 24,
    });

    new cloudwatch.Dashboard(this, 'EraOps', {
      dashboardName: `era-ops-${deployEnv}`,
      widgets: [
        [throughput],
        [aiLatency],
        [escalation, apiErrors],
        [lambdaAggErrors],
      ],
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', { value: this.alertTopic.topicArn });
  }
}
