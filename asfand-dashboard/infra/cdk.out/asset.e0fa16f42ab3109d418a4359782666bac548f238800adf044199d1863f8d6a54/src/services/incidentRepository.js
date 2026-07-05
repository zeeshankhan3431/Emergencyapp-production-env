import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';

/** Columns selected for public incident payloads */
const INCIDENT_COLS = `
  id, user_id, type, lat, lng, status, confidence_score,
  assigned_responder_id, encrypted_audio_s3_key, transcript_s3_key,
  ai_summary, urgency_score, is_deleted, triggered_at, escalated_at,
  resolved_at, device_id, accuracy
`;

/**
 * @typedef {object} CreateIncidentInput
 * @property {string} userId
 * @property {string} type
 * @property {number} lat
 * @property {number} lng
 * @property {number | null} [accuracy]
 * @property {string | null} [deviceId]
 * @property {string | null} [encryptedAudioS3Key]
 */

/** @param {CreateIncidentInput} p */
export async function createIncident(p) {
  const pool = getPool();
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO incidents
       (id, user_id, type, lat, lng, accuracy, device_id, encrypted_audio_s3_key)
     VALUES ($1, $2, $3::incident_type, $4, $5, $6, $7, $8)
     RETURNING ${INCIDENT_COLS}`,
    [
      id,
      p.userId,
      p.type,
      p.lat,
      p.lng,
      p.accuracy ?? null,
      p.deviceId ?? null,
      p.encryptedAudioS3Key ?? null,
    ]
  );
  return rows[0];
}

/**
 * @param {{
 *   status?: string;
 *   type?: string;
 *   from?: string;
 *   to?: string;
 *   userId?: string;
 *   page?: number;
 *   limit?: number;
 *   includeDeleted?: boolean;
 * }} filters
 */
export async function listIncidents(filters = {}) {
  const pool = getPool();
  const { status, type, from, to, userId, page = 1, limit = 20, includeDeleted = false } = filters;
  const conds = [];
  const vals = [];
  let n = 1;

  if (!includeDeleted) { conds.push(`is_deleted = FALSE`); }
  if (status) { conds.push(`status = $${n}::incident_status`); vals.push(status); n++; }
  if (type)   { conds.push(`type = $${n}::incident_type`);     vals.push(type);   n++; }
  if (from)   { conds.push(`triggered_at >= $${n}`);           vals.push(from);   n++; }
  if (to)     { conds.push(`triggered_at <= $${n}`);           vals.push(to);     n++; }
  if (userId) { conds.push(`user_id = $${n}`);                 vals.push(userId); n++; }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countQ = await pool.query(`SELECT COUNT(*) FROM incidents ${where}`, vals);
  const total = Number(countQ.rows[0].count);

  vals.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT ${INCIDENT_COLS} FROM incidents ${where}
     ORDER BY triggered_at DESC LIMIT $${n} OFFSET $${n + 1}`,
    vals
  );
  return { rows, total, page, limit };
}

/** @param {string} id */
export async function getIncidentById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${INCIDENT_COLS} FROM incidents WHERE id = $1 AND is_deleted = FALSE LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * @param {string} id
 * @param {{
 *   status?: string;
 *   confidenceScore?: number;
 *   assignedResponderId?: string | null;
 *   transcriptS3Key?: string | null;
 *   aiSummary?: string | null;
 *   urgencyScore?: number | null;
 *   escalatedAt?: Date | null;
 *   resolvedAt?: Date | null;
 * }} updates
 */
export async function updateIncident(id, updates) {
  const pool = getPool();
  const sets = [];
  const vals = [];
  let n = 1;

  if (updates.status !== undefined) {
    sets.push(`status = $${n}::incident_status`); vals.push(updates.status); n++;
  }
  if (updates.confidenceScore !== undefined) {
    sets.push(`confidence_score = $${n}`); vals.push(updates.confidenceScore); n++;
  }
  if (updates.assignedResponderId !== undefined) {
    sets.push(`assigned_responder_id = $${n}`); vals.push(updates.assignedResponderId); n++;
  }
  if (updates.transcriptS3Key !== undefined) {
    sets.push(`transcript_s3_key = $${n}`); vals.push(updates.transcriptS3Key); n++;
  }
  if (updates.aiSummary !== undefined) {
    sets.push(`ai_summary = $${n}`); vals.push(updates.aiSummary); n++;
  }
  if (updates.urgencyScore !== undefined) {
    sets.push(`urgency_score = $${n}`); vals.push(updates.urgencyScore); n++;
  }
  if (updates.escalatedAt !== undefined) {
    sets.push(`escalated_at = $${n}`); vals.push(updates.escalatedAt); n++;
  }
  if (updates.resolvedAt !== undefined) {
    sets.push(`resolved_at = $${n}`); vals.push(updates.resolvedAt); n++;
  }
  if (sets.length === 0) return null;

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE incidents SET ${sets.join(', ')} WHERE id = $${n} AND is_deleted = FALSE
     RETURNING ${INCIDENT_COLS}`,
    vals
  );
  return rows[0] ?? null;
}

/** @param {string} id */
export async function softDeleteIncident(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE incidents SET is_deleted = TRUE WHERE id = $1 RETURNING id`,
    [id]
  );
  return (rows.length ?? 0) > 0;
}

/**
 * Geospatial nearest available Responder.
 * Uses PostGIS when available, falls back to Haversine approximation.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string | null>} user id of nearest responder
 */
export async function findNearestResponder(lat, lng) {
  const pool = getPool();

  // Occupied responder IDs (active incidents)
  const occupied = await pool.query(
    `SELECT assigned_responder_id FROM incidents
     WHERE assigned_responder_id IS NOT NULL
       AND status IN ('escalated','responder_assigned')`
  );
  const occupiedIds = occupied.rows.map((r) => r.assigned_responder_id);

  try {
    // PostGIS path — production only
    if (occupiedIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE role = 'Responder' AND id <> ALL($3::uuid[])
         ORDER BY ST_Distance(
           geography(ST_MakePoint($2, $1)),
           geography(ST_MakePoint($2, $1))
         ) ASC LIMIT 1`,
        [lat, lng, occupiedIds]
      );
      return rows[0]?.id ?? null;
    } else {
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE role = 'Responder'
         ORDER BY ST_Distance(
           geography(ST_MakePoint($2, $1)),
           geography(ST_MakePoint($2, $1))
         ) ASC LIMIT 1`,
        [lat, lng]
      );
      return rows[0]?.id ?? null;
    }
  } catch {
    // Fallback: no PostGIS (test env) — return any unoccupied Responder
    if (occupiedIds.length > 0) {
      const placeholders = occupiedIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE role = 'Responder' AND id NOT IN (${placeholders}) LIMIT 1`,
        occupiedIds
      );
      return rows[0]?.id ?? null;
    }
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE role = 'Responder' LIMIT 1`
    );
    return rows[0]?.id ?? null;
  }
}

// ─── Notes ───────────────────────────────────────────────────────────────────

/**
 * @param {{ incidentId: string, responderId: string, body: string }} p
 */
export async function addIncidentNote(p) {
  const pool = getPool();
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO incident_notes (id, incident_id, responder_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, incident_id, responder_id, body, created_at`,
    [id, p.incidentId, p.responderId, p.body]
  );
  return rows[0];
}

/** @param {string} incidentId */
export async function listIncidentNotes(incidentId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, incident_id, responder_id, body, created_at
     FROM incident_notes WHERE incident_id = $1
     ORDER BY created_at ASC`,
    [incidentId]
  );
  return rows;
}
