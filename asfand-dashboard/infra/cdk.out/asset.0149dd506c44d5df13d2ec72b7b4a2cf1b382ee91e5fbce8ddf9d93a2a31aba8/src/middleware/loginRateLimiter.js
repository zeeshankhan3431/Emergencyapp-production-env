import { checkLoginAllowed } from '../services/loginRateLimitService.js';

/**
 * Blocks login when IP/email is rate-limited (expects req.body.email).
 * @returns {import('express').RequestHandler}
 */
export function loginRateLimiter() {
  return async (req, res, next) => {
    const email = req.body?.email;
    if (!email || typeof email !== 'string') {
      return next();
    }
    const { allowed, lockedUntil } = await checkLoginAllowed(email);
    if (!allowed) {
      return res.status(429).json({
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Too many failed login attempts. Try again later.',
        lockedUntil: lockedUntil ? new Date(lockedUntil).toISOString() : undefined,
      });
    }
    next();
  };
}
