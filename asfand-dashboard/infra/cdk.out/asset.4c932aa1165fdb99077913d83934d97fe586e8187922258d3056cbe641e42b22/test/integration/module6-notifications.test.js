import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { signAccessToken } from '../../src/services/jwtService.js';
import { insertUser } from '../../src/services/userRepository.js';
import { listTokensForUser } from '../../src/services/deviceTokensService.js';

const app = createApp();

async function tokenFor(userId, role) {
  const { token } = await signAccessToken({
    userId,
    email: 'n6@test.com',
    role,
    cognitoSub: null,
    fullName: 'N6',
  });
  return token;
}

describe('Module 6 — devices & notification prefs', () => {
  beforeEach(initTestDatabase);
  afterEach(teardownTestDatabase);

  it('POST /api/devices/register-token stores token', async () => {
    const u = await insertUser({
      email: 'dev@test.com',
      cognitoSub: 'sub-dev',
      role: 'Public',
      fullName: 'Dev',
      isVerified: true,
    });
    const t = await tokenFor(u.id, 'Public');

    await request(app)
      .post('/api/devices/register-token')
      .set('Authorization', `Bearer ${t}`)
      .send({
        fcm_token: 'tok-abc',
        device_id: 'd1',
        platform: 'ios',
      })
      .expect(200);

    const rows = await listTokensForUser(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].fcm_token).toBe('tok-abc');
  });

  it('GET/PATCH /api/users/:id/notification-prefs', async () => {
    const u = await insertUser({
      email: 'pref@test.com',
      cognitoSub: 'sub-pref',
      role: 'Responder',
      fullName: 'Pref',
      isVerified: true,
    });
    const t = await tokenFor(u.id, 'Responder');

    const g = await request(app)
      .get(`/api/users/${u.id}/notification-prefs`)
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(g.body.notification_prefs.sms_enabled).toBe(true);

    const p = await request(app)
      .patch(`/api/users/${u.id}/notification-prefs`)
      .set('Authorization', `Bearer ${t}`)
      .send({ sms_enabled: false, email_digest_enabled: true })
      .expect(200);
    expect(p.body.notification_prefs.sms_enabled).toBe(false);
    expect(p.body.notification_prefs.email_digest_enabled).toBe(true);
  });
});
