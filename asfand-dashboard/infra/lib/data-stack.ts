/**
 * STACK 2 — Data: RDS (PG15), DynamoDB, ElastiCache, OpenSearch, S3.
 * Depends on NetworkStack (VPC + security groups).
 */
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import type { EnvironmentContext } from './env-config';

export interface DataStackProps extends cdk.StackProps {
  deployEnv: string;
  envConfig: EnvironmentContext;
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  rdsSecurityGroup: ec2.ISecurityGroup;
  elasticacheSecurityGroup: ec2.ISecurityGroup;
}

export class DataStack extends cdk.Stack {
  public readonly rdsInstance: rds.DatabaseInstance;
  public readonly rdsSecret: secretsmanager.ISecret;
  public readonly dataKmsKey: kms.Key;
  public readonly s3KmsKey: kms.Key;
  public readonly evidenceBucket: s3.Bucket;
  public readonly transcriptsBucket: s3.Bucket;
  public readonly reportsBucket: s3.Bucket;
  public readonly accessLogsBucket: s3.Bucket;
  public readonly openSearchDomain: opensearch.Domain;
  public readonly redisReplicationGroup?: elasticache.CfnReplicationGroup;
  public readonly redisCluster?: elasticache.CfnCacheCluster;
  /** Primary Redis hostname for app/Lambda env (replication group primary or single cluster). */
  public readonly redisEndpointAddress: string;
  public readonly redisEndpointPort: string;
  public readonly openSearchSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const {
      deployEnv,
      envConfig,
      vpc,
      lambdaSecurityGroup,
      rdsSecurityGroup,
      elasticacheSecurityGroup,
    } = props;

    this.dataKmsKey = new kms.Key(this, 'DataKms', {
      alias:             `alias/era-data-${deployEnv}`,
      description:       'RDS + application data CMK',
      enableKeyRotation: true,
      removalPolicy:     deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.s3KmsKey = new kms.Key(this, 'S3Kms', {
      alias:             `alias/era-s3-${deployEnv}`,
      description:       'S3 SSE-KMS buckets',
      enableKeyRotation: true,
      removalPolicy:     deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── OpenSearch security group (HTTPS from Lambda) ───────────────────────
    this.openSearchSecurityGroup = new ec2.SecurityGroup(this, 'OpenSearchSg', {
      vpc,
      securityGroupName: `era-opensearch-sg-${deployEnv}`,
      description:       'OpenSearch / managed cluster',
      allowAllOutbound:  true,
    });
    this.openSearchSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(443),
      'HTTPS from Lambda'
    );

    // ── RDS PostgreSQL 15 ──────────────────────────────────────────────────
    this.rdsSecret = new secretsmanager.Secret(this, 'RdsCredentials', {
      secretName: `era/rds/${deployEnv}/credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'era_admin' }),
        generateStringKey:    'password',
        excludeCharacters:    '"@/\\',
      },
    });

    const rdsSubnetGroup = new rds.SubnetGroup(this, 'RdsSubnets', {
      vpc,
      description: 'Private subnets for ERA RDS',
      vpcSubnets:  { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    this.rdsInstance = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      subnetGroup: rdsSubnetGroup,
      securityGroups: [rdsSecurityGroup],
      credentials: rds.Credentials.fromSecret(this.rdsSecret),
      allocatedStorage: envConfig.rdsAllocatedStorageGiB,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      storageEncryptionKey: this.dataKmsKey,
      multiAz: envConfig.rdsMultiAz,
      backupRetention: cdk.Duration.days(envConfig.rdsBackupRetentionDays),
      monitoringInterval: cdk.Duration.seconds(60),
      enablePerformanceInsights: true,
      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: deployEnv === 'prod',
      databaseName: 'emergencydb',
    });

    this.rdsSecret.addRotationSchedule('RdsRotation', {
      automaticallyAfter: cdk.Duration.days(30),
      hostedRotation: secretsmanager.HostedRotation.postgreSqlSingleUser({
        functionName: `era-rds-rotate-${deployEnv}`,
      }),
    });

    // ── ElastiCache Redis ───────────────────────────────────────────────────
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: `ERA Redis ${deployEnv}`,
      subnetIds:   vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
    });

    const redisParamGroup = new elasticache.CfnParameterGroup(this, 'RedisParams', {
      cacheParameterGroupFamily: 'redis7',
      description:             'ERA Redis 7',
      properties:              { 'maxmemory-policy': 'volatile-lru' },
    });

    if (deployEnv === 'prod' && envConfig.redisNumCacheNodes >= 2) {
      this.redisReplicationGroup = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
        replicationGroupDescription: `era-redis-${deployEnv}`,
        engine:                      'redis',
        engineVersion:               envConfig.redisEngineVersion,
        cacheNodeType:               'cache.t3.micro',
        numCacheClusters:            envConfig.redisNumCacheNodes,
        automaticFailoverEnabled:    true,
        multiAzEnabled:              true,
        cacheSubnetGroupName:        redisSubnetGroup.ref,
        securityGroupIds:            [elasticacheSecurityGroup.securityGroupId],
        cacheParameterGroupName:     redisParamGroup.ref,
      });
      this.redisReplicationGroup.addDependency(redisSubnetGroup);
      this.redisEndpointAddress = this.redisReplicationGroup.attrPrimaryEndPointAddress;
      this.redisEndpointPort = this.redisReplicationGroup.attrPrimaryEndPointPort;
    } else {
      this.redisCluster = new elasticache.CfnCacheCluster(this, 'RedisSingle', {
        engine:               'redis',
        engineVersion:          envConfig.redisEngineVersion,
        cacheNodeType:          'cache.t3.micro',
        numCacheNodes:          1,
        vpcSecurityGroupIds:    [elasticacheSecurityGroup.securityGroupId],
        cacheSubnetGroupName:   redisSubnetGroup.ref,
        cacheParameterGroupName: redisParamGroup.ref,
      });
      this.redisCluster.addDependency(redisSubnetGroup);
      this.redisEndpointAddress = this.redisCluster.attrRedisEndpointAddress;
      this.redisEndpointPort = this.redisCluster.attrRedisEndpointPort;
    }

    // ── DynamoDB (PAY_PER_REQUEST, PITR, AWS-owned encryption) ─────────────
    const ddbDefaults: Partial<dynamodb.TableProps> = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: envConfig.dynamoPointInTimeRecovery,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    };

    new dynamodb.Table(this, 'RefreshTokens', {
      tableName: `refresh_tokens_${deployEnv}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      ...ddbDefaults,
    });

    new dynamodb.Table(this, 'EvidenceAuditLog', {
      tableName: `evidence_audit_log_${deployEnv}`,
      partitionKey: { name: 'evidence_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'event_timestamp', type: dynamodb.AttributeType.STRING },
      ...ddbDefaults,
    });

    new dynamodb.Table(this, 'AiResults', {
      tableName: `ai_results_${deployEnv}`,
      partitionKey: { name: 'incident_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'inference_timestamp', type: dynamodb.AttributeType.STRING },
      ...ddbDefaults,
    });

    new dynamodb.Table(this, 'NotificationLog', {
      tableName: `notification_log_${deployEnv}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      ...ddbDefaults,
    });

    new dynamodb.Table(this, 'DeviceTokens', {
      tableName: `device_tokens_${deployEnv}`,
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'device_id', type: dynamodb.AttributeType.STRING },
      ...ddbDefaults,
    });

    new dynamodb.Table(this, 'ReportsIndex', {
      tableName: `reports_index_${deployEnv}`,
      partitionKey: { name: 'report_key', type: dynamodb.AttributeType.STRING },
      ...ddbDefaults,
    });

    new dynamodb.Table(this, 'AuditLog', {
      tableName: `audit_log_${deployEnv}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      ...ddbDefaults,
    });

    new dynamodb.Table(this, 'Content', {
      tableName: `content_${deployEnv}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      ...ddbDefaults,
    });

    // ── OpenSearch ───────────────────────────────────────────────────────────
    const osDataNodes = envConfig.openSearchDataNodes;
    const dedicatedMaster = envConfig.openSearchDedicatedMasterNodes;

    this.openSearchDomain = new opensearch.Domain(this, 'OpenSearch', {
      domainName: `era-search-${deployEnv}`,
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      capacity: {
        dataNodes: osDataNodes,
        dataNodeInstanceType: envConfig.openSearchInstanceType,
        ...(dedicatedMaster > 0
          ? {
              masterNodes: dedicatedMaster,
              masterNodeInstanceType: envConfig.openSearchInstanceType,
            }
          : {}),
      },
      ebs: {
        volumeSize: envConfig.openSearchVolumeSizeGiB,
        volumeType: cdk.aws_ec2.EbsDeviceVolumeType.GP3,
      },
      vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroups: [this.openSearchSecurityGroup],
      encryptionAtRest: { enabled: true },
      nodeToNodeEncryption: true,
      enforceHttps: true,
      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── S3 buckets (SSE-KMS, versioning, access logs) ──────────────────────
    this.accessLogsBucket = new s3.Bucket(this, 'AccessLogs', {
      bucketName: `era-access-logs-${deployEnv}-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.s3KmsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const mkDataBucket = (id: string, name: string, extra?: Partial<s3.BucketProps>) =>
      new s3.Bucket(this, id, {
        bucketName: `${name}-${deployEnv}-${this.account}`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: this.s3KmsKey,
        bucketKeyEnabled: true,
        versioned: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        serverAccessLogsBucket: this.accessLogsBucket,
        serverAccessLogsPrefix: `${name}/`,
        removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: deployEnv !== 'prod',
        ...extra,
      });

    // EventBridge must be enabled so ComputeStack can subscribe without a cyclic S3→Lambda dependency.
    this.evidenceBucket = mkDataBucket('Evidence', 'era-evidence', { eventBridgeEnabled: true });
    this.transcriptsBucket = mkDataBucket('Transcripts', 'era-transcripts');
    this.reportsBucket = mkDataBucket('Reports', 'era-reports');

    new cdk.CfnOutput(this, 'RdsEndpoint', { value: this.rdsInstance.instanceEndpoint.hostname });
    new cdk.CfnOutput(this, 'RdsSecretArn', { value: this.rdsSecret.secretArn });
    new cdk.CfnOutput(this, 'OpenSearchEndpoint', { value: this.openSearchDomain.domainEndpoint });
    new cdk.CfnOutput(this, 'EvidenceBucketName', { value: this.evidenceBucket.bucketName });
  }
}
