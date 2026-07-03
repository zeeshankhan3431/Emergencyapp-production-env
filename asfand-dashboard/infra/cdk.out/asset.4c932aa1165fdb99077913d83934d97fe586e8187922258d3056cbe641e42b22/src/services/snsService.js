import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const TOPIC = () => process.env.SNS_EMERGENCY_ALERTS_ARN ?? 'arn:aws:sns:us-east-1:000000000000:emergency-alerts';

/** @type {SNSClient | null} */
let snsClient = null;

function getClient() {
  if (!snsClient) {
    snsClient = new SNSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return snsClient;
}

/** @type {Array<{topicArn: string, subject: string, message: unknown}>} */
let mockPublished = [];

export function useMock() {
  return process.env.SNS_USE_MOCK === 'true';
}

/**
 * @param {{ subject: string, message: unknown, topicArn?: string }} p
 */
export async function publishToSns(p) {
  const topicArn = p.topicArn ?? TOPIC();
  const messageStr = typeof p.message === 'string' ? p.message : JSON.stringify(p.message);

  if (useMock()) {
    mockPublished.push({ topicArn, subject: p.subject, message: p.message });
    return;
  }

  await getClient().send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: p.subject,
      Message: messageStr,
    })
  );
}

export function __getSnsMockPublished() { return [...mockPublished]; }
export function __clearSnsMock() { mockPublished = []; }
