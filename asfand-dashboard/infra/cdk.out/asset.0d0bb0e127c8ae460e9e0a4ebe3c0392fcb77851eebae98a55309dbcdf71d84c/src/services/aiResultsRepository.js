/**
 * DynamoDB table: ai_results
 * PK: incident_id  SK: inference_timestamp
 * Stores every AI inference result — enables A/B model analysis.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = () => process.env.AI_RESULTS_TABLE ?? 'ai_results';

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

/** @type {Array<Record<string, unknown>>} */
let memoryStore = [];

function useMock() {
  return process.env.AI_RESULTS_DISABLED === 'true';
}

/**
 * @param {{
 *   incidentId: string;
 *   confidence: number;
 *   anomalyScore: number;
 *   urgencyScore: number;
 *   classifiedType: string;
 *   anomalyType: string;
 *   threatModelVersion: string;
 *   geoModelVersion: string;
 *   track: 'A' | 'B';
 * }} p
 */
export async function writeAiResult(p) {
  const item = {
    incident_id:          p.incidentId,
    inference_timestamp:  new Date().toISOString(),
    confidence:           p.confidence,
    anomaly_score:        p.anomalyScore,
    urgency_score:        p.urgencyScore,
    classified_type:      p.classifiedType,
    anomaly_type:         p.anomalyType,
    threat_model_version: p.threatModelVersion,
    geo_model_version:    p.geoModelVersion,
    track:                p.track,
  };

  if (useMock()) {
    memoryStore.push(item);
    return item;
  }

  try {
    await getClient().send(new PutCommand({ TableName: TABLE(), Item: item }));
  } catch (err) {
    console.error('[ai-results] DynamoDB write failed', err);
    memoryStore.push(item);
  }
  return item;
}

/** @param {string} incidentId */
export async function queryAiResults(incidentId) {
  if (useMock()) {
    return memoryStore.filter((r) => r.incident_id === incidentId);
  }
  const res = await getClient().send(
    new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'incident_id = :id',
      ExpressionAttributeValues: { ':id': incidentId },
      ScanIndexForward: false,
    })
  );
  return res.Items ?? [];
}

export function __getAiResultsMemory() { return [...memoryStore]; }
export function __clearAiResultsMemory() { memoryStore = []; }
