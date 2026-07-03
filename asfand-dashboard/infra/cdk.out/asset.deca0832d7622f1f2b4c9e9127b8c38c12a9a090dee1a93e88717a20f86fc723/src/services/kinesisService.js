import { KinesisClient, PutRecordCommand } from '@aws-sdk/client-kinesis';

const STREAM = () => process.env.KINESIS_INCIDENT_STREAM ?? 'incident-events';

/** @type {KinesisClient | null} */
let kinesisClient = null;

function getClient() {
  if (!kinesisClient) {
    kinesisClient = new KinesisClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return kinesisClient;
}

/** @type {Array<{streamName: string, partitionKey: string, data: unknown}>} */
let mockQueue = [];

/** @type {Array<(record: unknown) => void>} */
let mockConsumers = [];

export function useMock() {
  return process.env.KINESIS_USE_MOCK === 'true';
}

/**
 * @param {string} partitionKey
 * @param {unknown} data
 */
export async function publishToKinesis(partitionKey, data) {
  const streamName = STREAM();

  if (useMock()) {
    const record = { streamName, partitionKey, data };
    mockQueue.push(record);
    for (const c of mockConsumers) {
      try { c(record); } catch {}
    }
    return;
  }

  const payload = JSON.stringify(data);
  await getClient().send(
    new PutRecordCommand({
      StreamName: streamName,
      PartitionKey: partitionKey,
      Data: Buffer.from(payload, 'utf8'),
    })
  );
}

/** @param {(record: unknown) => void} fn */
export function subscribeKinesisMock(fn) {
  mockConsumers.push(fn);
  return () => { mockConsumers = mockConsumers.filter((c) => c !== fn); };
}

export function __getKinesisMockQueue() { return [...mockQueue]; }
export function __clearKinesisMock() {
  mockQueue = [];
  mockConsumers = [];
}
