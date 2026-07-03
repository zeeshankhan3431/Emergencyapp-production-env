/**
 * Evidence audit log — DynamoDB table: evidence_audit_log
 * PK: evidence_id, SK: event_timestamp
 * Actions: uploaded | accessed | verified | rejected | deleted
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = () => process.env.EVIDENCE_AUDIT_TABLE ?? 'evidence_audit_log';

/** @type {DynamoDBDocumentClient | null} */
let docClient = null;

function getClient() {
  if (!docClient) {
    const ddb = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    docClient = DynamoDBDocumentClient.from(ddb, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

/** @type {Array<Record<string,unknown>>} */
let memoryLog = [];

function useMock() {
  return process.env.EVIDENCE_AUDIT_DISABLED === 'true';
}

/**
 * @param {{
 *   evidenceId: string;
 *   incidentId: string;
 *   userId?: string | null;
 *   action: 'uploaded' | 'accessed' | 'verified' | 'rejected' | 'deleted';
 *   ipAddress?: string | null;
 *   s3Key: string;
 *   metadata?: Record<string, unknown>;
 * }} p
 */
export async function logEvidenceEvent(p) {
  const item = {
    evidence_id: p.evidenceId,
    event_timestamp: new Date().toISOString(),
    incident_id: p.incidentId,
    user_id: p.userId ?? null,
    action: p.action,
    ip_address: p.ipAddress ?? null,
    s3_key: p.s3Key,
    ...p.metadata,
  };

  if (useMock()) {
    memoryLog.push(item);
    return;
  }

  try {
    await getClient().send(new PutCommand({ TableName: TABLE(), Item: item }));
  } catch (err) {
    console.error('[evidence-audit] DynamoDB write failed', err);
    memoryLog.push(item);
  }
}

/**
 * Query audit history for an evidence ID (Admin use).
 * @param {string} evidenceId
 */
export async function queryEvidenceAudit(evidenceId) {
  if (useMock()) {
    return memoryLog.filter((r) => r.evidence_id === evidenceId);
  }
  const res = await getClient().send(
    new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'evidence_id = :eid',
      ExpressionAttributeValues: { ':eid': evidenceId },
      ScanIndexForward: true,
    })
  );
  return res.Items ?? [];
}

export function __getEvidenceAuditMemoryLog() { return [...memoryLog]; }
export function __clearEvidenceAuditLog() { memoryLog = []; }
