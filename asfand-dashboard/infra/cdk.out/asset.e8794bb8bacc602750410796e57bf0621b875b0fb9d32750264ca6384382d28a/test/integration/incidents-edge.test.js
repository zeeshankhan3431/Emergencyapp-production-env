/**
 * Edge cases: no GPS fix, unverified user, notes on unassigned incident.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { insertUser } from '../../src/services/userRepository.js';
import { signAccessToken } from '../../src/services/jwtService.js';
import { __clearKinesisMock } from '../../src/services/kinesisService.js';

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

beforeEach(async () => {
  process.env.KINESIS_USE_MOCK = 'true';
  process.env.SNS_USE_MOCK = 'true';
  await initTestDatabase();
  __clearKinesisMock();
});
afterEach(teardownTestDatabase);

describe('edge: no GPS fix (null accuracy)', () => {
  it('accepts incident with null accuracy (GPS unavailable)', async () => {
    const user = await insertUser({ email: 'nogps@test.com', cognitoSub: 'sub-ng', role: 'Public', fullName: 'NG', isVerified: true });
    const token = await tok(user);
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: user.id, type: 'other', lat: 0, lng: 0, accuracy: null })
      .expect(202);
    expect(res.body.incident_id).toBeTruthy();
  });
});

describe('edge: unverified user can still trigger incident', () => {
  it('unverified user triggers incident (is_verified has no bearing on JWT auth)', async () => {
    const user = await insertUser({ email: 'unverf@test.com', cognitoSub: 'sub-uv', role: 'Public', fullName: 'UV', isVerified: false });
    const token = await tok(user);
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ user_id: user.id, type: 'medical', lat: 10, lng: 10 })
      .expect(202);
    expect(res.body.incident_id).toBeTruthy();
  });
});

describe('edge: Responder cannot add note to unassigned incident', () => {
  it('returns 403 for Responder who is not assigned', async () => {
    const creator = await insertUser({ email: 'cr@test.com', cognitoSub: 'sub-cr', role: 'Public', fullName: 'C', isVerified: true });
    const responder = await insertUser({ email: 'rsp@test.com', cognitoSub: 'sub-rsp', role: 'Responder', fullName: 'R', isVerified: true });

    const cToken = await tok(creator);
    const rToken = await tok(responder);

    const { body: { incident_id } } = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${cToken}`)
      .send({ user_id: creator.id, type: 'medical', lat: 1, lng: 1 })
      .expect(202);

    await request(app)
      .post(`/api/incidents/${incident_id}/notes`)
      .set('Authorization', `Bearer ${rToken}`)
      .send({ body: 'On scene now.' })
      .expect(403);
  });
});

describe('edge: note with empty body rejected', () => {
  it('returns 400 for blank note body', async () => {
    const admin = await insertUser({ email: 'admin-edge@test.com', cognitoSub: 'sub-ae', role: 'Admin', fullName: 'A', isVerified: true });
    const creator = await insertUser({ email: 'cr2@test.com', cognitoSub: 'sub-cr2', role: 'Public', fullName: 'C2', isVerified: true });

    const aToken = await tok(admin);
    const cToken = await tok(creator);

    const { body: { incident_id } } = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${cToken}`)
      .send({ user_id: creator.id, type: 'assault', lat: 5, lng: 5 })
      .expect(202);

    await request(app)
      .post(`/api/incidents/${incident_id}/notes`)
      .set('Authorization', `Bearer ${aToken}`)
      .send({ body: '   ' })
      .expect(400);
  });
});
