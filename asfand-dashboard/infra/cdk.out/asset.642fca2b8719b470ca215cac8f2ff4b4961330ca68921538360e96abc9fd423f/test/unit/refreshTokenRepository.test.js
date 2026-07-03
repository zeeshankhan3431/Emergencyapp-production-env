import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { insertUser } from '../../src/services/userRepository.js';
import { insertRefreshToken, consumeRefreshToken } from '../../src/services/refreshTokenRepository.js';

describe('refreshTokenRepository', () => {
  beforeEach(async () => {
    await initTestDatabase();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  it('rotates refresh token and invalidates old hash', async () => {
    const user = await insertUser({
      email: 'rt@example.com',
      cognitoSub: 'sub-rt',
      role: 'Public',
      fullName: 'RT',
      isVerified: true,
    });

    const { raw: first } = await insertRefreshToken(user.id);
    const rotated = await consumeRefreshToken(first, { rotate: true });
    expect(rotated.ok).toBe(true);
    expect(rotated.newRefreshToken).toBeTruthy();

    const again = await consumeRefreshToken(first, { rotate: true });
    expect(again.ok).toBe(false);

    const rotated2 = await consumeRefreshToken(rotated.newRefreshToken, { rotate: true });
    expect(rotated2.ok).toBe(true);
  });
});
