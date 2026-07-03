import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';

/**
 * @typedef {import('../constants/roles.js').UserRole} UserRole
 */

/** @param {string} email */
export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export const DEFAULT_NOTIFICATION_PREFS = /** @type {const} */ ({
  sms_enabled:           true,
  push_enabled:          true,
  email_digest_enabled:  false,
});

/** @param {unknown} raw */
export function parseNotificationPrefs(raw) {
  const d = { ...DEFAULT_NOTIFICATION_PREFS };
  if (raw == null) return d;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return { ...d, .../** @type {object} */ (raw) };
  }
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return { ...d, ...o };
    } catch {
      return d;
    }
  }
  return d;
}

const USER_COLS = `id, email, cognito_sub, role, full_name, phone, is_verified, created_at, last_login, notification_prefs`;

/**
 * @typedef {object} UserRow
 * @property {string} id
 * @property {string} email
 * @property {string | null} cognito_sub
 * @property {UserRole} role
 * @property {string} full_name
 * @property {string | null} phone
 * @property {boolean} is_verified
 * @property {Date} created_at
 * @property {Date | null} last_login
 */

/** @param {string} email */
export async function findUserByEmail(email) {
  const pool = getPool();
  const norm = normalizeEmail(email);
  const { rows } = await pool.query(
    `SELECT ${USER_COLS}
     FROM users WHERE email = $1 LIMIT 1`,
    [norm]
  );
  return /** @type {UserRow | undefined} */ (mapUserRow(rows[0]));
}

/** @param {string} id */
export async function findUserById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${USER_COLS}
     FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return /** @type {UserRow | undefined} */ (mapUserRow(rows[0]));
}

/** @param {string} cognitoSub */
export async function findUserByCognitoSub(cognitoSub) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${USER_COLS}
     FROM users WHERE cognito_sub = $1 LIMIT 1`,
    [cognitoSub]
  );
  return /** @type {UserRow | undefined} */ (mapUserRow(rows[0]));
}

/** @param {unknown} row */
function mapUserRow(row) {
  if (!row) return row;
  const r = /** @type {Record<string, unknown>} */ (row);
  const prefs = parseNotificationPrefs(r.notification_prefs);
  return { ...r, notificationPrefs: prefs };
}

/**
 * @param {{ email: string, cognitoSub: string, role: UserRole, fullName: string, phone?: string | null, isVerified?: boolean }} p
 */
export async function insertUser(p) {
  const pool = getPool();
  const email = normalizeEmail(p.email);
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, cognito_sub, role, full_name, phone, is_verified)
     VALUES ($1, $2, $3, $4::user_role, $5, $6, $7)
     RETURNING ${USER_COLS}`,
    [id, email, p.cognitoSub, p.role, p.fullName, p.phone ?? null, p.isVerified ?? false]
  );
  return /** @type {UserRow} */ (mapUserRow(rows[0]));
}

/**
 * @param {string} userId
 * @param {Partial<typeof DEFAULT_NOTIFICATION_PREFS>} prefs
 */
export async function updateNotificationPrefs(userId, prefs) {
  const pool = getPool();
  const cur = await findUserById(userId);
  if (!cur) return null;
  const base = cur.notificationPrefs ?? parseNotificationPrefs(cur.notification_prefs);
  const merged = { ...base, ...prefs };
  await pool.query(
    `UPDATE users SET notification_prefs = $1::jsonb WHERE id = $2`,
    [JSON.stringify(merged), userId]
  );
  return findUserById(userId);
}

/** @param {string} userId */
export async function updateLastLogin(userId) {
  const pool = getPool();
  await pool.query(`UPDATE users SET last_login = now() WHERE id = $1`, [userId]);
}

/** @param {string} userId @param {boolean} verified */
export async function setUserVerified(userId, verified) {
  const pool = getPool();
  await pool.query(`UPDATE users SET is_verified = $2 WHERE id = $1`, [userId, verified]);
}
