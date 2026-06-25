import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { signAccessToken } from '../../src/services/jwtService.js';

describe('auth security', () => {
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

  it('locks out after 5 failed logins', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'lock@example.com',
      password: 'password123',
      fullName: 'Lock Test',
    });

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'lock@example.com', password: 'wrong' })
        .expect(401);
    }

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'lock@example.com', password: 'password123' })
      .expect(429);
  });

  it('rejects tampered JWT (role escalation attempt)', async () => {
    const { token } = await signAccessToken({
      userId: '22222222-2222-2222-2222-222222222222',
      email: 'v@example.com',
      role: 'Public',
      cognitoSub: null,
      fullName: 'V',
    });
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    payload.role = 'Admin';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tampered = parts.join('.');

    await request(app).get('/api/incidents').set('Authorization', `Bearer ${tampered}`).expect(401);
  });

  it('rejects privileged registration without secret', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'admin@example.com',
        password: 'password123',
        fullName: 'Bad',
        role: 'Admin',
      })
      .expect(403);
  });
});
