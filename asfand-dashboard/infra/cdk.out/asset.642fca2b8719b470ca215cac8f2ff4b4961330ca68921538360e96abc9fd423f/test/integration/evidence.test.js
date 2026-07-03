/**
 * Integration: full upload → confirm → Lambda evidenceProcessor → SQS chain.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { insertUser } from '../../src/services/userRepository.js';
import { createIncident } from '../../src/services/incidentRepository.js';
import { signAccessToken } from '../../src/services/jwtService.js';
import { __mockS3PutObject, __clearS3Mock } from '../../src/services/s3Service.js';
import { __getSqsMockQueue, __clearSqsMock } from '../../src/services/sqsService.js';
import { __getEvidenceAuditMemoryLog, __clearEvidenceAuditLog } from '../../src/services/evidenceAuditService.js';
import { processEvidenceRecord } from '../../src/lambda/evidenceProcessor.js';
import { findEvidenceById } from '../../src/services/evidenceRepository.js';

const app = createApp();

async function tok(user) {
  const { token } = await signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    cognitoSub: user.cognito_sub,
    fullName: user.full_name,
  });
  return token;
}

function sha256hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

describe('evidence: upload-url → confirm → Lambda → SQS', () => {
  beforeEach(async () => {
    process.env.S3_USE_MOCK = 'true';
    process.env.SQS_USE_MOCK = 'true';
    process.env.EVIDENCE_AUDIT_DISABLED = 'true';
    process.env.KINESIS_USE_MOCK = 'true';
    process.env.SNS_USE_MOCK = 'true';
    process.env.MOCK_AUTO_VERIFY = 'true';
    await initTestDatabase();
    __clearS3Mock();
    __clearSqsMock();
    __clearEvidenceAuditLog();
  });
  afterEach(teardownTestDatabase);

  it('full chain: request URL → confirm → lambda verifies → SQS message queued', async () => {
    const user = await insertUser({ email: 'uploader@test.com', cognitoSub: 'sub-up', role: 'Public', fullName: 'Up', isVerified: true });
    const incident = await createIncident({ userId: user.id, type: 'medical', lat: 1, lng: 1 });
    const token = await tok(user);

    const fileContent = Buffer.from('AES-256-GCM encrypted audio bytes');
    const checksum = sha256hex(fileContent);
    const fileSize = fileContent.length;

    // Step 1: Request presigned upload URL
    const urlRes = await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ incident_id: incident.id, file_size_bytes: fileSize, checksum_sha256: checksum })
      .expect(201);

    expect(urlRes.body.upload_url).toContain('mock-s3');
    expect(urlRes.body.evidence_id).toBeTruthy();
    const { evidence_id, s3_key } = urlRes.body;

    // Step 2: Mobile "uploads" directly to S3 (simulated in mock store)
    __mockS3PutObject(s3_key, { checksum, size: fileSize, content: fileContent });

    // Step 3: Mobile confirms upload
    await request(app)
      .post('/api/evidence/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ evidence_id, incident_id: incident.id })
      .expect(200);

    // Step 4: Lambda evidence-processor runs (S3 event in production)
    const lambdaResult = await processEvidenceRecord({ s3Key: s3_key, bucketName: 'era-evidence-dev' });
    expect(lambdaResult.ok).toBe(true);

    // Step 5: PostgreSQL evidence status = verified
    const ev = await findEvidenceById(evidence_id);
    expect(ev.status).toBe('verified');
    expect(ev.verified_at).not.toBeNull();

    // Step 6: SQS transcription-jobs has one message
    const sqsMessages = __getSqsMockQueue();
    expect(sqsMessages).toHaveLength(1);
    expect(sqsMessages[0].body.evidenceId).toBe(evidence_id);
    expect(sqsMessages[0].body.s3Key).toBe(s3_key);
  });

  it('Lambda rejects tampered file (wrong checksum)', async () => {
    const user = await insertUser({ email: 'tamper@test.com', cognitoSub: 'sub-tm', role: 'Public', fullName: 'T', isVerified: true });
    const incident = await createIncident({ userId: user.id, type: 'assault', lat: 2, lng: 2 });
    const token = await tok(user);

    const original = Buffer.from('real encrypted content');
    const checksum = sha256hex(original);

    const urlRes = await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ incident_id: incident.id, file_size_bytes: original.length, checksum_sha256: checksum })
      .expect(201);

    const { evidence_id, s3_key } = urlRes.body;

    // Attacker uploads different content
    const tampered = Buffer.from('different content that does not match checksum');
    __mockS3PutObject(s3_key, { checksum: sha256hex(tampered), size: tampered.length, content: tampered });

    await request(app)
      .post('/api/evidence/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ evidence_id, incident_id: incident.id })
      .expect(200);

    const result = await processEvidenceRecord({ s3Key: s3_key, bucketName: 'era-evidence-dev' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('checksum_mismatch');

    const ev = await findEvidenceById(evidence_id);
    expect(ev.status).toBe('rejected');
    expect(__getSqsMockQueue()).toHaveLength(0);
  });

  it('Lambda skips already-verified evidence (idempotency)', async () => {
    const user = await insertUser({ email: 'idem@test.com', cognitoSub: 'sub-id', role: 'Public', fullName: 'I', isVerified: true });
    const incident = await createIncident({ userId: user.id, type: 'other', lat: 3, lng: 3 });
    const token = await tok(user);

    const content = Buffer.from('file');
    const checksum = sha256hex(content);

    const urlRes = await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ incident_id: incident.id, file_size_bytes: content.length, checksum_sha256: checksum })
      .expect(201);

    const { evidence_id, s3_key } = urlRes.body;
    __mockS3PutObject(s3_key, { checksum, size: content.length, content });

    await processEvidenceRecord({ s3Key: s3_key, bucketName: 'era-evidence-dev' });
    __clearSqsMock();

    const second = await processEvidenceRecord({ s3Key: s3_key, bucketName: 'era-evidence-dev' });
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('already_verified');
    expect(__getSqsMockQueue()).toHaveLength(0);
  });
});

describe('evidence: Admin access-url endpoint', () => {
  beforeEach(async () => {
    process.env.S3_USE_MOCK = 'true';
    process.env.SQS_USE_MOCK = 'true';
    process.env.EVIDENCE_AUDIT_DISABLED = 'true';
    process.env.KINESIS_USE_MOCK = 'true';
    process.env.SNS_USE_MOCK = 'true';
    await initTestDatabase();
    __clearS3Mock();
    __clearEvidenceAuditLog();
  });
  afterEach(teardownTestDatabase);

  it('Admin receives a time-limited access URL', async () => {
    const admin = await insertUser({ email: 'adm@test.com', cognitoSub: 'sub-adm', role: 'Admin', fullName: 'A', isVerified: true });
    const creator = await insertUser({ email: 'cr@test.com', cognitoSub: 'sub-cr', role: 'Public', fullName: 'C', isVerified: true });
    const incident = await createIncident({ userId: creator.id, type: 'medical', lat: 1, lng: 1 });
    const adminToken = await tok(admin);
    const crToken = await tok(creator);

    const content = Buffer.from('encrypted');
    const checksum = sha256hex(content);

    const urlRes = await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${crToken}`)
      .send({ incident_id: incident.id, file_size_bytes: content.length, checksum_sha256: checksum })
      .expect(201);

    const { evidence_id, s3_key } = urlRes.body;
    __mockS3PutObject(s3_key, { checksum, size: content.length, content });
    await processEvidenceRecord({ s3Key: s3_key, bucketName: 'era-evidence-dev' });

    const accessRes = await request(app)
      .get(`/api/evidence/${evidence_id}/access-url`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(accessRes.body.access_url).toContain('mock-get');
    expect(accessRes.body.expires_in_seconds).toBe(900);
    expect(accessRes.body.warning).toBeTruthy();
  });
});
