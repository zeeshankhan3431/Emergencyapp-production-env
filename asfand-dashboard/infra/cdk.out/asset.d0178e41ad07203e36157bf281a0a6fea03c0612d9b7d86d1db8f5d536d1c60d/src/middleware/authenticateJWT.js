import { verifyAccessToken } from '../services/jwtService.js';

const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Dev user when SKIP_AUTH=true — role Admin for dashboard testing.
 */
export function getDevAuthUser() {
  return {
    id: DEV_USER_ID,
    email: 'admin@era.dev',
    role: 'Admin',
    cognitoSub: 'dev-cognito-sub',
    fullName: 'ERA Admin',
    preferred_username: 'admin',
    sub: DEV_USER_ID,
  };
}

/**
 * Verifies Bearer JWT; sets req.user. Use after cookie-parser.
 * @returns {import('express').RequestHandler}
 */
export function authenticateJWT() {
  return async (req, res, next) => {
    if (process.env.SKIP_AUTH === 'true') {
      req.user = getDevAuthUser();
      return next();
    }

    const auth = req.headers.authorization;
    let token = null;
    if (auth?.startsWith('Bearer ')) {
      token = auth.slice(7);
    }

    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    }

    try {
      const claims = await verifyAccessToken(token);
      req.user = {
        id: claims.userId,
        email: claims.email,
        role: claims.role,
        cognitoSub: claims.cognitoSub,
        sub: claims.userId,
        fullName: claims.fullName,
      };
      next();
    } catch {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Access token invalid or expired' });
    }
  };
}
