/**
 * CMS safety tips — DynamoDB `content` table (mock in tests).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = () => process.env.CONTENT_TABLE ?? 'era_content';

/** @type {DynamoDBDocumentClient | null} */
let doc = null;
function getDoc() {
  if (!doc) {
    const c = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    doc = DynamoDBDocumentClient.from(c, { marshallOptions: { removeUndefinedValues: true } });
  }
  return doc;
}

const DEFAULT_TIPS = [
  { id: 'tip-1', title: 'Stay aware', body: 'Keep headphones volume low in public spaces.', order: 1 },
  { id: 'tip-2', title: 'Share location', body: 'Tell a trusted contact when travelling alone at night.', order: 2 },
];

/** @type {typeof DEFAULT_TIPS} */
let mockTips = [...DEFAULT_TIPS];

export function useMock() {
  return process.env.CONTENT_USE_MOCK === 'true';
}

/**
 * @returns {Promise<Array<{ id: string, title: string, body: string, order?: number }>>}
 */
export async function listSafetyTips() {
  if (useMock()) {
    return mockTips.map((t) => ({ ...t }));
  }
  const res = await getDoc().send(
    new ScanCommand({
      TableName:              TABLE(),
      FilterExpression:       '#t = :safety',
      ExpressionAttributeNames: { '#t': 'content_type' },
      ExpressionAttributeValues: { ':safety': 'safety_tip' },
    })
  );
  const items = res.Items ?? [];
  return items
    .map((it) => ({
      id:    String(it.id ?? it.sk ?? ''),
      title: String(it.title ?? ''),
      body:  String(it.body ?? ''),
      order: Number(it.sort_order ?? 0),
    }))
    .sort((a, b) => a.order - b.order);
}

export function __setSafetyTipsMock(tips) {
  mockTips = tips.length ? tips.map((t) => ({ ...t })) : [...DEFAULT_TIPS];
}

export function __resetSafetyTipsMock() {
  mockTips = DEFAULT_TIPS.map((t) => ({ ...t }));
}
