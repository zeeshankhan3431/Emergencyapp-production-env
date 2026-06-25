import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';

describe('role guard', () => {
  const app = createApp();

  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await initTestDatabase();
    process.env.MOCK_AUTO_VERIFY = 'true';
  });

  it('returns 403 for Public role on operational APIs', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'public@example.com',
      password: 'password123',
      fullName: 'Public User',
    });

    const login = await request(app).post('/api/auth/login').send({
      email: 'public@example.com',
      password: 'password123',
    });

    await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
  });
});
