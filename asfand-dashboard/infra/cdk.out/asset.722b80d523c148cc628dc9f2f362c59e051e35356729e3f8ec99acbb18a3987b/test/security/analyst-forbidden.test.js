import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { signAccessToken } from '../../src/services/jwtService.js';
import { insertUser } from '../../src/services/userRepository.js';
import { createIncident } from '../../src/services/incidentRepository.js';

const app = createApp();

async function makeToken(role, userId) {
  const { token } = await signAccessToken({
    userId,
    email: `${role.toLowerCase()}@sec.test`,
    role,
    cognitoSub: null,
    fullName: `Test ${role}`,
  });
  return token;
}

describe('authorization: Analyst cannot mutate incident status', () => {
  beforeEach(initTestDatabase);
  afterEach(teardownTestDatabase);

  it('PATCH /api/incidents/:id/status returns 403 for Analyst', async () => {
    const analyst = await insertUser({
      email: 'analyst-sec@test.com',
      cognitoSub: 'sub-analyst-sec',
      role: 'Analyst',
      fullName: 'Analyst Sec',
      isVerified: true,
    });
    const owner = await insertUser({
      email: 'owner@test.com',
      cognitoSub: 'sub-owner',
      role: 'Public',
      fullName: 'Owner',
      isVerified: true,
    });
    const inc = await createIncident({
      userId: owner.id,
      type: 'medical',
      lat: 1,
      lng: 1,
    });
    const tok = await makeToken('Analyst', analyst.id);

    await request(app)
      .patch(`/api/incidents/${inc.id}/status`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ status: 'ai_processing' })
      .expect(403);
  });
});
