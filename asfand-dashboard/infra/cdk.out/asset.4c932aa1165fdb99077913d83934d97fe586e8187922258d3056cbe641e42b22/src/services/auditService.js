import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

/** @type {DynamoDBDocumentClient | null} */
let docClient = null;

/** @type {Array<Record<string, unknown>>} */
let memoryAudit = [];

function getDocClient() {
  if (process.env.AUDIT_LOG_DISABLED === 'true') return null;
  if (!docClient) {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    const ddb = new DynamoDBClient({ region });
    docClient = DynamoDBDocumentClient.from(ddb, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

const TABLE = () => process.env.AUDIT_LOG_TABLE ?? 'audit_log';

/**
 * @param {{
 *   userId: string;
 *   action: string;
 *   ip?: string | null;
 *   userAgent?: string | null;
 *   statusCode?: number;
 * }} p
 */
export async function logAuditEvent(p) {
  const item = {
    id: randomUUID(),
    user_id: p.userId,
    action: p.action,
    timestamp: new Date().toISOString(),
    ip: p.ip ?? null,
    user_agent: p.userAgent ?? null,
    status_code: p.statusCode ?? null,
  };

  const client = getDocClient();
  if (!client) {
    memoryAudit.push(item);
    return;
  }

  try {
    await client.send(
      new PutCommand({
        TableName: TABLE(),
        Item: item,
      })
    );
  } catch (err) {
    console.error('[audit] failed to write audit log', err);
    memoryAudit.push(item);
  }
}

/** For tests */
export function __getMemoryAuditLog() {
  return [...memoryAudit];
}

export function __clearMemoryAuditLog() {
  memoryAudit = [];
}
