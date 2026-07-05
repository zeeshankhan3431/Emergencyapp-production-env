import { Router } from 'express';
import { cognitoSignUp, cognitoInitiateAuth, cognitoForgotPassword, cognitoConfirmForgotPassword, cognitoAdminConfirmSignUp } from '../services/cognitoService.js';
import { signAccessToken } from '../services/jwtService.js';
import { insertUser, findUserByEmail, findUserById, updateLastLogin, setUserVerified } from '../services/userRepository.js';
import { insertRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../services/refreshTokenRepository.js';
import { recordLoginFailure, recordLoginSuccess } from '../services/loginRateLimitService.js';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { loginRateLimiter } from '../middleware/loginRateLimiter.js';
import { isValidRole } from '../constants/roles.js';

const router = Router();

const REFRESH_COOKIE = 'refreshToken';

function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    // 'none' required for cross-origin CloudFront → ALB cookie forwarding in production
    sameSite: isProd ? 'none' : 'strict',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function clearRefreshCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE, {
    path: '/api/auth',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'strict',
  });
}

function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) {
    return 'Password must be at least 8 characters';
  }
  return null;
}

/**
 * Resolve requested role: Public self-serve, or privileged roles with secret header.
 */
function resolveRegistrationRole(req) {
  const secret = process.env.REGISTRATION_ROLE_SECRET;
  const bodyRole = req.body?.role;
  if (bodyRole === undefined || bodyRole === null || bodyRole === '' || bodyRole === 'Public') {
    return 'Public';
  }
  const header = req.get('X-Registration-Secret');
  if (!isValidRole(bodyRole)) {
    throw Object.assign(new Error('Invalid role'), { status: 400 });
  }
  if (!secret || header !== secret) {
    throw Object.assign(new Error('Not allowed to assign this role'), { status: 403 });
  }
  return bodyRole;
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body ?? {};
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'VALIDATION', message: 'email, password, and fullName are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: 'VALIDATION', message: pwErr });

    let role;
    try {
      role = resolveRegistrationRole(req);
    } catch (e) {
      const status = e.status ?? 400;
      return res.status(status).json({ error: 'FORBIDDEN', message: e.message });
    }

    const { sub } = await cognitoSignUp({
      email: String(email),
      password: String(password),
      fullName: String(fullName).trim(),
    });

    const user = await insertUser({
      email: String(email),
      cognitoSub: sub,
      role,
      fullName: String(fullName).trim(),
      phone: phone ? String(phone) : null,
      isVerified: process.env.MOCK_AUTO_VERIFY === 'true',
    });

    if (process.env.AUTO_CONFIRM_SIGNUP === 'true') {
      await cognitoAdminConfirmSignUp(String(email));
      await setUserVerified(user.id, true);
    }

    return res.status(201).json({
      ok: true,
      message: 'Registration successful. Check your email to verify your account (or use AUTO_CONFIRM_SIGNUP in dev).',
      userId: user.id,
      role: user.role,
    });
  } catch (err) {
    if (err.name === 'UsernameExistsException' || err.message?.includes('already exists')) {
      return res.status(409).json({ error: 'CONFLICT', message: 'An account with this email already exists' });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'CONFLICT', message: 'An account with this email already exists' });
    }
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL', message: 'Registration failed' });
  }
});

router.post('/login', loginRateLimiter(), async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'VALIDATION', message: 'email and password are required' });
  }

  const userRow = await findUserByEmail(String(email));
  if (!userRow) {
    await recordLoginFailure(String(email));
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid email or password' });
  }

  try {
    await cognitoInitiateAuth({ email: String(email), password: String(password) });
  } catch (err) {
    await recordLoginFailure(String(email));
    if (err.name === 'UserNotConfirmedException') {
      return res.status(403).json({ error: 'USER_NOT_CONFIRMED', message: 'Verify your email before signing in' });
    }
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid email or password' });
  }

  await recordLoginSuccess(String(email));
  await updateLastLogin(userRow.id);

  const { token, expiresIn } = await signAccessToken({
    userId: userRow.id,
    email: userRow.email,
    role: userRow.role,
    cognitoSub: userRow.cognito_sub,
    fullName: userRow.full_name,
  });

  const { raw: refreshRaw } = await insertRefreshToken(userRow.id);
  res.cookie(REFRESH_COOKIE, refreshRaw, refreshCookieOptions());

  return res.json({
    accessToken: token,
    expiresIn,
    tokenType: 'Bearer',
    user: {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role,
      fullName: userRow.full_name,
    },
  });
});

router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Refresh token missing' });
  }

  const result = await consumeRefreshToken(raw, { rotate: true });
  if (!result.ok || !result.newRefreshToken) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Refresh token invalid or expired' });
  }

  const userRow = await findUserById(result.userId);
  if (!userRow) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User not found' });
  }

  const { token, expiresIn } = await signAccessToken({
    userId: userRow.id,
    email: userRow.email,
    role: userRow.role,
    cognitoSub: userRow.cognito_sub,
    fullName: userRow.full_name,
  });

  res.cookie(REFRESH_COOKIE, result.newRefreshToken, refreshCookieOptions());

  return res.json({
    accessToken: token,
    expiresIn,
    tokenType: 'Bearer',
  });
});

router.post('/logout', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) {
    await revokeRefreshToken(raw);
  }
  clearRefreshCookie(res);
  return res.json({ ok: true });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) {
    return res.status(400).json({ error: 'VALIDATION', message: 'email is required' });
  }
  try {
    await cognitoForgotPassword({ email: String(email) });
  } catch (e) {
    console.error(e);
  }
  return res.json({
    ok: true,
    message: 'If an account exists for this email, password reset instructions have been sent.',
  });
});

router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body ?? {};
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'VALIDATION', message: 'email, code, and newPassword are required' });
  }
  const pwErr = validatePassword(newPassword);
  if (pwErr) return res.status(400).json({ error: 'VALIDATION', message: pwErr });

  try {
    await cognitoConfirmForgotPassword({
      email: String(email),
      code: String(code),
      newPassword: String(newPassword),
    });
    return res.json({ ok: true, message: 'Password has been reset. You can sign in with the new password.' });
  } catch (err) {
    if (err.name === 'CodeMismatchException' || err.name === 'ExpiredCodeException') {
      return res.status(400).json({ error: 'INVALID_CODE', message: 'Invalid or expired verification code' });
    }
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL', message: 'Could not reset password' });
  }
});

router.get('/me', authenticateJWT(), async (req, res) => {
  const row = await findUserById(req.user.id);
  if (!row) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
  }

  return res.json({
    user: {
      id: row.id,
      email: row.email,
      role: row.role,
      fullName: row.full_name,
      phone: row.phone,
      isVerified: row.is_verified,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      lastLogin: row.last_login
        ? row.last_login instanceof Date
          ? row.last_login.toISOString()
          : row.last_login
        : null,
    },
  });
});

export default router;
