/**
 * CDK environment configuration — loaded from cdk.json context `environments.{deployEnv}`.
 */
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface EnvironmentContext {
  /** RDS PostgreSQL */
  rdsMultiAz: boolean;
  rdsInstanceIdentifier: string;
  rdsAllocatedStorageGiB: number;
  rdsBackupRetentionDays: number;
  /** DynamoDB */
  dynamoPointInTimeRecovery: boolean;
  /** ElastiCache Redis */
  redisEngineVersion: string;
  redisNumCacheNodes: number;
  /** OpenSearch */
  openSearchDataNodes: number;
  openSearchDedicatedMasterNodes: number;
  openSearchInstanceType: string;
  openSearchVolumeSizeGiB: number;
  /** Kinesis */
  kinesisShardCount: number;
  kinesisRetentionHours: number;
  /** SageMaker real-time inference (optional; omit model URIs to skip endpoint creation) */
  sageMakerInferenceInstanceType: string;
  /** CloudWatch */
  logRetentionDays: number;
  /** Alarm thresholds */
  lambdaErrorRateThresholdPercent: number;
  kinesisIteratorAgeMsThreshold: number;
  rdsCpuThresholdPercent: number;
}

const DEFAULT_DEV: EnvironmentContext = {
  rdsMultiAz: false,
  rdsInstanceIdentifier: 't3.medium',
  rdsAllocatedStorageGiB: 100,
  rdsBackupRetentionDays: 7,
  dynamoPointInTimeRecovery: true,
  redisEngineVersion: '7.0',
  redisNumCacheNodes: 1,
  openSearchDataNodes: 1,
  openSearchDedicatedMasterNodes: 0,
  openSearchInstanceType: 't3.small.search',
  openSearchVolumeSizeGiB: 20,
  kinesisShardCount: 2,
  kinesisRetentionHours: 24,
  sageMakerInferenceInstanceType: 'ml.t2.medium',
  logRetentionDays: 90,
  lambdaErrorRateThresholdPercent: 1,
  kinesisIteratorAgeMsThreshold: 30000,
  rdsCpuThresholdPercent: 80,
};

function merge(base: EnvironmentContext, patch?: Partial<EnvironmentContext>): EnvironmentContext {
  return { ...base, ...patch };
}

/**
 * @param {import('constructs').IConstruct} node — typically `app.node`
 * @param {string} deployEnv — dev | staging | prod
 */
export function loadEnvConfig(node: { tryGetContext: (k: string) => unknown }, deployEnv: string): EnvironmentContext {
  const envs = node.tryGetContext('environments') as Record<string, Partial<EnvironmentContext>> | undefined;
  const patch = envs?.[deployEnv];
  const base =
    deployEnv === 'prod'
      ? merge(DEFAULT_DEV, {
          rdsMultiAz: true,
          redisNumCacheNodes: 2,
          openSearchDataNodes: 3,
          openSearchDedicatedMasterNodes: 3,
          rdsBackupRetentionDays: 14,
          sageMakerInferenceInstanceType: 'ml.m5.xlarge',
        })
    : deployEnv === 'staging'
      ? merge(DEFAULT_DEV, {
          rdsMultiAz: true,
          redisNumCacheNodes: 1,
          openSearchDataNodes: 2,
          openSearchDedicatedMasterNodes: 0,
          sageMakerInferenceInstanceType: 'ml.m5.large',
        })
      : { ...DEFAULT_DEV };

  return merge(base, patch);
}

/** Map string like "t3.medium" to InstanceType */
export function instanceTypeFromString(s: string): ec2.InstanceType {
  const [cls, sizeRaw] = s.split('.');
  const map: Record<string, keyof typeof ec2.InstanceClass> = {
    t3: 'T3',
    t4g: 'T4G',
    r6g: 'R6G',
  };
  const ic = map[cls] ?? 'T3';
  const sizeKey = sizeRaw?.toLowerCase() ?? 'medium';
  const sizes: Record<string, ec2.InstanceSize> = {
    nano: ec2.InstanceSize.NANO,
    micro: ec2.InstanceSize.MICRO,
    small: ec2.InstanceSize.SMALL,
    medium: ec2.InstanceSize.MEDIUM,
    large: ec2.InstanceSize.LARGE,
    xlarge: ec2.InstanceSize.XLARGE,
    '2xlarge': ec2.InstanceSize.XLARGE2,
    '4xlarge': ec2.InstanceSize.XLARGE4,
    '8xlarge': ec2.InstanceSize.XLARGE8,
  };
  return ec2.InstanceType.of(ec2.InstanceClass[ic], sizes[sizeKey] ?? ec2.InstanceSize.MEDIUM);
}
