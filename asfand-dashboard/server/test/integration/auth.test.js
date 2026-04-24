import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';

describe('auth integration', () => {
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
    process.env.AUTO_CONFIRM_SIGNUP = 'false';
  });

  it('register → login → me → refresh → logout', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user1@example.com',
        password: 'password123',
        fullName: 'User One',
      })
      .expect(201);

    expect(reg.body.userId).toBeTruthy();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user1@example.com', password: 'password123' })
      .expect(200);

    expect(login.body.accessToken).toBeTruthy();
    expect(login.headers['set-cookie']).toBeDefined();

    const cookie = login.headers['set-cookie'].join(';');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);

    expect(me.body.user.email).toMatch(/user1@example.com/i);
    expect(me.body.user.role).toBe('Public');

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);

    expect(refresh.body.accessToken).toBeTruthy();

    const newCookie = refresh.headers['set-cookie']?.join(';') ?? cookie;

    await request(app).post('/api/auth/logout').set('Cookie', newCookie).expect(200);

    await request(app).post('/api/auth/refresh').set('Cookie', newCookie).expect(401);
  });

  it('rejects expired / invalid access token for /me', async () => {
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });
});
