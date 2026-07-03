/**
 * DynamoDB: device FCM tokens per user + device.
 * PK: user_id  SK: device_id
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = () => process.env.DEVICE_TOKENS_TABLE ?? 'device_tokens';

/** @type {DynamoDBDocumentClient | null} */
let doc = null;
function getDoc() {
  if (!doc) {
    const c = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    doc = DynamoDBDocumentClient.from(c, { marshallOptions: { removeUndefinedValues: true } });
  }
  return doc;
}

/** @type {Map<string, Array<Record<string, unknown>>>} */
const mem = new Map();

export function useMock() {
  return process.env.DEVICE_TOKENS_USE_MOCK === 'true';
}

function key(userId, deviceId) {
  return `${userId}#${deviceId}`;
}

/**
 * @param {{ userId: string, deviceId: string, fcmToken: string, platform: 'ios'|'android' }} p
 */
export async function upsertDeviceToken(p) {
  const item = {
    user_id:     p.userId,
    device_id:   p.deviceId,
    fcm_token:   p.fcmToken,
    platform:    p.platform,
    updated_at:  new Date().toISOString(),
  };
  if (useMock()) {
    const k = key(p.userId, p.deviceId);
    mem.set(k, item);
    return item;
  }
  await getDoc().send(new PutCommand({ TableName: TABLE(), Item: item }));
  return item;
}

/**
 * @param {string} userId
 */
export async function listTokensForUser(userId) {
  if (useMock()) {
    const out = [];
    for (const [k, v] of mem) {
      if (k.startsWith(`${userId}#`)) out.push(v);
    }
    return out;
  }
  const res = await getDoc().send(
    new QueryCommand({
      TableName:              TABLE(),
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId },
    })
  );
  return res.Items ?? [];
}

/**
 * @param {string} userId
 * @param {string} deviceId
 */
export async function deleteDeviceToken(userId, deviceId) {
  if (useMock()) {
    mem.delete(key(userId, deviceId));
    return true;
  }
  await getDoc().send(
    new DeleteCommand({
      TableName: TABLE(),
      Key:       { user_id: userId, device_id: deviceId },
    })
  );
  return true;
}

/**
 * Remove token row by fcm_token (e.g. unregistered device).
 * @param {string} fcmToken
 */
export async function deleteByFcmToken(fcmToken) {
  if (useMock()) {
    for (const [k, v] of mem) {
      if (v.fcm_token === fcmToken) {
        mem.delete(k);
        return true;
      }
    }
    return false;
  }
  // Production: require GSI on fcm_token — scan omitted for cost; callers pass userId+deviceId
  return false;
}

export function __clearDeviceTokensMock() {
  mem.clear();
}
