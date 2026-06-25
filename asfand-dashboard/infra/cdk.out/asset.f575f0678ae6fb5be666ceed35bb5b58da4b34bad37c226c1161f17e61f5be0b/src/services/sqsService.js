import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';

/** @type {SQSClient | null} */
let sqsClient = null;

function getClient() {
  if (!sqsClient) {
    sqsClient = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return sqsClient;
}

/** @type {Array<{ queueUrl: string, messageGroupId?: string, body: unknown }>} */
let mockQueue = [];

export function useMock() {
  return process.env.SQS_USE_MOCK === 'true';
}

/**
 * @param {{ queueUrl: string, body: unknown, messageGroupId?: string, deduplicationId?: string }} p
 */
export async function sendSqsMessage(p) {
  if (useMock()) {
    mockQueue.push({ queueUrl: p.queueUrl, messageGroupId: p.messageGroupId, body: p.body });
    return { messageId: randomUUID() };
  }
  const res = await getClient().send(
    new SendMessageCommand({
      QueueUrl: p.queueUrl,
      MessageBody: JSON.stringify(p.body),
      MessageGroupId: p.messageGroupId,
      MessageDeduplicationId: p.deduplicationId ?? randomUUID(),
    })
  );
  return { messageId: res.MessageId };
}

export function __getSqsMockQueue() { return [...mockQueue]; }
export function __clearSqsMock() { mockQueue = []; }
