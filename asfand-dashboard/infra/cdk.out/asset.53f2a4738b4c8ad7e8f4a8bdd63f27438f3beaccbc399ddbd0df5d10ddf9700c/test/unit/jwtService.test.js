import { describe, it, expect, beforeEach } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../../src/services/jwtService.js';

describe('jwtService', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
  });

  it('signs and verifies access token with role claims', async () => {
    const { token, expiresIn } = await signAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'a@example.com',
      role: 'Responder',
      cognitoSub: 'cog-1',
      fullName: 'Test User',
    });
    expect(expiresIn).toBe(900);
    const claims = await verifyAccessToken(token);
    expect(claims.userId).toBe('11111111-1111-1111-1111-111111111111');
    expect(claims.email).toBe('a@example.com');
    expect(claims.role).toBe('Responder');
    expect(claims.fullName).toBe('Test User');
  });

  it('rejects tampered token', async () => {
    const { token } = await signAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'a@example.com',
      role: 'Public',
      cognitoSub: null,
      fullName: 'X',
    });
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'evil', role: 'Admin' })).toString('base64url');
    const bad = parts.join('.');
    await expect(verifyAccessToken(bad)).rejects.toThrow();
  });
});
