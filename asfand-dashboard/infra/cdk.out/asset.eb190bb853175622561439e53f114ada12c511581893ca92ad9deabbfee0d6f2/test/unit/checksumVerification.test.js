/**
 * Unit tests: SHA-256 checksum verification in S3 service (mock mode).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  verifyObjectChecksum,
  __mockS3PutObject,
  __clearS3Mock,
  MAX_SIZE_BYTES,
} from '../../src/services/s3Service.js';

beforeEach(() => {
  process.env.S3_USE_MOCK = 'true';
  __clearS3Mock();
});

function sha256hex(content) {
  return createHash('sha256').update(content).digest('hex');
}

describe('checksum verification', () => {
  it('passes for correct content + checksum', async () => {
    const content = Buffer.from('legitimate encrypted audio payload');
    const checksum = sha256hex(content);
    __mockS3PutObject('evidence/inc-1/ev-1', { checksum, size: content.length, content });

    const result = await verifyObjectChecksum('evidence/inc-1/ev-1', checksum);
    expect(result.verified).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('fails for tampered file (wrong content)', async () => {
    const original = Buffer.from('original payload');
    const declared = sha256hex(original);

    const tampered = Buffer.from('tampered payload different');
    __mockS3PutObject('evidence/inc-1/ev-2', { checksum: sha256hex(tampered), size: tampered.length, content: tampered });

    const result = await verifyObjectChecksum('evidence/inc-1/ev-2', declared);
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('mismatch');
  });

  it('fails when declared checksum does not match declared in mock store', async () => {
    // Mock with no content — comparison is purely against stored checksum
    __mockS3PutObject('evidence/inc-1/ev-3', { checksum: 'aaaaaa'.padEnd(64, 'a'), size: 100 });

    const result = await verifyObjectChecksum('evidence/inc-1/ev-3', 'b'.repeat(64));
    expect(result.verified).toBe(false);
  });

  it('returns object_not_found for non-existent key', async () => {
    const result = await verifyObjectChecksum('evidence/missing/key', 'a'.repeat(64));
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('object_not_found');
  });

  it('MAX_SIZE_BYTES is 500 MB', () => {
    expect(MAX_SIZE_BYTES).toBe(500 * 1024 * 1024);
  });
});
