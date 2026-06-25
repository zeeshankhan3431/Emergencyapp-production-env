/**
 * STACK 5 — Hosting: ECS Fargate API (ALB) + S3/CloudFront dashboard.
 * Depends on NetworkStack, DataStack, ComputeStack.
 */
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import type { EnvironmentContext } from './env-config';

export interface HostingStackProps extends cdk.StackProps {
  deployEnv: string;
  envConfig: EnvironmentContext;
  vpc: ec2.IVpc;
  rdsSecurityGroup: ec2.ISecurityGroup;
  elasticacheSecurityGroup: ec2.ISecurityGroup;
  rdsInstance: rds.DatabaseInstance;
  rdsSecret: secretsmanager.ISecret;
  userPoolId: string;
  userPoolClientId: string;
  incidentStreamName: string;
  evidenceBucketName: string;
  transcriptsBucketName: string;
  reportsBucketName: string;
  transcriptionQueueUrl: string;
  summarisationQueueUrl: string;
  openSearchEndpoint: string;
  redisEndpointAddress: string;
  redisEndpointPort: string;
}

export class HostingStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly dashboardUrl: string;
  public readonly dashboardBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);

    const { deployEnv, vpc, rdsInstance, rdsSecret } = props;

    // ── ECS Fargate API behind ALB ───────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'ApiCluster', {
      vpc,
      clusterName: `era-api-${deployEnv}`,
      containerInsights: true,
    });

    const logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/era/api/${deployEnv}`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: `era/jwt/${deployEnv}`,
      generateSecretString: {
        passwordLength: 48,
        excludeCharacters: '"@/\\',
      },
    });

    const fargate = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      cluster,
      serviceName: `era-api-${deployEnv}`,
      cpu: deployEnv === 'prod' ? 1024 : 512,
      memoryLimitMiB: deployEnv === 'prod' ? 2048 : 1024,
      desiredCount: deployEnv === 'prod' ? 2 : 1,
      publicLoadBalancer: true,
      assignPublicIp: false,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset('../server', {
          file: 'Dockerfile',
        }),
        containerPort: 3001,
        enableLogging: true,
        logDriver: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup }),
        environment: {
          NODE_ENV: 'production',
          PORT: '3001',
          DEPLOY_ENV: deployEnv,
          SKIP_AUTH: 'false',
          COGNITO_USE_MOCK: 'false',
          RUN_MIGRATIONS: 'true',
          RDS_HOST: rdsInstance.instanceEndpoint.hostname,
          RDS_PORT: rdsInstance.instanceEndpoint.port.toString(),
          RDS_USER: 'era_admin',
          RDS_DATABASE: 'emergencydb',
          AWS_REGION: this.region,
          COGNITO_USER_POOL_ID: props.userPoolId,
          COGNITO_CLIENT_ID: props.userPoolClientId,
          KINESIS_STREAM_NAME: props.incidentStreamName,
          S3_EVIDENCE_BUCKET: props.evidenceBucketName,
          TRANSCRIPTS_BUCKET: props.transcriptsBucketName,
          REPORTS_BUCKET: props.reportsBucketName,
          TRANSCRIPTION_QUEUE_URL: props.transcriptionQueueUrl,
          SUMMARISATION_QUEUE_URL: props.summarisationQueueUrl,
          OPENSEARCH_ENDPOINT: props.openSearchEndpoint,
          REDIS_HOST: props.redisEndpointAddress,
          REDIS_PORT: props.redisEndpointPort,
          REGISTRATION_ROLE_SECRET: 'era-dev-admin-secret',
        },
        secrets: {
          RDS_PASSWORD: ecs.Secret.fromSecretsManager(rdsSecret, 'password'),
          JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
        },
      },
      healthCheckGracePeriod: cdk.Duration.seconds(120),
    });

    fargate.targetGroup.configureHealthCheck({
      path: '/api/health',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
    });

    // CfnSecurityGroupIngress in this stack (not addIngressRule on Network SGs) avoids a
    // cross-stack cycle: Network → Hosting → … → Network.
    const ecsTaskSg = fargate.service.connections.securityGroups[0];
    new ec2.CfnSecurityGroupIngress(this, 'RdsFromEcs', {
      groupId: props.rdsSecurityGroup.securityGroupId,
      sourceSecurityGroupId: ecsTaskSg.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      description: 'Postgres from ECS API',
    });
    new ec2.CfnSecurityGroupIngress(this, 'RedisFromEcs', {
      groupId: props.elasticacheSecurityGroup.securityGroupId,
      sourceSecurityGroupId: ecsTaskSg.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 6379,
      toPort: 6379,
      description: 'Redis from ECS API',
    });

    // Allow HTTPS inbound from CloudFront to ALB for /api/* path
    const albSg = fargate.loadBalancer.connections.securityGroups[0];
    new ec2.CfnSecurityGroupIngress(this, 'CloudFrontToAlb', {
      groupId: albSg.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 443,
      toPort: 443,
      cidrIp: '0.0.0.0/0',
      description: 'HTTPS from CloudFront to ALB',
    });
    // Also allow HTTP for local/dev testing
    new ec2.CfnSecurityGroupIngress(this, 'HttpFromCloudFront', {
      groupId: albSg.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      cidrIp: '0.0.0.0/0',
      description: 'HTTP from CloudFront to ALB',
    });

    // Grant task role access to AWS services
    const taskRole = fargate.taskDefinition.taskRole;
    rdsSecret.grantRead(taskRole);
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:InitiateAuth',
          'cognito-idp:SignUp',
          'cognito-idp:ForgotPassword',
          'cognito-idp:ConfirmForgotPassword',
          'cognito-idp:AdminConfirmSignUp',
        ],
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${props.userPoolId}`],
      })
    );
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['kinesis:PutRecord', 'kinesis:PutRecords'],
        resources: [`arn:aws:kinesis:${this.region}:${this.account}:stream/${props.incidentStreamName}`],
      })
    );
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        resources: [
          `arn:aws:s3:::${props.evidenceBucketName}`,
          `arn:aws:s3:::${props.evidenceBucketName}/*`,
          `arn:aws:s3:::${props.transcriptsBucketName}`,
          `arn:aws:s3:::${props.transcriptsBucketName}/*`,
          `arn:aws:s3:::${props.reportsBucketName}`,
          `arn:aws:s3:::${props.reportsBucketName}/*`,
        ],
      })
    );
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage', 'sqs:GetQueueUrl'],
        resources: [`arn:aws:sqs:${this.region}:${this.account}:*`],
      })
    );
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:*'],
        resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/*_${deployEnv}`],
      })
    );

    this.apiUrl = `http://${fargate.loadBalancer.loadBalancerDnsName}`;
    const apiOrigin = new origins.HttpOrigin(fargate.loadBalancer.loadBalancerDnsName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
    });

    // ── S3 + CloudFront for dashboard SPA ────────────────────────────────────
    this.dashboardBucket = new s3.Bucket(this, 'DashboardBucket', {
      bucketName: `era-dashboard-${deployEnv}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: deployEnv !== 'prod',
    });

    const oai = new cloudfront.OriginAccessIdentity(this, 'DashboardOai', {
      comment: `ERA dashboard ${deployEnv}`,
    });
    this.dashboardBucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(this, 'DashboardCdn', {
      comment: `ERA dashboard ${deployEnv}`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.dashboardBucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      geoRestriction: cloudfront.GeoRestriction.allowlist('US', 'PK'),
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    this.dashboardUrl = `https://${distribution.distributionDomainName}`;

    new cdk.CfnOutput(this, 'ApiLoadBalancerUrl', { value: this.apiUrl });
    new cdk.CfnOutput(this, 'DashboardBucketName', { value: this.dashboardBucket.bucketName });
    new cdk.CfnOutput(this, 'DashboardCloudFrontUrl', { value: this.dashboardUrl });
    new cdk.CfnOutput(this, 'DashboardDistributionId', { value: distribution.distributionId });
  }
}