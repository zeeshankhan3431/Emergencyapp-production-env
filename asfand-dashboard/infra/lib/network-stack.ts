/**
 * STACK 1 — Network: VPC, NAT, security groups, gateway endpoints (S3, DynamoDB).
 * Independently deployable; exports VPC + SGs for DataStack / ComputeStack.
 */
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkStackProps extends cdk.StackProps {
  deployEnv: string;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;
  public readonly elasticacheSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { deployEnv } = props;

    this.vpc = new ec2.Vpc(this, 'EraVpc', {
      vpcName:               `era-vpc-${deployEnv}`,
      maxAzs:                2,
      natGateways:             2,
      subnetConfiguration: [
        {
          name:       'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask:   24,
        },
        {
          name:       'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask:   24,
        },
      ],
    });

    // Gateway endpoints — no NAT charge for S3 / DynamoDB
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc:               this.vpc,
      securityGroupName: `era-lambda-sg-${deployEnv}`,
      description:       'Lambda / API compute',
      allowAllOutbound:  true,
    });

    this.elasticacheSecurityGroup = new ec2.SecurityGroup(this, 'ElastiCacheSg', {
      vpc:               this.vpc,
      securityGroupName: `era-elasticache-sg-${deployEnv}`,
      description:       'ElastiCache Redis',
      allowAllOutbound:  false,
    });
    this.elasticacheSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(6379),
      'Redis from Lambda'
    );

    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc:               this.vpc,
      securityGroupName: `era-rds-sg-${deployEnv}`,
      description:       'RDS PostgreSQL',
      allowAllOutbound:  false,
    });
    this.rdsSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Postgres from Lambda'
    );

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, 'LambdaSgId', { value: this.lambdaSecurityGroup.securityGroupId });
    new cdk.CfnOutput(this, 'RdsSgId', { value: this.rdsSecurityGroup.securityGroupId });
    new cdk.CfnOutput(this, 'ElastiCacheSgId', { value: this.elasticacheSecurityGroup.securityGroupId });
  }
}
