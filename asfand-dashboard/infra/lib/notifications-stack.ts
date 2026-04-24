/**
 * Module 6 — SNS topics (incident-updates, admin-digest) + DynamoDB + Lambda
 * subscribers on emergency-alerts for SMS and FCM push.
 */
import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

interface NotificationsStackProps extends cdk.StackProps {
  deployEnv: string;
  emergencyAlertsTopic: sns.ITopic;
}

export class NotificationsStack extends cdk.Stack {
  public readonly incidentUpdatesTopic: sns.Topic;
  public readonly adminDigestTopic: sns.Topic;
  public readonly deviceTokensTable: dynamodb.Table;
  public readonly notificationLogTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: NotificationsStackProps) {
    super(scope, id, props);

    const { deployEnv, emergencyAlertsTopic } = props;

    this.incidentUpdatesTopic = new sns.Topic(this, 'IncidentUpdatesTopic', {
      topicName:   `incident-updates-${deployEnv}`,
      displayName: 'ERA Incident status updates',
    });

    this.adminDigestTopic = new sns.Topic(this, 'AdminDigestTopic', {
      topicName:   `admin-digest-${deployEnv}`,
      displayName: 'ERA Admin daily digest',
    });

    this.deviceTokensTable = new dynamodb.Table(this, 'DeviceTokensTable', {
      tableName:           `device_tokens_${deployEnv}`,
      partitionKey:        { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey:             { name: 'device_id', type: dynamodb.AttributeType.STRING },
      billingMode:         dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    this.notificationLogTable = new dynamodb.Table(this, 'NotificationLogTable', {
      tableName:           `notification_log_${deployEnv}`,
      partitionKey:        { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode:         dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    const lambdaRole = new iam.Role(this, 'NotificationLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.deviceTokensTable.grantReadWriteData(lambdaRole);
    this.notificationLogTable.grantWriteData(lambdaRole);
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions:   ['sns:Publish'],
      resources: ['*'],
    }));

    const commonEnv = {
      DEVICE_TOKENS_TABLE:      this.deviceTokensTable.tableName,
      NOTIFICATION_LOG_TABLE:   this.notificationLogTable.tableName,
      SNS_INCIDENT_UPDATES_ARN: this.incidentUpdatesTopic.topicArn,
      SNS_ADMIN_DIGEST_ARN:     this.adminDigestTopic.topicArn,
      SMS_DISPATCH_USE_MOCK:    'false',
      FCM_USE_MOCK:             'false',
      NOTIFICATION_LOG_DISABLED:  'false',
      DEVICE_TOKENS_USE_MOCK:   'false',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
    };

    const smsFn = new lambda.Function(this, 'SmsDispatcher', {
      functionName: `era-sms-dispatcher-${deployEnv}`,
      runtime:      lambda.Runtime.NODEJS_20_X,
      handler:      'src/lambda/smsDispatcher.handler',
      code:         lambda.Code.fromAsset('../server'),
      role:         lambdaRole,
      timeout:      cdk.Duration.seconds(30),
      environment:  { ...commonEnv },
    });

    const pushFn = new lambda.Function(this, 'PushDispatcher', {
      functionName: `era-push-dispatcher-${deployEnv}`,
      runtime:      lambda.Runtime.NODEJS_20_X,
      handler:      'src/lambda/pushDispatcher.handler',
      code:         lambda.Code.fromAsset('../server'),
      role:         lambdaRole,
      timeout:      cdk.Duration.seconds(30),
      environment:  { ...commonEnv },
    });

    smsFn.addEventSource(new lambdaEventSources.SnsEventSource(emergencyAlertsTopic));
    pushFn.addEventSource(new lambdaEventSources.SnsEventSource(emergencyAlertsTopic));

    new cdk.CfnOutput(this, 'IncidentUpdatesTopicArn', { value: this.incidentUpdatesTopic.topicArn });
    new cdk.CfnOutput(this, 'AdminDigestTopicArn', { value: this.adminDigestTopic.topicArn });
  }
}
