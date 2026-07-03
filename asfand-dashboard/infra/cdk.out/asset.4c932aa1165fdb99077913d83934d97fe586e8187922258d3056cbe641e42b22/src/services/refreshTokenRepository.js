import { getPool } from '../db/pool.js';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const REFRESH_DAYS = 7;

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hashRefreshToken(token) {
  return hashToken(token);
}

/**
 * @param {string} a
 * @param {string} b
 */
export function safeEqualHex(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function generateRefreshToken() {
  return randomBytes(48).toString('base64url');
}

/** @param {string} userId */
export async function insertRefreshToken(userId) {
  const pool = getPool();
  const raw = generateRefreshToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, expires_at`,
    [id, userId, tokenHash, expiresAt.toISOString()]
  );
  return { raw, id: rows[0].id, expiresAt: rows[0].expires_at };
}

/**
 * Find valid token row by raw token, optionally revoke old and insert new (rotation).
 * @param {string} rawToken
 * @param {{ rotate: boolean }} [opts]
 */
export async function consumeRefreshToken(rawToken, opts = { rotate: true }) {
  const pool = getPool();
  const tokenHash = hashToken(rawToken);
  const { rows } = await pool.query(
    `SELECT id, user_id, token_hash, expires_at, revoked
     FROM refresh_tokens WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row || row.revoked) return { ok: false, reason: 'invalid' };
  if (new Date(row.expires_at) < new Date()) return { ok: false, reason: 'expired' };

  if (!opts.rotate) {
    return { ok: true, userId: row.user_id, tokenId: row.id };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`, [row.id]);
    const raw = generateRefreshToken();
    const newHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
    const newId = randomUUID();
    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [newId, row.user_id, newHash, expiresAt.toISOString()]
    );
    await client.query('COMMIT');
    return { ok: true, userId: row.user_id, newRefreshToken: raw };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** @param {string} rawToken */
export async function revokeRefreshToken(rawToken) {
  const pool = getPool();
  const tokenHash = hashToken(rawToken);
  const r = await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1 AND revoked = FALSE`, [
    tokenHash,
  ]);
  return (r.rowCount ?? 0) > 0;
}

/** @param {string} userId */
export async function revokeAllRefreshTokensForUser(userId) {
  const pool = getPool();
  await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`, [userId]);
}

export { REFRESH_DAYS };
