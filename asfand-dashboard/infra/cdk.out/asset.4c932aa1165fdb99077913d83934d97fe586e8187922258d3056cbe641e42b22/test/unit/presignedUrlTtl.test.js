/**
 * Unit tests: presigned URL TTL constants and URL generation in mock mode.
 * The "403 after expiry" test is against real AWS — documented in client notes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateUploadPresignedUrl,
  generateDownloadPresignedUrl,
  UPLOAD_TTL_SEC,
  ACCESS_TTL_SEC,
  MAX_SIZE_BYTES,
  __clearS3Mock,
} from '../../src/services/s3Service.js';

beforeEach(() => {
  process.env.S3_USE_MOCK = 'true';
  __clearS3Mock();
});

const VALID_SHA256 = 'a'.repeat(64);

describe('presigned URL TTL constants', () => {
  it('upload TTL is 5 minutes (300 s)', () => {
    expect(UPLOAD_TTL_SEC).toBe(300);
  });

  it('access (download) TTL is 15 minutes (900 s)', () => {
    expect(ACCESS_TTL_SEC).toBe(900);
  });
});

describe('upload presigned URL generation', () => {
  it('generates mock upload URL containing correct TTL', async () => {
    const url = await generateUploadPresignedUrl({
      key: 'evidence/inc/ev1',
      fileSizeBytes: 1024,
      checksumSha256: VALID_SHA256,
    });
    expect(url).toContain(`X-Amz-Expires=${UPLOAD_TTL_SEC}`);
    expect(url).toContain('mock');
  });

  it('rejects files exceeding 500 MB', async () => {
    await expect(
      generateUploadPresignedUrl({
        key: 'evidence/inc/big',
        fileSizeBytes: MAX_SIZE_BYTES + 1,
        checksumSha256: VALID_SHA256,
      })
    ).rejects.toThrow(/too large/i);
  });

  it('accepts exactly 500 MB', async () => {
    const url = await generateUploadPresignedUrl({
      key: 'evidence/inc/max',
      fileSizeBytes: MAX_SIZE_BYTES,
      checksumSha256: VALID_SHA256,
    });
    expect(url).toBeTruthy();
  });
});

describe('download (access) presigned URL generation', () => {
  it('generates mock download URL with 15-min TTL', async () => {
    const url = await generateDownloadPresignedUrl('evidence/inc/ev2');
    expect(url).toContain(`X-Amz-Expires=${ACCESS_TTL_SEC}`);
    expect(url).toContain('mock-get');
  });
});
