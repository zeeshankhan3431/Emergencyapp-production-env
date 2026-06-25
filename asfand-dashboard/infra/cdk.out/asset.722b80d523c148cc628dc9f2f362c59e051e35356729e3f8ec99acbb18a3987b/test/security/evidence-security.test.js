/**
 * Security tests for Module 3.
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
import { __clearSqsMock } from '../../src/services/sqsService.js';
import { __clearEvidenceAuditLog } from '../../src/services/evidenceAuditService.js';
import { processEvidenceRecord } from '../../src/lambda/evidenceProcessor.js';

const app = createApp();

async function tok(user) {
  const { token } = await signAccessToken({
    userId: user.id, email: user.email, role: user.role,
    cognitoSub: user.cognito_sub, fullName: user.full_name,
  });
  return token;
}

beforeEach(async () => {
  process.env.S3_USE_MOCK = 'true';
  process.env.SQS_USE_MOCK = 'true';
  process.env.EVIDENCE_AUDIT_DISABLED = 'true';
  process.env.KINESIS_USE_MOCK = 'true';
  process.env.SNS_USE_MOCK = 'true';
  await initTestDatabase();
  __clearS3Mock();
  __clearSqsMock();
  __clearEvidenceAuditLog();
});
afterEach(teardownTestDatabase);

describe('security: cross-user evidence access', () => {
  it('user A cannot request upload-url for user B incident (403)', async () => {
    const userA = await insertUser({ email: 'a@test.com', cognitoSub: 'sub-a', role: 'Public', fullName: 'A', isVerified: true });
    const userB = await insertUser({ email: 'b@test.com', cognitoSub: 'sub-b', role: 'Public', fullName: 'B', isVerified: true });
    const incident = await createIncident({ userId: userB.id, type: 'medical', lat: 1, lng: 1 });
    const tokenA = await tok(userA);

    await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ incident_id: incident.id, file_size_bytes: 100, checksum_sha256: 'a'.repeat(64) })
      .expect(403);
  });

  it('Responder cannot access evidence access-url (403)', async () => {
    const admin = await insertUser({ email: 'adm2@test.com', cognitoSub: 'sub-adm2', role: 'Admin', fullName: 'A', isVerified: true });
    const creator = await insertUser({ email: 'cr2@test.com', cognitoSub: 'sub-cr2', role: 'Public', fullName: 'C', isVerified: true });
    const responder = await insertUser({ email: 'rsp2@test.com', cognitoSub: 'sub-rsp2', role: 'Responder', fullName: 'R', isVerified: true });
    const incident = await createIncident({ userId: creator.id, type: 'medical', lat: 1, lng: 1 });
    const crToken = await tok(creator);
    const rspToken = await tok(responder);

    const content = Buffer.from('encrypted audio');
    const checksum = createHash('sha256').update(content).digest('hex');

    const urlRes = await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${crToken}`)
      .send({ incident_id: incident.id, file_size_bytes: content.length, checksum_sha256: checksum })
      .expect(201);

    const { evidence_id, s3_key } = urlRes.body;
    __mockS3PutObject(s3_key, { checksum, size: content.length, content });
    await processEvidenceRecord({ s3Key: s3_key, bucketName: 'era-evidence-dev' });

    await request(app)
      .get(`/api/evidence/${evidence_id}/access-url`)
      .set('Authorization', `Bearer ${rspToken}`)
      .expect(403);
  });

  it('Analyst cannot access evidence access-url (403)', async () => {
    const analyst = await insertUser({ email: 'anl@test.com', cognitoSub: 'sub-anl', role: 'Analyst', fullName: 'An', isVerified: true });
    const token = await tok(analyst);
    await request(app)
      .get('/api/evidence/any-evidence-id/access-url')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});

describe('security: upload validation', () => {
  it('rejects invalid checksum format (not 64-hex)', async () => {
    const user = await insertUser({ email: 'val@test.com', cognitoSub: 'sub-val', role: 'Public', fullName: 'V', isVerified: true });
    const incident = await createIncident({ userId: user.id, type: 'other', lat: 1, lng: 1 });
    const token = await tok(user);

    await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ incident_id: incident.id, file_size_bytes: 100, checksum_sha256: 'not-a-valid-sha256' })
      .expect(400);
  });

  it('rejects file exceeding 500 MB (413)', async () => {
    const user = await insertUser({ email: 'big@test.com', cognitoSub: 'sub-big', role: 'Public', fullName: 'B', isVerified: true });
    const incident = await createIncident({ userId: user.id, type: 'medical', lat: 1, lng: 1 });
    const token = await tok(user);

    await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ incident_id: incident.id, file_size_bytes: 500 * 1024 * 1024 + 1, checksum_sha256: 'a'.repeat(64) })
      .expect(413);
  });

  it('unauthenticated request for upload-url returns 401', async () => {
    await request(app)
      .post('/api/evidence/upload-url')
      .send({ incident_id: 'x', file_size_bytes: 100, checksum_sha256: 'a'.repeat(64) })
      .expect(401);
  });

  it('double-confirm same evidence_id returns 409', async () => {
    const user = await insertUser({ email: 'dc@test.com', cognitoSub: 'sub-dc', role: 'Public', fullName: 'D', isVerified: true });
    const incident = await createIncident({ userId: user.id, type: 'other', lat: 1, lng: 1 });
    const token = await tok(user);
    const content = Buffer.from('audio');
    const checksum = createHash('sha256').update(content).digest('hex');

    const urlRes = await request(app)
      .post('/api/evidence/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ incident_id: incident.id, file_size_bytes: content.length, checksum_sha256: checksum })
      .expect(201);

    const { evidence_id } = urlRes.body;
    await request(app).post('/api/evidence/confirm').set('Authorization', `Bearer ${token}`)
      .send({ evidence_id, incident_id: incident.id }).expect(200);
    await request(app).post('/api/evidence/confirm').set('Authorization', `Bearer ${token}`)
      .send({ evidence_id, incident_id: incident.id }).expect(409);
  });
});
