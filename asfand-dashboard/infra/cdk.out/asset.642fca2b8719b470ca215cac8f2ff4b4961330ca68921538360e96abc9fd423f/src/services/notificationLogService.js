/**
 * DynamoDB: notification delivery log (SMS / push / digest).
 */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = () => process.env.NOTIFICATION_LOG_TABLE ?? 'notification_log';

/** @type {DynamoDBDocumentClient | null} */
let doc = null;
function getDoc() {
  if (!doc) {
    const c = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    doc = DynamoDBDocumentClient.from(c, { marshallOptions: { removeUndefinedValues: true } });
  }
  return doc;
}

/** @type {Array<Record<string, unknown>>} */
const mem = [];

export function useMock() {
  return process.env.NOTIFICATION_LOG_DISABLED === 'true';
}

/**
 * @param {{
 *   channel: 'sms'|'push'|'email',
 *   status: string,
 *   userId?: string,
 *   incidentId?: string,
 *   detail?: string,
 * }} p
 */
export async function logNotification(p) {
  const item = {
    id:            randomUUID(),
    event_time:    new Date().toISOString(),
    channel:       p.channel,
    status:        p.status,
    user_id:       p.userId ?? null,
    incident_id:   p.incidentId ?? null,
    detail:        p.detail ?? null,
  };
  if (useMock()) {
    mem.push(item);
    return item;
  }
  await getDoc().send(new PutCommand({ TableName: TABLE(), Item: item }));
  return item;
}

export function __getNotificationLogMock() { return [...mem]; }
export function __clearNotificationLogMock() { mem.length = 0; }
