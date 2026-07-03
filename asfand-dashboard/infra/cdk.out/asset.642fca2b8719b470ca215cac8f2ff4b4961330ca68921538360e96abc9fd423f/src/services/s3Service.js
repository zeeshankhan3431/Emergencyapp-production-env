/**
 * S3 service — presigned URLs, object tagging, checksum verification.
 * All presigned URL generation is server-side; the backend never stores or
 * serves plaintext audio bytes.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectTaggingCommand,
  GetObjectAttributesCommand,
  ObjectAttributes,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';

const EVIDENCE_BUCKET = () => process.env.S3_EVIDENCE_BUCKET ?? 'era-evidence-dev';

/** @type {S3Client | null} */
let s3Client = null;

function getClient() {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return s3Client;
}

// ─── Mock store ──────────────────────────────────────────────────────────────

/**
 * @type {Map<string, {
 *   checksum: string; size: number; tags: Record<string,string>;
 *   uploaded: boolean; content?: Buffer;
 * }>}
 */
const mockStore = new Map();

export function useMock() {
  return process.env.S3_USE_MOCK === 'true';
}

/** Register a mock S3 object (used by tests simulating client upload) */
export function __mockS3PutObject(key, opts = {}) {
  mockStore.set(key, {
    checksum: opts.checksum ?? '',
    size: opts.size ?? 0,
    tags: {},
    uploaded: true,
    content: opts.content ?? Buffer.alloc(0),
  });
}
export function __clearS3Mock() { mockStore.clear(); }
export function __getS3MockStore() { return mockStore; }

// ─── Presigned Upload URL (PUT) ───────────────────────────────────────────────

const UPLOAD_TTL_SEC = 5 * 60;   // 5 minutes
const ACCESS_TTL_SEC = 15 * 60;  // 15 minutes
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export { UPLOAD_TTL_SEC, ACCESS_TTL_SEC, MAX_SIZE_BYTES };

/**
 * @param {{ key: string, fileSizeBytes: number, checksumSha256: string }} p
 * @returns {Promise<string>} presigned PUT URL
 */
export async function generateUploadPresignedUrl(p) {
  if (p.fileSizeBytes > MAX_SIZE_BYTES) {
    throw Object.assign(new Error(`File too large: max ${MAX_SIZE_BYTES} bytes`), { status: 413 });
  }

  if (useMock()) {
    return `https://mock-s3.example.com/${encodeURIComponent(p.key)}?X-Amz-Expires=${UPLOAD_TTL_SEC}&X-Amz-Signature=mock`;
  }

  const cmd = new PutObjectCommand({
    Bucket: EVIDENCE_BUCKET(),
    Key: p.key,
    ContentLength: p.fileSizeBytes,
    ChecksumSHA256: p.checksumSha256,
    ServerSideEncryption: 'aws:kms',
    Metadata: { 'expected-checksum': p.checksumSha256 },
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: UPLOAD_TTL_SEC });
}

/**
 * @param {string} key
 * @returns {Promise<string>} presigned GET URL (15-minute TTL, Admin only)
 */
export async function generateDownloadPresignedUrl(key) {
  if (useMock()) {
    return `https://mock-s3.example.com/${encodeURIComponent(key)}?X-Amz-Expires=${ACCESS_TTL_SEC}&X-Amz-Signature=mock-get`;
  }
  const cmd = new GetObjectCommand({ Bucket: EVIDENCE_BUCKET(), Key: key });
  return getSignedUrl(getClient(), cmd, { expiresIn: ACCESS_TTL_SEC });
}

// ─── Object metadata & checksum verification ──────────────────────────────────

/**
 * Check size constraints (HeadObject).
 * @param {string} key
 * @returns {Promise<{ size: number, exists: boolean }>}
 */
export async function headObject(key) {
  if (useMock()) {
    const obj = mockStore.get(key);
    return obj ? { size: obj.size, exists: true } : { size: 0, exists: false };
  }
  try {
    const res = await getClient().send(new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET(), Key: key }));
    return { size: res.ContentLength ?? 0, exists: true };
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404) return { size: 0, exists: false };
    throw e;
  }
}

/**
 * Verify declared SHA-256 against the actual object stored in S3.
 * Uses S3 Checksums API first; falls back to streaming download + local hash.
 * @param {string} key
 * @param {string} expectedSha256Hex
 */
export async function verifyObjectChecksum(key, expectedSha256Hex) {
  if (useMock()) {
    const obj = mockStore.get(key);
    if (!obj) return { verified: false, reason: 'object_not_found' };
    if (!obj.content || obj.content.length === 0) {
      // No content in mock — trust the declared checksum matches stored
      return { verified: obj.checksum === expectedSha256Hex, reason: obj.checksum === expectedSha256Hex ? 'ok' : 'mismatch' };
    }
    const actual = createHash('sha256').update(obj.content).digest('hex');
    const verified = actual === expectedSha256Hex.toLowerCase();
    return { verified, reason: verified ? 'ok' : 'mismatch', actual };
  }

  // Try S3 Checksums API (O(1), no download)
  try {
    const res = await getClient().send(
      new GetObjectAttributesCommand({
        Bucket: EVIDENCE_BUCKET(),
        Key: key,
        ObjectAttributes: [ObjectAttributes.CHECKSUM],
      })
    );
    const s3Sum = res.Checksum?.ChecksumSHA256;
    if (s3Sum) {
      const s3Hex = Buffer.from(s3Sum, 'base64').toString('hex');
      const verified = s3Hex === expectedSha256Hex.toLowerCase();
      return { verified, reason: verified ? 'ok' : 'mismatch', actual: s3Hex };
    }
  } catch {}

  // Fallback: download and hash (streaming)
  const res = await getClient().send(new GetObjectCommand({ Bucket: EVIDENCE_BUCKET(), Key: key }));
  const hash = createHash('sha256');
  for await (const chunk of res.Body) hash.update(chunk);
  const actual = hash.digest('hex');
  const verified = actual === expectedSha256Hex.toLowerCase();
  return { verified, reason: verified ? 'ok' : 'mismatch', actual };
}

// ─── Raw object download / upload (used by transcription worker) ─────────────

/**
 * Download an S3 object as a Buffer.
 * @param {string} key
 * @param {string} [bucket]  Defaults to EVIDENCE_BUCKET
 * @returns {Promise<Buffer>}
 */
export async function getObjectBuffer(key, bucket) {
  const Bucket = bucket ?? EVIDENCE_BUCKET();
  if (useMock()) {
    const obj = mockStore.get(key);
    if (!obj) throw Object.assign(new Error(`S3 object not found: ${key}`), { code: 'NoSuchKey' });
    return obj.content ?? Buffer.alloc(0);
  }
  const res    = await getClient().send(new GetObjectCommand({ Bucket, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Upload a UTF-8 string to S3 (used for transcripts / summaries).
 * @param {string} key
 * @param {string} text
 * @param {string} [bucket]
 */
export async function putTextObject(key, text, bucket) {
  const Bucket = bucket ?? EVIDENCE_BUCKET();
  if (useMock()) {
    mockStore.set(key, {
      checksum: '',
      size: Buffer.byteLength(text, 'utf8'),
      tags: {},
      uploaded: true,
      content: Buffer.from(text, 'utf8'),
    });
    return;
  }
  await getClient().send(
    new PutObjectCommand({
      Bucket,
      Key:         key,
      Body:        Buffer.from(text, 'utf8'),
      ContentType: 'text/plain; charset=utf-8',
    })
  );
}

/**
 * @param {string} key
 * @param {string} [bucket]
 * @returns {Promise<string>}
 */
export async function getObjectText(key, bucket) {
  const buf = await getObjectBuffer(key, bucket);
  return buf.toString('utf8');
}

// ─── Object tagging ───────────────────────────────────────────────────────────

/**
 * @param {string} key
 * @param {Record<string, string>} tags
 */
export async function tagObject(key, tags) {
  if (useMock()) {
    const obj = mockStore.get(key);
    if (obj) obj.tags = { ...obj.tags, ...tags };
    return;
  }
  await getClient().send(
    new PutObjectTaggingCommand({
      Bucket: EVIDENCE_BUCKET(),
      Key: key,
      Tagging: { TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) },
    })
  );
}
