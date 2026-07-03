import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { signAccessToken } from '../../src/services/jwtService.js';
import { insertUser } from '../../src/services/userRepository.js';
import { runEscalationEngine } from '../../src/services/escalationEngine.js';
import { __clearKinesisMock, __getKinesisMockQueue } from '../../src/services/kinesisService.js';
import { __clearSnsMock, __getSnsMockPublished } from '../../src/services/snsService.js';
import { getIncidentById } from '../../src/services/incidentRepository.js';

const app = createApp();

async function makeToken(role = 'Admin', userId = null) {
  const uid = userId ?? '11111111-1111-1111-1111-111111111111';
  const { token } = await signAccessToken({
    userId: uid,
    email: `${role.toLowerCase()}@test.com`,
    role,
    cognitoSub: null,
    fullName: `Test ${role}`,
  });
  return token;
}

async function seedUser(email, role = 'Admin') {
  return insertUser({
    email,
    cognitoSub: `sub-${email}`,
    role,
    fullName: `User ${role}`,
    isVerified: true,
  });
}

describe('incident creation (POST /api/incidents)', () => {
  beforeEach(async () => {
    process.env.KINESIS_USE_MOCK = 'true';
    process.env.SNS_USE_MOCK = 'true';
    await initTestDatabase();
    __clearKinesisMock();
    __clearSnsMock();
  });
  afterEach(teardownTestDatabase);

  it('creates incident and returns 202 with incident_id', async () => {
    const user = await seedUser('trigger@test.com', 'Public');
    const token = await makeToken('Public', user.id);

    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: user.id, type: 'medical', lat: 37.77, lng: -122.41 })
      .expect(202);

    expect(res.body.incident_id).toBeTruthy();
    expect(res.body.status).toBe('triggered');
    expect(__getKinesisMockQueue()).toHaveLength(1);
    expect(__getKinesisMockQueue()[0].data.eventType).toBe('INCIDENT_TRIGGERED');
  });

  it('rejects missing required fields', async () => {
    const user = await seedUser('bad@test.com', 'Public');
    const token = await makeToken('Public', user.id);
    await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'medical' })
      .expect(400);
  });

  it('rejects invalid incident type', async () => {
    const user = await seedUser('type@test.com', 'Public');
    const token = await makeToken('Public', user.id);
    await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: user.id, type: 'tornado', lat: 1, lng: 1 })
      .expect(400);
  });

  it('rejects unauthenticated request', async () => {
    await request(app)
      .post('/api/incidents')
      .send({ user_id: 'x', type: 'medical', lat: 1, lng: 1 })
      .expect(401);
  });
});

describe('full escalation flow: POST → Kinesis → engine → SNS → DB', () => {
  beforeEach(async () => {
    process.env.KINESIS_USE_MOCK = 'true';
    process.env.SNS_USE_MOCK = 'true';
    await initTestDatabase();
    __clearKinesisMock();
    __clearSnsMock();
  });
  afterEach(teardownTestDatabase);

  it('POST → engine(0.75) → escalated in DB + SNS published', async () => {
    const user = await seedUser('mf@test.com', 'Public');
    const token = await makeToken('Public', user.id);

    const triggerRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: user.id, type: 'assault', lat: 51.5, lng: -0.1 })
      .expect(202);

    const { incident_id } = triggerRes.body;

    // Simulate AI pipeline result → escalation engine
    const result = await runEscalationEngine({
      incidentId: incident_id,
      confidenceScore: 0.85,
      aiSummary: 'High-confidence assault',
      urgencyScore: 0.9,
    });

    expect(result.escalated).toBe(true);
    const db = await getIncidentById(incident_id);
    expect(['escalated', 'responder_assigned']).toContain(db.status);
    expect(__getSnsMockPublished()).toHaveLength(1);
  });
});

describe('incident list (GET /api/incidents)', () => {
  beforeEach(async () => {
    process.env.KINESIS_USE_MOCK = 'true';
    process.env.SNS_USE_MOCK = 'true';
    await initTestDatabase();
    __clearKinesisMock();
  });
  afterEach(teardownTestDatabase);

  it('Admin can list incidents', async () => {
    const admin = await seedUser('admin2@test.com', 'Admin');
    const token = await makeToken('Admin', admin.id);
    await request(app).get('/api/incidents').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('Analyst can list incidents', async () => {
    const analyst = await seedUser('analyst@test.com', 'Analyst');
    const token = await makeToken('Analyst', analyst.id);
    await request(app).get('/api/incidents').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('Responder cannot list all incidents (403)', async () => {
    const responder = await seedUser('resp@test.com', 'Responder');
    const token = await makeToken('Responder', responder.id);
    await request(app).get('/api/incidents').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('Public user cannot list incidents (403)', async () => {
    const pub = await seedUser('pub2@test.com', 'Public');
    const token = await makeToken('Public', pub.id);
    await request(app).get('/api/incidents').set('Authorization', `Bearer ${token}`).expect(403);
  });
});

describe('incident status update (PATCH /api/incidents/:id/status)', () => {
  beforeEach(async () => {
    process.env.KINESIS_USE_MOCK = 'true';
    process.env.SNS_USE_MOCK = 'true';
    await initTestDatabase();
    __clearKinesisMock();
    __clearSnsMock();
  });
  afterEach(teardownTestDatabase);

  it('Admin can advance state: triggered → ai_processing', async () => {
    const admin = await seedUser('admin3@test.com', 'Admin');
    const creator = await seedUser('creator@test.com', 'Public');
    const token = await makeToken('Admin', admin.id);
    const trigToken = await makeToken('Public', creator.id);

    const { body: { incident_id } } = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${trigToken}`)
      .send({ user_id: creator.id, type: 'medical', lat: 1, lng: 1 })
      .expect(202);

    const res = await request(app)
      .patch(`/api/incidents/${incident_id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ai_processing' })
      .expect(200);

    expect(res.body.status).toBe('ai_processing');
  });

  it('rejects invalid transition (triggered → resolved)', async () => {
    const admin = await seedUser('admin4@test.com', 'Admin');
    const creator = await seedUser('creator2@test.com', 'Public');
    const token = await makeToken('Admin', admin.id);
    const trigToken = await makeToken('Public', creator.id);

    const { body: { incident_id } } = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${trigToken}`)
      .send({ user_id: creator.id, type: 'other', lat: 1, lng: 1 })
      .expect(202);

    await request(app)
      .patch(`/api/incidents/${incident_id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'resolved' })
      .expect(422);
  });
});

describe('soft delete (DELETE /api/incidents/:id)', () => {
  beforeEach(async () => {
    process.env.KINESIS_USE_MOCK = 'true';
    process.env.SNS_USE_MOCK = 'true';
    await initTestDatabase();
    __clearKinesisMock();
  });
  afterEach(teardownTestDatabase);

  it('Admin can soft-delete an incident', async () => {
    const admin = await seedUser('admin5@test.com', 'Admin');
    const creator = await seedUser('creator3@test.com', 'Public');
    const adminToken = await makeToken('Admin', admin.id);
    const pubToken = await makeToken('Public', creator.id);

    const { body: { incident_id } } = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${pubToken}`)
      .send({ user_id: creator.id, type: 'medical', lat: 1, lng: 1 })
      .expect(202);

    await request(app).delete(`/api/incidents/${incident_id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);

    const db = await getIncidentById(incident_id);
    expect(db).toBeNull();
  });

  it('non-Admin cannot delete (403)', async () => {
    const responder = await seedUser('respd@test.com', 'Responder');
    const rToken = await makeToken('Responder', responder.id);
    await request(app).delete('/api/incidents/any-id').set('Authorization', `Bearer ${rToken}`).expect(403);
  });
});
