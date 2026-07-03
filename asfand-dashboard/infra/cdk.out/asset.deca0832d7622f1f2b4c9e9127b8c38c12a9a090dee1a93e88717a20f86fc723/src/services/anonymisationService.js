/**
 * k-anonymity pipeline (k ≥ 5) for anonymised_incidents.
 *
 * Quasi-identifiers: generalised lat/lng (3 decimals ~111m), hour bucket, incident type.
 * Cohort: users sharing the same generalised location bucket (lat/lng grid only).
 *
 * Rows are written only when an equivalence class has at least 5 terminal incidents
 * (resolved | cancelled) that are not yet anonymised; then all members of that class
 * are inserted together.
 */
import { createHash, randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';

export const K_ANON_MIN = 5;

/**
 * Round coordinates to 3 decimal places (~111m grid).
 * @param {number} lat
 * @param {number} lng
 * @returns {{ generalised_lat: number, generalised_lng: number }}
 */
export function generaliseCoordinates(lat, lng) {
  return {
    generalised_lat: Math.round(lat * 1000) / 1000,
    generalised_lng: Math.round(lng * 1000) / 1000,
  };
}

/**
 * Round timestamp to nearest hour (UTC).
 * @param {Date | string} d
 * @returns {Date}
 */
export function hourBucket(d) {
  const t = d instanceof Date ? d : new Date(d);
  const ms = t.getTime();
  const hourMs = 60 * 60 * 1000;
  return new Date(Math.floor(ms / hourMs) * hourMs);
}

/**
 * Stable cohort id from generalised location bucket only (no time/type).
 * @param {number} glat
 * @param {number} glng
 */
export function computeCohortId(glat, glng) {
  const h = createHash('sha256').update(`cohort|${glat}|${glng}`).digest('hex');
  return `coh_${h.slice(0, 16)}`;
}

/**
 * Equivalence key string for grouping (used in tests / debugging).
 */
export function equivalenceKey(glat, glng, hourIso, type) {
  return `${glat}|${glng}|${hourIso}|${type}`;
}

/**
 * After an incident reaches a terminal state, attempt to publish anonymised rows
 * for every equivalence class that now satisfies k ≥ 5.
 * Implementation groups in application code for PostgreSQL + pg-mem compatibility.
 *
 * @returns {Promise<number>} number of new anonymised rows inserted
 */
export async function syncAnonymisedIncidents() {
  const pool = getPool();

  const { rows: pending } = await pool.query(
    `SELECT
       i.id,
       i.lat,
       i.lng,
       i.triggered_at,
       i.type::text AS typ,
       i.ai_summary,
       i.urgency_score,
       i.status::text AS st
     FROM incidents i
     WHERE i.is_deleted = FALSE
       AND i.status IN ('resolved', 'cancelled')
       AND i.id NOT IN (SELECT source_incident_id FROM anonymised_incidents)`
  );

  /** @type {Map<string, Array<typeof pending[0] & { glat: number, glng: number, hb: Date }>>} */
  const groups = new Map();

  for (const r of pending) {
    const glat = Math.round(Number(r.lat) * 1000) / 1000;
    const glng = Math.round(Number(r.lng) * 1000) / 1000;
    const hb = hourBucket(r.triggered_at);
    const typ = String(r.typ);
    const k = `${glat}|${glng}|${hb.toISOString()}|${typ}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ ...r, glat, glng, hb, typ });
  }

  let inserted = 0;

  for (const members of groups.values()) {
    if (members.length < K_ANON_MIN) continue;
    const kSize = members.length;

    for (const m of members) {
      const cohortId = computeCohortId(m.glat, m.glng);
      const outcome = m.st === 'cancelled' ? 'cancelled' : 'resolved';
      const id = randomUUID();

      try {
        await pool.query(
          `INSERT INTO anonymised_incidents (
             id, source_incident_id, generalised_lat, generalised_lng, hour_bucket,
             cohort_id, type, ai_summary, urgency_score, outcome, k_anon_group_size
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::incident_type, $8, $9, $10, $11)
           ON CONFLICT (source_incident_id) DO NOTHING`,
          [
            id,
            m.id,
            m.glat,
            m.glng,
            m.hb,
            cohortId,
            m.typ,
            m.ai_summary ?? null,
            m.urgency_score ?? null,
            outcome,
            kSize,
          ]
        );
        inserted += 1;
      } catch (e) {
        console.error('[anonymisation] insert failed', e);
      }
    }
  }

  return inserted;
}

/**
 * For unit tests: compute whether a set of synthetic rows would satisfy k-anonymity
 * when grouped by (glat, glng, hour, type).
 *
 * @param {Array<{ glat: number, glng: number, hour: string, type: string }>} records
 * @returns {{ satisfied: boolean, minGroupSize: number }}
 */
export function evaluateKAnonymity(records) {
  const map = new Map();
  for (const rec of records) {
    const k = `${rec.glat}|${rec.glng}|${rec.hour}|${rec.type}`;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  let min = Infinity;
  for (const c of map.values()) min = Math.min(min, c);
  if (!Number.isFinite(min)) min = 0;
  return { satisfied: min >= K_ANON_MIN, minGroupSize: min === Infinity ? 0 : min };
}
