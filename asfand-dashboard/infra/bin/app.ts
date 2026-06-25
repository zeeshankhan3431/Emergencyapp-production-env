#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { loadEnvConfig } from '../lib/env-config';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { HostingStack } from '../lib/hosting-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const deployEnv = (app.node.tryGetContext('deployEnv') as string) ?? 'dev';
const envConfig = loadEnvConfig(app.node, deployEnv);

const adminAlertEmail =
  (app.node.tryGetContext('adminAlertEmail') as string) ?? 'ops@example.com';

const network = new NetworkStack(app, `EraNetwork-${deployEnv}`, {
  env,
  stackName: `EraNetwork-${deployEnv}`,
  deployEnv,
});

const data = new DataStack(app, `EraData-${deployEnv}`, {
  env,
  stackName: `EraData-${deployEnv}`,
  deployEnv,
  envConfig,
  vpc: network.vpc,
  lambdaSecurityGroup: network.lambdaSecurityGroup,
  rdsSecurityGroup: network.rdsSecurityGroup,
  elasticacheSecurityGroup: network.elasticacheSecurityGroup,
});
data.addDependency(network);

const compute = new ComputeStack(app, `EraCompute-${deployEnv}`, {
  env,
  stackName: `EraCompute-${deployEnv}`,
  deployEnv,
  envConfig,
  vpc: network.vpc,
  lambdaSecurityGroup: network.lambdaSecurityGroup,
  rdsInstance: data.rdsInstance,
  rdsSecret: data.rdsSecret,
  evidenceBucket: data.evidenceBucket,
  transcriptsBucket: data.transcriptsBucket,
  reportsBucket: data.reportsBucket,
  openSearchDomain: data.openSearchDomain,
  redisEndpointAddress: data.redisEndpointAddress,
  redisEndpointPort: data.redisEndpointPort,
  sageMakerThreatModelDataUrl: app.node.tryGetContext('sageMakerThreatModelDataUrl') as string | undefined,
  sageMakerThreatImageUri: app.node.tryGetContext('sageMakerThreatImageUri') as string | undefined,
  sageMakerGeoModelDataUrl: app.node.tryGetContext('sageMakerGeoModelDataUrl') as string | undefined,
  sageMakerGeoImageUri: app.node.tryGetContext('sageMakerGeoImageUri') as string | undefined,
});
compute.addDependency(data);

const observability = new ObservabilityStack(app, `EraObservability-${deployEnv}`, {
  env,
  stackName: `EraObservability-${deployEnv}`,
  deployEnv,
  envConfig,
  adminAlertEmail,
  incidentStream: compute.incidentEventsStream,
  rdsInstance: data.rdsInstance,
  httpApi: compute.httpApi,
  observedLambdas: compute.observedLambdas,
  audioTranscriptionFnName: compute.audioTranscriptionWorker.functionName,
  incidentSummariserFnName: compute.incidentSummariser.functionName,
  escalationHandlerFnName: compute.incidentEscalationHandler.functionName,
});
observability.addDependency(compute);

const hosting = new HostingStack(app, `EraHosting-${deployEnv}`, {
  env,
  stackName: `EraHosting-${deployEnv}`,
  deployEnv,
  envConfig,
  vpc: network.vpc,
  rdsSecurityGroup: network.rdsSecurityGroup,
  elasticacheSecurityGroup: network.elasticacheSecurityGroup,
  rdsInstance: data.rdsInstance,
  rdsSecret: data.rdsSecret,
  userPoolId: compute.userPool.userPoolId,
  userPoolClientId: compute.userPoolClient.userPoolClientId,
  incidentStreamName: compute.incidentEventsStream.streamName,
  evidenceBucketName: data.evidenceBucket.bucketName,
  transcriptsBucketName: data.transcriptsBucket.bucketName,
  reportsBucketName: data.reportsBucket.bucketName,
  transcriptionQueueUrl: compute.transcriptionQueue.queueUrl,
  summarisationQueueUrl: compute.summarisationQueue.queueUrl,
  openSearchEndpoint: data.openSearchDomain.domainEndpoint,
  redisEndpointAddress: data.redisEndpointAddress,
  redisEndpointPort: data.redisEndpointPort,
});
hosting.addDependency(compute);
