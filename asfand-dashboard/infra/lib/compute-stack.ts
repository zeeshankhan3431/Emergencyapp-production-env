/**
 * STACK 3 — Compute: Kinesis, SQS, Lambda, HTTP API + Cognito, optional SageMaker endpoints.
 * Depends on DataStack (data plane + VPC).
 */
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import type { EnvironmentContext } from './env-config';

const NODE_RUNTIME = lambda.Runtime.NODEJS_20_X;
const ARM = lambda.Architecture.ARM_64;
const LAMBDA_CODE = lambda.Code.fromAsset('../server');

const HTTP_HEALTH = `
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ok: true, service: 'era-health' }),
});
`;

export interface ObservedLambda {
  readonly fn: lambda.IFunction;
  readonly id: string;
  readonly timeout: cdk.Duration;
}

export interface ComputeStackProps extends cdk.StackProps {
  deployEnv: string;
  envConfig: EnvironmentContext;
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  rdsInstance: rds.DatabaseInstance;
  rdsSecret: secretsmanager.ISecret;
  evidenceBucket: s3.IBucket;
  transcriptsBucket: s3.IBucket;
  reportsBucket: s3.IBucket;
  openSearchDomain: opensearch.IDomain;
  redisEndpointAddress: string;
  redisEndpointPort: string;
  /** Optional: when set with image + data URIs, creates SageMaker real-time endpoints. */
  readonly sageMakerThreatModelDataUrl?: string;
  readonly sageMakerThreatImageUri?: string;
  readonly sageMakerGeoModelDataUrl?: string;
  readonly sageMakerGeoImageUri?: string;
}

export class ComputeStack extends cdk.Stack {
  public readonly incidentEventsStream: kinesis.Stream;
  public readonly transcriptionQueue: sqs.Queue;
  public readonly summarisationQueue: sqs.Queue;
  public readonly notificationJobsQueue: sqs.Queue;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly smsTopic: sns.Topic;
  public readonly pushTopic: sns.Topic;
  public readonly observedLambdas: ObservedLambda[] = [];

  public readonly realtimeThreatClassifier: lambda.Function;
  public readonly evidenceProcessor: lambda.Function;
  public readonly audioTranscriptionWorker: lambda.Function;
  public readonly incidentSummariser: lambda.Function;
  public readonly incidentEscalationHandler: lambda.Function;
  public readonly smsDispatcher: lambda.Function;
  public readonly pushDispatcher: lambda.Function;
  public readonly monthlyReportGenerator: lambda.Function;
  public readonly healthCheckFn: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const {
      deployEnv,
      envConfig,
      vpc,
      lambdaSecurityGroup,
      rdsInstance,
      rdsSecret,
      evidenceBucket,
      transcriptsBucket,
      reportsBucket,
      openSearchDomain,
      redisEndpointAddress,
      redisEndpointPort,
    } = props;

    const logRetention = logs.RetentionDays.THREE_MONTHS;

    const commonLambdaProps: Omit<lambda.FunctionProps, 'timeout' | 'memorySize' | 'functionName' | 'handler'> = {
      runtime: NODE_RUNTIME,
      architecture: ARM,
      code: LAMBDA_CODE,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      tracing: lambda.Tracing.ACTIVE,
      logRetention,
    };

    const baseEnv = {
      DEPLOY_ENV: deployEnv,
      RDS_SECRET_ARN: rdsSecret.secretArn,
      RDS_HOST: rdsInstance.instanceEndpoint.hostname,
      RDS_PORT: rdsInstance.instanceEndpoint.port.toString(),
      OPENSEARCH_ENDPOINT: openSearchDomain.domainEndpoint,
      REDIS_HOST: redisEndpointAddress,
      REDIS_PORT: redisEndpointPort,
      EVIDENCE_BUCKET: evidenceBucket.bucketName,
      TRANSCRIPTS_BUCKET: transcriptsBucket.bucketName,
      REPORTS_BUCKET: reportsBucket.bucketName,
    };

    // ── Kinesis ─────────────────────────────────────────────────────────────
    this.incidentEventsStream = new kinesis.Stream(this, 'IncidentEvents', {
      streamName: `incident-events-${deployEnv}`,
      shardCount: envConfig.kinesisShardCount,
      retentionPeriod: cdk.Duration.hours(envConfig.kinesisRetentionHours),
    });

    // ── SQS (+ DLQ, SSE-SQS) ────────────────────────────────────────────────
    const mkQueue = (logicalId: string, queueName: string) => {
      const dlq = new sqs.Queue(this, `${logicalId}Dlq`, {
        queueName: `${queueName}-${deployEnv}-dlq`,
        retentionPeriod: cdk.Duration.days(14),
        encryption: sqs.QueueEncryption.SQS_MANAGED,
      });
      const q = new sqs.Queue(this, logicalId, {
        queueName: `${queueName}-${deployEnv}`,
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
        visibilityTimeout: cdk.Duration.minutes(16),
      });
      return q;
    };

    this.transcriptionQueue = mkQueue('TranscriptionJobs', 'transcription-jobs');
    this.summarisationQueue = mkQueue('SummarisationJobs', 'summarisation-jobs');
    this.notificationJobsQueue = mkQueue('NotificationJobs', 'notification-jobs');

    // ── Cognito ─────────────────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `era-users-${deployEnv}`,
      selfSignUpEnabled: deployEnv !== 'prod',
      signInAliases: { email: true },
      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `era-app-client-${deployEnv}`,
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: true },
    });

    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`;
    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer('JwtAuthorizer', issuer, {
      jwtAudience: [this.userPoolClient.userPoolClientId],
    });

    // ── SNS (SMS / push dispatchers) ───────────────────────────────────────
    this.smsTopic = new sns.Topic(this, 'SmsTopic', {
      topicName: `era-sms-${deployEnv}`,
      displayName: `ERA SMS ${deployEnv}`,
    });
    this.pushTopic = new sns.Topic(this, 'PushTopic', {
      topicName: `era-push-${deployEnv}`,
      displayName: `ERA Push ${deployEnv}`,
    });

    // SSM /era/ai/* parameters are pre-provisioned (scripts/setup-aws-ssm.sh).
    // Lambdas read them at runtime; IAM grants ssm:GetParameter below.

    const mkFn = (
      name: string,
      overrides: Partial<lambda.FunctionProps> & Pick<lambda.FunctionProps, 'functionName' | 'memorySize' | 'timeout' | 'handler'>
    ): lambda.Function => {
      const f = new lambda.Function(this, name, {
        ...commonLambdaProps,
        ...overrides,
        environment: { ...baseEnv, ...overrides.environment },
      });
      rdsSecret.grantRead(f);
      evidenceBucket.grantReadWrite(f);
      transcriptsBucket.grantReadWrite(f);
      reportsBucket.grantReadWrite(f);
      openSearchDomain.grantReadWrite(f);
      f.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter', 'ssm:GetParameters'],
          resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/era/ai/*`],
        })
      );
      f.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:BatchWriteItem',
            'dynamodb:BatchGetItem',
          ],
          resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/*_${deployEnv}`],
        })
      );
      this.observedLambdas.push({
        fn: f,
        id: name,
        timeout: overrides.timeout ?? cdk.Duration.seconds(30),
      });
      return f;
    };

    // ── Lambdas ─────────────────────────────────────────────────────────────
    this.realtimeThreatClassifier = mkFn('RealtimeThreatClassifierFn', {
      functionName: `realtime-threat-classifier-${deployEnv}`,
      handler: 'src/lambda/realtimeThreatClassifier.handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
    });
    this.realtimeThreatClassifier.addEventSource(
      new lambdaEventSources.KinesisEventSource(this.incidentEventsStream, {
        batchSize: 100,
        startingPosition: lambda.StartingPosition.LATEST,
      })
    );

    this.evidenceProcessor = mkFn('EvidenceProcessorFn', {
      functionName: `evidence-processor-${deployEnv}`,
      handler: 'src/lambda/evidenceProcessor.handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
    });
    new events.Rule(this, 'EvidenceObjectCreated', {
      description: 'Route evidence uploads to evidence-processor (avoids cross-stack S3 notification cycle)',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: { bucket: { name: [evidenceBucket.bucketName] } },
      },
      targets: [new targets.LambdaFunction(this.evidenceProcessor)],
    });

    this.audioTranscriptionWorker = mkFn('AudioTranscriptionWorkerFn', {
      functionName: `audio-transcription-worker-${deployEnv}`,
      handler: 'src/lambda/audioTranscriptionWorker.handler',
      memorySize: 1024,
      timeout: cdk.Duration.minutes(15),
      environment: { TRANSCRIPTION_QUEUE_URL: this.transcriptionQueue.queueUrl },
    });
    this.transcriptionQueue.grantConsumeMessages(this.audioTranscriptionWorker);
    this.audioTranscriptionWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(this.transcriptionQueue, { batchSize: 1 })
    );

    this.incidentSummariser = mkFn('IncidentSummariserFn', {
      functionName: `incident-summariser-${deployEnv}`,
      handler: 'src/lambda/incidentSummariser.handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      environment: { SUMMARISATION_QUEUE_URL: this.summarisationQueue.queueUrl },
    });
    this.summarisationQueue.grantConsumeMessages(this.incidentSummariser);
    this.incidentSummariser.addEventSource(
      new lambdaEventSources.SqsEventSource(this.summarisationQueue, { batchSize: 5 })
    );

    this.incidentEscalationHandler = mkFn('IncidentEscalationHandlerFn', {
      functionName: `incident-escalation-handler-${deployEnv}`,
      handler: 'src/lambda/incidentEscalationHandler.handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
    });
    this.incidentEscalationHandler.addEventSource(
      new lambdaEventSources.KinesisEventSource(this.incidentEventsStream, {
        batchSize: 100,
        startingPosition: lambda.StartingPosition.LATEST,
      })
    );

    this.smsDispatcher = mkFn('SmsDispatcherFn', {
      functionName: `sms-dispatcher-${deployEnv}`,
      handler: 'src/lambda/smsDispatcher.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
    });
    this.smsTopic.addSubscription(new snsSubscriptions.LambdaSubscription(this.smsDispatcher));

    this.pushDispatcher = mkFn('PushDispatcherFn', {
      functionName: `push-dispatcher-${deployEnv}`,
      handler: 'src/lambda/pushDispatcher.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
    });
    this.pushTopic.addSubscription(new snsSubscriptions.LambdaSubscription(this.pushDispatcher));

    this.monthlyReportGenerator = mkFn('MonthlyReportGeneratorFn', {
      functionName: `monthly-report-generator-${deployEnv}`,
      handler: 'src/lambda/monthlyReportGenerator.handler',
      memorySize: 1024,
      timeout: cdk.Duration.minutes(5),
    });

    this.healthCheckFn = new lambda.Function(this, 'HealthCheckFn', {
      ...commonLambdaProps,
      functionName: `era-health-${deployEnv}`,
      handler: 'index.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      code: lambda.Code.fromInline(HTTP_HEALTH),
      environment: baseEnv,
    });
    this.observedLambdas.push({
      fn: this.healthCheckFn,
      id: 'HealthCheckFn',
      timeout: cdk.Duration.seconds(5),
    });

    new events.Rule(this, 'MonthlyReportCron', {
      ruleName: `era-monthly-report-${deployEnv}`,
      schedule: events.Schedule.cron({ minute: '0', hour: '8', day: '1', month: '*', year: '*' }),
      targets: [new targets.LambdaFunction(this.monthlyReportGenerator)],
    });

    // ── HTTP API ────────────────────────────────────────────────────────────
    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `era-http-${deployEnv}`,
      description: 'Emergency response HTTP API',
      corsPreflight: {
        allowHeaders: ['Authorization', 'Content-Type', 'Cookie', 'X-Registration-Secret'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: ['https://d3kj7wc3d0h4x7.cloudfront.net'],
        allowCredentials: true,
      },
    });

    this.httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2Integrations.HttpLambdaIntegration('Health', this.healthCheckFn),
    });

    this.httpApi.addRoutes({
      path: '/reports/monthly',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2Integrations.HttpLambdaIntegration('MonthlyReport', this.monthlyReportGenerator),
      authorizer: jwtAuthorizer,
    });

    // ── SageMaker (optional real-time endpoints) ───────────────────────────
    const smRole = new iam.Role(this, 'SageMakerExecRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess')],
    });
    evidenceBucket.grantRead(smRole);
    rdsSecret.grantRead(smRole);

    const instanceType = envConfig.sageMakerInferenceInstanceType;

    const maybeEndpoint = (
      logical: string,
      endpointName: string,
      modelName: string,
      modelDataUrl?: string,
      imageUri?: string
    ) => {
      if (!modelDataUrl || !imageUri) {
        return;
      }
      const model = new sagemaker.CfnModel(this, `${logical}Model`, {
        modelName: `${modelName}-${deployEnv}`,
        executionRoleArn: smRole.roleArn,
        primaryContainer: {
          image: imageUri,
          modelDataUrl: modelDataUrl,
        },
      });
      const cfg = new sagemaker.CfnEndpointConfig(this, `${logical}Cfg`, {
        productionVariants: [
          {
            variantName: 'AllTraffic',
            modelName: model.modelName,
            initialInstanceCount: 1,
            instanceType,
          },
        ],
      });
      cfg.addDependency(model);
      const ep = new sagemaker.CfnEndpoint(this, `${logical}Ep`, {
        endpointName,
        endpointConfigName: cfg.attrEndpointConfigName,
      });
      ep.addDependency(cfg);
    };

    maybeEndpoint(
      'ThreatClassifier',
      `threat-classifier-v2-${deployEnv}`,
      `era-threat-mdl-${deployEnv}`,
      props.sageMakerThreatModelDataUrl,
      props.sageMakerThreatImageUri
    );
    maybeEndpoint(
      'GeoAnomaly',
      `geo-anomaly-v1-${deployEnv}`,
      `era-geo-mdl-${deployEnv}`,
      props.sageMakerGeoModelDataUrl,
      props.sageMakerGeoImageUri
    );

    new cdk.CfnOutput(this, 'HttpApiUrl', { value: this.httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'IncidentStreamName', { value: this.incidentEventsStream.streamName });
  }
}
