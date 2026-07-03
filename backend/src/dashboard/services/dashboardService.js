/**
 * Admin dashboard aggregates (raw incidents — Admin only except where noted).
 */
import { getPool } from '../db/pool.js';

/** UTC start/end of "today" for simple timestamp comparisons (pg-mem friendly). */
function utcTodayBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

function daysAgoUtc(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * @returns {Promise<{
 *   active_incidents: number,
 *   escalated_today: number,
 *   resolved_today: number,
 *   avg_response_time_seconds: number | null,
 *   top_incident_types: Array<{ type: string, count: number }>,
 *   hotspot_count: number
 * }>}
 */
export async function getDashboardStats() {
  const pool = getPool();
  const { start: dayStart, end: dayEnd } = utcTodayBounds();
  const thirtyAgo = daysAgoUtc(30);

  const active = await pool.query(
    `SELECT COUNT(*)::INT AS c FROM incidents
     WHERE is_deleted = FALSE AND status IN ('triggered','ai_processing','escalated','responder_assigned')`
  );

  const esc = await pool.query(
    `SELECT COUNT(*)::INT AS c FROM incidents
     WHERE is_deleted = FALSE
       AND escalated_at IS NOT NULL
       AND escalated_at >= $1 AND escalated_at <= $2`,
    [dayStart, dayEnd]
  );

  const resToday = await pool.query(
    `SELECT COUNT(*)::INT AS c FROM incidents
     WHERE is_deleted = FALSE
       AND status = 'resolved'
       AND resolved_at IS NOT NULL
       AND resolved_at >= $1 AND resolved_at <= $2`,
    [dayStart, dayEnd]
  );

  const avgRt = await pool.query(
    `SELECT AVG(
         EXTRACT(EPOCH FROM resolved_at) - EXTRACT(EPOCH FROM triggered_at)
       ) AS sec
     FROM incidents
     WHERE is_deleted = FALSE
       AND resolved_at IS NOT NULL
       AND triggered_at IS NOT NULL
       AND resolved_at >= $1 AND resolved_at <= $2`,
    [dayStart, dayEnd]
  );

  const topTypes = await pool.query(
    `SELECT type::text AS type, COUNT(*)::INT AS count
     FROM incidents
     WHERE is_deleted = FALSE
       AND triggered_at >= $1
     GROUP BY type
     ORDER BY count DESC
     LIMIT 5`,
    [thirtyAgo]
  );

  const hot = await pool.query(
    `SELECT COUNT(DISTINCT cohort_id)::INT AS c
     FROM anonymised_incidents
     WHERE created_at >= $1`,
    [thirtyAgo]
  );

  const avgSec = avgRt.rows[0]?.sec;
  return {
    active_incidents:            active.rows[0]?.c ?? 0,
    escalated_today:             esc.rows[0]?.c ?? 0,
    resolved_today:              resToday.rows[0]?.c ?? 0,
    avg_response_time_seconds:   avgSec != null ? Math.round(Number(avgSec) * 100) / 100 : null,
    top_incident_types:          topTypes.rows.map((r) => ({ type: r.type, count: r.count })),
    hotspot_count:               hot.rows[0]?.c ?? 0,
  };
}

/**
 * Paginated incident list for Admin dashboard (no end-user PII; responder name allowed).
 * @param {{
 *   status?: string,
 *   type?: string,
 *   date_from?: string,
 *   date_to?: string,
 *   responder_id?: string,
 *   page?: number,
 *   limit?: number,
 * }} filters
 */
export async function listDashboardIncidents(filters = {}) {
  const pool = getPool();
  const {
    status,
    type,
    date_from: dateFrom,
    date_to: dateTo,
    responder_id: responderId,
    page = 1,
    limit = 20,
  } = filters;

  const conds = [`i.is_deleted = FALSE`];
  const vals = [];
  let n = 1;

  if (status) {
    conds.push(`i.status = $${n}::incident_status`);
    vals.push(status);
    n++;
  }
  if (type) {
    conds.push(`i.type = $${n}::incident_type`);
    vals.push(type);
    n++;
  }
  if (dateFrom) {
    conds.push(`i.triggered_at >= $${n}`);
    vals.push(dateFrom);
    n++;
  }
  if (dateTo) {
    conds.push(`i.triggered_at <= $${n}`);
    vals.push(dateTo);
    n++;
  }
  if (responderId) {
    conds.push(`i.assigned_responder_id = $${n}`);
    vals.push(responderId);
    n++;
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countQ = await pool.query(
    `SELECT COUNT(*) FROM incidents i ${where}`,
    vals
  );
  const total = Number(countQ.rows[0].count);

  vals.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT
       i.id,
       i.type,
       i.lat,
       i.lng,
       i.status,
       i.urgency_score,
       i.ai_summary,
       i.triggered_at,
       i.escalated_at,
       i.resolved_at,
       i.assigned_responder_id,
       r.full_name AS responder_full_name
     FROM incidents i
     LEFT JOIN users r ON r.id = i.assigned_responder_id
     ${where}
     ORDER BY i.triggered_at DESC
     LIMIT $${n} OFFSET $${n + 1}`,
    vals
  );

  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    lat: r.lat,
    lng: r.lng,
    status: r.status,
    urgency_score: r.urgency_score,
    ai_summary: r.ai_summary,
    triggered_at: r.triggered_at,
    escalated_at: r.escalated_at,
    resolved_at: r.resolved_at,
    assigned_responder: r.assigned_responder_id
      ? { id: r.assigned_responder_id, full_name: r.responder_full_name }
      : null,
  }));

  return { items, total, page, limit };
}

/**
 * Anonymised points for heatmap (last N days).
 * @param {number} [days]
 */
export async function listAnonymisedMapPoints(days = 30) {
  const pool = getPool();
  const since = daysAgoUtc(days);
  const { rows } = await pool.query(
    `SELECT
       generalised_lat,
       generalised_lng,
       hour_bucket,
       type::text AS type,
       cohort_id,
       urgency_score,
       outcome
     FROM anonymised_incidents
     WHERE created_at >= $1
     ORDER BY hour_bucket DESC
     LIMIT 5000`,
    [since]
  );
  return rows;
}

/**
 * 24-hour incident volume — hourly buckets for the Incidents Over Time chart.
 * Returns array of { time: string, incidents: number } for the last 24 hours.
 */
export async function getIncidentsOverTime() {
  const pool = getPool();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `SELECT triggered_at
     FROM incidents
     WHERE is_deleted = FALSE
       AND triggered_at IS NOT NULL
       AND triggered_at >= $1
     ORDER BY triggered_at ASC`,
    [since]
  );

  // Build 24 hourly buckets
  const now = new Date();
  const buckets = {};
  for (let h = 23; h >= 0; h--) {
    const d = new Date(now);
    d.setUTCMinutes(0, 0, 0);
    d.setUTCHours(d.getUTCHours() - h);
    const hour = d.getUTCHours();
    const label = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
    buckets[d.toISOString().slice(0, 13)] = { time: label, incidents: 0 };
  }

  for (const r of rows) {
    const ts = r.triggered_at instanceof Date ? r.triggered_at : new Date(r.triggered_at);
    const key = ts.toISOString().slice(0, 13);
    if (buckets[key]) {
      buckets[key].incidents += 1;
    }
  }

  return Object.values(buckets);
}

/**
 * Date-range aware chart data for the dropdown.
 * @param {'today'|'7days'|'30days'} range
 * @returns Array<{ time: string, incidents: number }>
 */
export async function getIncidentsOverTimeByRange(range = 'today') {
  const pool = getPool();

  if (range === '7days' || range === '30days') {
    const days = range === '7days' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { rows } = await pool.query(
      `SELECT DATE(triggered_at AT TIME ZONE 'UTC') AS day, COUNT(*)::INT AS c
       FROM incidents
       WHERE is_deleted = FALSE AND triggered_at IS NOT NULL AND triggered_at >= $1
       GROUP BY day ORDER BY day ASC`,
      [since]
    );
    // Build a bucket per day
    const buckets = {};
    for (let d = days - 1; d >= 0; d--) {
      const dt = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
      const key = dt.toISOString().slice(0, 10);
      const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      buckets[key] = { time: label, incidents: 0 };
    }
    for (const r of rows) {
      const key = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
      if (buckets[key]) buckets[key].incidents = r.c;
    }
    return Object.values(buckets);
  }

  // Default: today (24h hourly)
  return getIncidentsOverTime();
}

