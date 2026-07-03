import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';

const COLS = `id, incident_id, user_id, s3_key, checksum_sha256, file_size_bytes,
              status, reject_reason, created_at, uploaded_at, verified_at`;

/**
 * @param {{
 *   id?: string;
 *   incidentId: string;
 *   userId: string;
 *   s3Key: string;
 *   checksumSha256: string;
 *   fileSizeBytes: number;
 * }} p
 */
export async function createEvidence(p) {
  const pool = getPool();
  const id = p.id ?? randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO evidence (id, incident_id, user_id, s3_key, checksum_sha256, file_size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLS}`,
    [id, p.incidentId, p.userId, p.s3Key, p.checksumSha256.toLowerCase(), p.fileSizeBytes]
  );
  return rows[0];
}

/** @param {string} id */
export async function findEvidenceById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM evidence WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

/** @param {string} s3Key */
export async function findEvidenceByS3Key(s3Key) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM evidence WHERE s3_key = $1 LIMIT 1`,
    [s3Key]
  );
  return rows[0] ?? null;
}

/** @param {string} incidentId */
export async function listEvidenceForIncident(incidentId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM evidence WHERE incident_id = $1 ORDER BY created_at DESC`,
    [incidentId]
  );
  return rows;
}

/**
 * @param {string} id
 * @param {{ status: string, rejectReason?: string, uploadedAt?: Date, verifiedAt?: Date }} updates
 */
export async function updateEvidenceStatus(id, updates) {
  const pool = getPool();
  const sets = [];
  const vals = [];
  let n = 1;

  if (updates.status !== undefined)       { sets.push(`status = $${n}`);        vals.push(updates.status);       n++; }
  if (updates.rejectReason !== undefined) { sets.push(`reject_reason = $${n}`); vals.push(updates.rejectReason); n++; }
  if (updates.uploadedAt !== undefined)   { sets.push(`uploaded_at = $${n}`);   vals.push(updates.uploadedAt);   n++; }
  if (updates.verifiedAt !== undefined)   { sets.push(`verified_at = $${n}`);   vals.push(updates.verifiedAt);   n++; }

  if (sets.length === 0) return null;
  vals.push(id);

  const { rows } = await pool.query(
    `UPDATE evidence SET ${sets.join(', ')} WHERE id = $${n} RETURNING ${COLS}`,
    vals
  );
  return rows[0] ?? null;
}
