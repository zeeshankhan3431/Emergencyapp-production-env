import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const ACCESS_TTL_SEC = 15 * 60; // 15 minutes

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
  return new TextEncoder().encode(s);
}

/**
 * @param {{ userId: string, email: string, role: string, cognitoSub: string | null, fullName: string }} claims
 */
export async function signAccessToken(claims) {
  const secret = getSecret();
  const jwt = await new SignJWT({
    sub: claims.userId,
    email: claims.email,
    role: claims.role,
    full_name: claims.fullName,
    cognito_sub: claims.cognitoSub ?? undefined,
    jti: randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(process.env.JWT_ISSUER ?? 'security-app-api')
    .setAudience(process.env.JWT_AUDIENCE ?? 'security-app-clients')
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secret);

  return { token: jwt, expiresIn: ACCESS_TTL_SEC };
}

/**
 * @param {string} token
 */
export async function verifyAccessToken(token) {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret, {
    issuer: process.env.JWT_ISSUER ?? 'security-app-api',
    audience: process.env.JWT_AUDIENCE ?? 'security-app-clients',
    algorithms: ['HS256'],
  });
  return {
    userId: String(payload.sub),
    email: String(payload.email ?? ''),
    role: String(payload.role ?? ''),
    fullName: String(payload.full_name ?? ''),
    cognitoSub: payload.cognito_sub ? String(payload.cognito_sub) : null,
    jti: payload.jti ? String(payload.jti) : null,
  };
}

export { ACCESS_TTL_SEC };
