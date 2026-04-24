import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';

interface EvidenceStorageProps extends cdk.StackProps {
  deployEnv: string;
}

export class EvidenceStorageStack extends cdk.Stack {
  /** Exported for cross-stack reference */
  public readonly evidenceBucket: s3.Bucket;
  public readonly transcriptionQueue: sqs.Queue;
  public readonly evidenceCmk: kms.Key;

  constructor(scope: Construct, id: string, props: EvidenceStorageProps) {
    super(scope, id, props);

    const { deployEnv } = props;

    // ── Customer-Managed KMS Key ────────────────────────────────────────────
    this.evidenceCmk = new kms.Key(this, 'EvidenceCmk', {
      alias: `alias/era-evidence-${deployEnv}`,
      description: 'CMK for ERA evidence bucket SSE-KMS',
      enableKeyRotation: true,
      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── Access logs bucket (no SSE-KMS — must be server-managed) ───────────
    const accessLogsBucket = new s3.Bucket(this, 'EvidenceAccessLogs', {
      bucketName: `era-evidence-access-logs-${deployEnv}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(365), id: 'ExpireOldLogs' }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Evidence bucket ─────────────────────────────────────────────────────
    this.evidenceBucket = new s3.Bucket(this, 'EvidenceBucket', {
      bucketName: `era-evidence-${deployEnv}-${this.account}`,

      // Encryption: SSE-KMS with CMK
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.evidenceCmk,
      bucketKeyEnabled: true,   // reduces KMS API calls & cost

      // Access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      enforceSSL: true,

      // Versioning — required for evidence integrity
      versioned: true,

      // Access logs
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `evidence-bucket/`,

      // CORS: allow mobile presigned PUT
      cors: [{
        allowedOrigins: ['*'],
        allowedMethods: [s3.HttpMethods.PUT],
        allowedHeaders: ['Content-Type', 'Content-Length', 'x-amz-checksum-sha256'],
        maxAge: 300,
      }],

      // Lifecycle
      lifecycleRules: [
        {
          id: 'GlacierAfter90Days',
          enabled: true,
          transitions: [{
            storageClass: s3.StorageClass.GLACIER,
            transitionAfter: cdk.Duration.days(90),
          }],
        },
        {
          id: 'DeleteAfter7Years',
          enabled: true,
          expiration: cdk.Duration.days(365 * 7),
          noncurrentVersionExpiration: cdk.Duration.days(365),
        },
        {
          id: 'AbortIncompleteMultipart',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],

      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: deployEnv !== 'prod',
    });

    // ── Bucket policy: deny any GetObject not from presigned URL or Lambda role ──
    // The bucket already blocks public access. The policy below enforces
    // that only the Lambda execution role (and presigned URL holders) can read.
    // Presigned URLs carry the signer's credentials — the Lambda IAM role.
    this.evidenceBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyNonPresignedGet',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:GetObject'],
      resources: [this.evidenceBucket.arnForObjects('*')],
      conditions: {
        // Block direct S3 console / unsigned access
        StringNotEquals: {
          's3:authType': 'REST-QUERY-STRING',
        },
        ArnNotLike: {
          // Replace with actual Lambda execution role ARN at deploy time
          'aws:PrincipalArn': `arn:aws:iam::${this.account}:role/era-evidence-processor-role-*`,
        },
      },
    }));

    // ── SQS FIFO transcription jobs queue ──────────────────────────────────
    const dlq = new sqs.Queue(this, 'TranscriptionDlq', {
      queueName: `transcription-jobs-dlq-${deployEnv}.fifo`,
      fifo: true,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: this.evidenceCmk,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.transcriptionQueue = new sqs.Queue(this, 'TranscriptionQueue', {
      queueName: `transcription-jobs-${deployEnv}.fifo`,
      fifo: true,
      contentBasedDeduplication: true,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: this.evidenceCmk,
      visibilityTimeout: cdk.Duration.minutes(15),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    // ── DynamoDB evidence_audit_log ─────────────────────────────────────────
    const auditTable = new dynamodb.Table(this, 'EvidenceAuditLog', {
      tableName: `evidence_audit_log_${deployEnv}`,
      partitionKey: { name: 'evidence_id',      type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'event_timestamp',  type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.evidenceCmk,
      pointInTimeRecovery: true,
      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── Lambda: evidence-processor ──────────────────────────────────────────
    const processorRole = new iam.Role(this, 'EvidenceProcessorRole', {
      roleName: `era-evidence-processor-role-${deployEnv}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Minimal S3 permissions
    this.evidenceBucket.grantRead(processorRole);
    this.evidenceBucket.grantPutAcl(processorRole);

    this.evidenceCmk.grantDecrypt(processorRole);
    this.evidenceCmk.grantEncrypt(processorRole);
    this.transcriptionQueue.grantSendMessages(processorRole);
    auditTable.grantWriteData(processorRole);

    const processorFn = new lambda.Function(this, 'EvidenceProcessor', {
      functionName: `era-evidence-processor-${deployEnv}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'src/lambda/evidenceProcessor.handler',
      code: lambda.Code.fromAsset('../server'),
      role: processorRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        S3_EVIDENCE_BUCKET:         this.evidenceBucket.bucketName,
        SQS_TRANSCRIPTION_QUEUE_URL: this.transcriptionQueue.queueUrl,
        EVIDENCE_AUDIT_TABLE:        auditTable.tableName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
      reservedConcurrentExecutions: 100,
    });

    // Trigger Lambda on S3 PutObject
    this.evidenceBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(processorFn)
    );

    // ── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'EvidenceBucketName', { value: this.evidenceBucket.bucketName });
    new cdk.CfnOutput(this, 'TranscriptionQueueUrl', { value: this.transcriptionQueue.queueUrl });
    new cdk.CfnOutput(this, 'EvidenceCmkArn', { value: this.evidenceCmk.keyArn });
  }
}
