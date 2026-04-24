/**
 * Escalation infrastructure (Module 2 CDK).
 * Kinesis stream → Lambda incidentEscalationHandler → SNS emergency-alerts
 */
import * as cdk from 'aws-cdk-lib';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface EscalationStackProps extends cdk.StackProps {
  deployEnv: string;
  evidenceBucket: s3.Bucket;
  transcriptionQueue: sqs.Queue;
}

export class EscalationStack extends cdk.Stack {
  /** Exported for Module 6 NotificationsStack (SMS / push fan-out). */
  public readonly emergencyAlertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: EscalationStackProps) {
    super(scope, id, props);

    const { deployEnv } = props;

    // ── Kinesis incident-events stream ──────────────────────────────────────
    const incidentStream = new kinesis.Stream(this, 'IncidentEventsStream', {
      streamName: `incident-events-${deployEnv}`,
      shardCount: 1,
      retentionPeriod: cdk.Duration.days(1),
      encryption: kinesis.StreamEncryption.MANAGED,
    });

    // ── SNS emergency-alerts ────────────────────────────────────────────────
    this.emergencyAlertsTopic = new sns.Topic(this, 'EmergencyAlertsTopic', {
      topicName: `emergency-alerts-${deployEnv}`,
      displayName: 'ERA Emergency Alerts',
    });
    const alertsTopic = this.emergencyAlertsTopic;

    // Responder SQS fan-out
    const responderQueue = new sqs.Queue(this, 'ResponderQueue', {
      queueName: `on-call-responder-${deployEnv}`,
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'ResponderDlq', {
          queueName: `on-call-responder-dlq-${deployEnv}`,
        }),
        maxReceiveCount: 3,
      },
    });
    alertsTopic.addSubscription(new subs.SqsSubscription(responderQueue));

    // ── Lambda: incident-escalation-handler ─────────────────────────────────
    const escalationRole = new iam.Role(this, 'EscalationRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    alertsTopic.grantPublish(escalationRole);
    incidentStream.grantRead(escalationRole);

    const escalationFn = new lambda.Function(this, 'EscalationHandler', {
      functionName: `era-incident-escalation-${deployEnv}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'src/lambda/incidentEscalationHandler.handler',
      code: lambda.Code.fromAsset('../server'),
      role: escalationRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      // Provisioned concurrency eliminates cold starts for < 2s SLA
      currentVersionOptions: {
        provisionedConcurrentExecutions: 2,
      },
      environment: {
        SNS_EMERGENCY_ALERTS_ARN: alertsTopic.topicArn,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
    });

    // Kinesis event source — batch size 1 for minimum latency
    escalationFn.addEventSource(
      new lambdaEventSources.KinesisEventSource(incidentStream, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 1,
        bisectBatchOnError: true,
        retryAttempts: 3,
      })
    );

    // ── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'KinesisStreamName',   { value: incidentStream.streamName });
    new cdk.CfnOutput(this, 'EmergencyAlertsArn',  { value: alertsTopic.topicArn });
    new cdk.CfnOutput(this, 'ResponderQueueUrl',   { value: responderQueue.queueUrl });
  }
}
