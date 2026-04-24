/**
 * CDK Stack: ai-pipeline-stack
 *
 * Provisions all Module 4 (AI Processing Pipeline) AWS resources:
 *  - SSM parameters for model endpoint names and LLM model IDs
 *  - DynamoDB table: ai_results
 *  - SQS FIFO queue: summarisation-jobs
 *  - Lambda: realtime-threat-classifier  (Track A, provisioned concurrency for < 1s cold start)
 *  - Lambda: audio-transcription-worker  (Track B, SQS consumer)
 *  - Lambda: incident-summariser         (Track B, SQS consumer)
 *  - EMR Cluster + Step for crime-pattern-analytics (Track C, nightly via EventBridge)
 *  - Amazon OpenSearch Service domain
 *  - EventBridge Rule: daily cron at 02:00 UTC → EMR step
 *  - IAM roles with least-privilege policies
 */

import * as cdk                from 'aws-cdk-lib';
import * as ssm                from 'aws-cdk-lib/aws-ssm';
import * as dynamodb           from 'aws-cdk-lib/aws-dynamodb';
import * as sqs                from 'aws-cdk-lib/aws-sqs';
import * as kms                from 'aws-cdk-lib/aws-kms';
import * as lambda             from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam                from 'aws-cdk-lib/aws-iam';
import * as opensearch         from 'aws-cdk-lib/aws-opensearchservice';
import * as events             from 'aws-cdk-lib/aws-events';
import * as targets            from 'aws-cdk-lib/aws-events-targets';
import * as emr                from 'aws-cdk-lib/aws-emr';
import { Construct }           from 'constructs';

interface AiPipelineProps extends cdk.StackProps {
  deployEnv:           string;
  transcriptionQueue:  sqs.Queue;   // from EvidenceStorageStack
  evidenceBucket:      cdk.aws_s3.Bucket;
  rdsSecretArn:        string;
}

export class AiPipelineStack extends cdk.Stack {
  public readonly summarisationQueue: sqs.Queue;
  public readonly openSearchDomain:   opensearch.Domain;
  public readonly aiResultsTable:     dynamodb.Table;

  constructor(scope: Construct, id: string, props: AiPipelineProps) {
    super(scope, id, props);

    const { deployEnv, transcriptionQueue, evidenceBucket, rdsSecretArn } = props;

    // ── KMS CMK (shared for queues + DynamoDB) ───────────────────────────────
    const cmk = new kms.Key(this, 'AiCmk', {
      description:       `ERA AI pipeline CMK — ${deployEnv}`,
      enableKeyRotation: true,
    });

    // ── DynamoDB: ai_results ──────────────────────────────────────────────────
    this.aiResultsTable = new dynamodb.Table(this, 'AiResultsTable', {
      tableName:            `ai_results`,
      partitionKey:         { name: 'incident_id',        type: dynamodb.AttributeType.STRING },
      sortKey:              { name: 'inference_timestamp', type: dynamodb.AttributeType.STRING },
      billingMode:          dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption:           dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey:        cmk,
      pointInTimeRecovery:  true,
      removalPolicy:        deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── SQS FIFO: summarisation-jobs ──────────────────────────────────────────
    const summarisationDlq = new sqs.Queue(this, 'SummarisationDlq', {
      queueName:       `summarisation-jobs-dlq-${deployEnv}.fifo`,
      fifo:            true,
      encryptionMasterKey: cmk,
    });
    this.summarisationQueue = new sqs.Queue(this, 'SummarisationQueue', {
      queueName:                    `summarisation-jobs-${deployEnv}.fifo`,
      fifo:                         true,
      contentBasedDeduplication:    true,
      encryptionMasterKey:          cmk,
      visibilityTimeout:            cdk.Duration.seconds(300),
      deadLetterQueue: { queue: summarisationDlq, maxReceiveCount: 3 },
    });

    // ── SSM Parameters (model endpoint names + LLM IDs) ──────────────────────
    new ssm.StringParameter(this, 'ThreatClassifierEndpoint', {
      parameterName: '/era/ai/threat-classifier-endpoint',
      stringValue:   'threat-classifier-v2',
      description:   'SageMaker endpoint name for threat classifier model',
    });
    new ssm.StringParameter(this, 'GeoAnomalyEndpoint', {
      parameterName: '/era/ai/geo-anomaly-endpoint',
      stringValue:   'geo-anomaly-v1',
      description:   'SageMaker endpoint name for geo-anomaly LSTM model',
    });
    new ssm.StringParameter(this, 'LlmModelId', {
      parameterName: '/era/ai/llm-model-id',
      stringValue:   'claude-sonnet-4-20250514',
      description:   'LLM model ID for incident summarisation',
    });
    new ssm.StringParameter(this, 'TranscribeEngine', {
      parameterName: '/era/ai/transcribe-engine',
      stringValue:   'aws',
      description:   'Transcription engine: aws | whisper',
    });

    // ── IAM Role: Lambda execution (shared base) ──────────────────────────────
    const lambdaRole = new iam.Role(this, 'AiLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });
    this.aiResultsTable.grantWriteData(lambdaRole);
    cmk.grantEncryptDecrypt(lambdaRole);
    evidenceBucket.grantReadWrite(lambdaRole);

    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions:   ['sagemaker:InvokeEndpoint'],
      resources: ['*'],
    }));
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions:   ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/era/ai/*`],
    }));
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions:   ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:era/*`],
    }));
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions:   ['transcribe:StartTranscriptionJob', 'transcribe:GetTranscriptionJob'],
      resources: ['*'],
    }));

    // ── Lambda: realtime-threat-classifier (Track A) ──────────────────────────
    const threatClassifierFn = new lambda.Function(this, 'RealtimeThreatClassifier', {
      functionName:  `era-realtime-threat-classifier-${deployEnv}`,
      runtime:       lambda.Runtime.NODEJS_20_X,
      handler:       'realtimeThreatClassifier.handler',
      code:          lambda.Code.fromAsset('../server/src/lambda'),
      role:          lambdaRole,
      timeout:       cdk.Duration.seconds(10),
      memorySize:    512,
      environment: {
        NODE_ENV:         deployEnv,
        AI_RESULTS_TABLE: this.aiResultsTable.tableName,
        SSM_USE_MOCK:     'false',
        SAGEMAKER_USE_MOCK: 'false',
      },
    });

    // Provisioned concurrency for < 1s cold start
    const tcAlias = new lambda.Alias(this, 'ThreatClassifierLive', {
      aliasName:      'live',
      version:        threatClassifierFn.currentVersion,
      provisionedConcurrentExecutions: deployEnv === 'prod' ? 5 : 1,
    });

    // ── Lambda: audio-transcription-worker (Track B) ──────────────────────────
    const transcriptionWorkerFn = new lambda.Function(this, 'AudioTranscriptionWorker', {
      functionName:  `era-audio-transcription-worker-${deployEnv}`,
      runtime:       lambda.Runtime.NODEJS_20_X,
      handler:       'audioTranscriptionWorker.handler',
      code:          lambda.Code.fromAsset('../server/src/lambda'),
      role:          lambdaRole,
      timeout:       cdk.Duration.minutes(5),  // Transcribe polling can take a while
      memorySize:    1024,
      environment: {
        NODE_ENV:                    deployEnv,
        SQS_SUMMARISATION_QUEUE_URL: this.summarisationQueue.queueUrl,
        S3_EVIDENCE_BUCKET:          evidenceBucket.bucketName,
        TRANSCRIBE_USE_MOCK:         'false',
        SSM_USE_MOCK:                'false',
        SECRETS_MANAGER_USE_MOCK:    'false',
      },
    });

    // Trigger from transcription-jobs SQS queue
    transcriptionWorkerFn.addEventSource(
      new lambdaEventSources.SqsEventSource(transcriptionQueue, {
        batchSize:              1,
        reportBatchItemFailures: true,
      })
    );
    this.summarisationQueue.grantSendMessages(transcriptionWorkerFn.role!);

    // ── Lambda: incident-summariser (Track B) ─────────────────────────────────
    const summariserRole = new iam.Role(this, 'SummariserRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    evidenceBucket.grantRead(summariserRole);
    cmk.grantDecrypt(summariserRole);
    summariserRole.addToPolicy(new iam.PolicyStatement({
      actions:   ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/era/ai/*`],
    }));
    summariserRole.addToPolicy(new iam.PolicyStatement({
      actions:   ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:era/*`],
    }));
    // Allow RDS access via VPC (no IAM policy needed — uses pg credentials)

    const summariserFn = new lambda.Function(this, 'IncidentSummariser', {
      functionName:  `era-incident-summariser-${deployEnv}`,
      runtime:       lambda.Runtime.NODEJS_20_X,
      handler:       'incidentSummariser.handler',
      code:          lambda.Code.fromAsset('../server/src/lambda'),
      role:          summariserRole,
      timeout:       cdk.Duration.seconds(60),
      memorySize:    512,
      environment: {
        NODE_ENV:     deployEnv,
        LLM_USE_MOCK: 'false',
        SSM_USE_MOCK: 'false',
      },
    });

    summariserFn.addEventSource(
      new lambdaEventSources.SqsEventSource(this.summarisationQueue, {
        batchSize:               1,
        reportBatchItemFailures: true,
      })
    );

    // ── OpenSearch Domain ─────────────────────────────────────────────────────
    this.openSearchDomain = new opensearch.Domain(this, 'AnalyticsDomain', {
      domainName:    `era-analytics-${deployEnv}`,
      version:       opensearch.EngineVersion.OPENSEARCH_2_11,
      capacity: {
        dataNodes:           deployEnv === 'prod' ? 3 : 1,
        dataNodeInstanceType: 't3.medium.search',
      },
      ebs: {
        volumeSize: 20,   // GB per node
        volumeType: cdk.aws_ec2.EbsDeviceVolumeType.GP3,
      },
      encryptionAtRest: { enabled: true },
      nodeToNodeEncryption: true,
      enforceHttps: true,
      accessPolicies: [
        new iam.PolicyStatement({
          principals: [new iam.ArnPrincipal(lambdaRole.roleArn)],
          actions:    ['es:ESHttpGet', 'es:ESHttpPut', 'es:ESHttpPost'],
          resources:  ['*'],
        }),
      ],
    });

    // ── EMR Cluster (nightly Spark analytics) ─────────────────────────────────
    const emrRole = new iam.Role(this, 'EmrServiceRole', {
      assumedBy: new iam.ServicePrincipal('elasticmapreduce.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonElasticMapReduceRole'),
      ],
    });
    const emrEc2Role = new iam.Role(this, 'EmrEc2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonElasticMapReduceforEC2Role'),
      ],
    });
    const emrEc2InstanceProfile = new iam.CfnInstanceProfile(this, 'EmrEc2Profile', {
      roles: [emrEc2Role.roleName],
    });
    emrEc2Role.addToPolicy(new iam.PolicyStatement({
      actions:   ['secretsmanager:GetSecretValue'],
      resources: [rdsSecretArn],
    }));
    evidenceBucket.grantRead(emrEc2Role);

    const emrCluster = new emr.CfnCluster(this, 'AnalyticsCluster', {
      name:           `era-analytics-${deployEnv}`,
      releaseLabel:   'emr-7.1.0',
      serviceRole:    emrRole.roleName,
      jobFlowRole:    emrEc2InstanceProfile.ref,
      visibleToAllUsers: true,
      applications: [{ name: 'Spark' }, { name: 'Hadoop' }],
      instances: {
        masterInstanceGroup: {
          instanceCount: 1,
          instanceType:  'm5.xlarge',
        },
        coreInstanceGroup: {
          instanceCount: deployEnv === 'prod' ? 2 : 1,
          instanceType:  'm5.xlarge',
        },
        keepJobFlowAliveWhenNoSteps: false,  // Terminate after steps complete
        terminationProtected:        false,
      },
      configurations: [
        {
          classification: 'spark-defaults',
          configurationProperties: {
            'spark.sql.extensions':            'org.apache.spark.sql.delta.DeltaSparkSessionExtension',
            'spark.driver.memory':             '4g',
            'spark.executor.memory':           '4g',
          },
        },
      ],
      steps: [
        {
          name:             'crime-pattern-analytics',
          actionOnFailure:  'CONTINUE',
          hadoopJarStep: {
            jar:  'command-runner.jar',
            args: [
              'spark-submit',
              '--deploy-mode', 'cluster',
              '--master',      'yarn',
              `s3://${evidenceBucket.bucketName}/emr-scripts/crime_pattern_analytics.py`,
            ],
          },
        },
      ],
    });

    // ── EventBridge Rule: nightly cron at 02:00 UTC ───────────────────────────
    // Triggers a new transient EMR cluster run each night.
    const analyticsScheduleRole = new iam.Role(this, 'AnalyticsScheduleRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    analyticsScheduleRole.addToPolicy(new iam.PolicyStatement({
      actions:   ['elasticmapreduce:RunJobFlow'],
      resources: ['*'],
    }));

    new events.Rule(this, 'NightlyAnalyticsCron', {
      ruleName:    `era-nightly-analytics-${deployEnv}`,
      description: 'Trigger crime-pattern-analytics EMR job nightly at 02:00 UTC',
      schedule:    events.Schedule.cron({ hour: '2', minute: '0' }),
      targets: [
        // Lambda that submits a new EMR RunJobFlow API call with the Spark step
        new targets.LambdaFunction(
          new lambda.Function(this, 'EmrTriggerFn', {
            functionName: `era-emr-trigger-${deployEnv}`,
            runtime:      lambda.Runtime.NODEJS_20_X,
            handler:      'index.handler',
            code:         lambda.Code.fromInline(`
              const { EMRClient, RunJobFlowCommand } = require('@aws-sdk/client-emr');
              exports.handler = async () => {
                const client = new EMRClient({ region: process.env.AWS_REGION });
                const params = JSON.parse(process.env.JOB_FLOW_PARAMS);
                await client.send(new RunJobFlowCommand(params));
                console.log('[emr-trigger] RunJobFlow submitted');
              };
            `),
            environment: {
              JOB_FLOW_PARAMS: JSON.stringify({
                Name:          `era-analytics-${deployEnv}-nightly`,
                ReleaseLabel:  'emr-7.1.0',
                ServiceRole:   emrRole.roleName,
                JobFlowRole:   emrEc2InstanceProfile.ref,
                Applications:  [{ Name: 'Spark' }],
                Instances: {
                  MasterInstanceGroup: { InstanceCount: 1, InstanceType: 'm5.xlarge' },
                  CoreInstanceGroup:   { InstanceCount: 1, InstanceType: 'm5.xlarge' },
                  KeepJobFlowAliveWhenNoSteps: false,
                },
                Steps: [{
                  Name:            'crime-pattern-analytics',
                  ActionOnFailure: 'CONTINUE',
                  HadoopJarStep: {
                    Jar:  'command-runner.jar',
                    Args: ['spark-submit', '--deploy-mode', 'cluster',
                           `s3://${evidenceBucket.bucketName}/emr-scripts/crime_pattern_analytics.py`],
                  },
                }],
              }),
            },
            timeout: cdk.Duration.seconds(30),
          }),
          { retryAttempts: 1 }
        ),
      ],
    });

    // ── Stack outputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'SummarisationQueueUrl',   { value: this.summarisationQueue.queueUrl });
    new cdk.CfnOutput(this, 'AiResultsTableName',      { value: this.aiResultsTable.tableName });
    new cdk.CfnOutput(this, 'OpenSearchEndpoint',      { value: this.openSearchDomain.domainEndpoint });
    new cdk.CfnOutput(this, 'ThreatClassifierFnArn',   { value: threatClassifierFn.functionArn });
    new cdk.CfnOutput(this, 'ThreatClassifierAliasArn',{ value: tcAlias.functionArn });
  }
}
