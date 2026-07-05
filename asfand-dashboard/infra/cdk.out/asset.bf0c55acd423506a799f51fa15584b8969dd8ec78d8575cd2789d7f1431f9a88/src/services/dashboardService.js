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
       AND triggered_at IS NOT NULL
       AND triggered_at >= $1 AND triggered_at <= $2`,
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
    created_today:               esc.rows[0]?.c ?? 0,
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
       i.status,
       i.urgency_score,
       i.ai_summary,
       i.triggered_at,
       i.escalated_at,
       i.resolved_at,
       i.lat,
       i.lng,
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
    typeKey: r.type,
    status: r.status,
    urgency_score: r.urgency_score,
    ai_summary: r.ai_summary,
    triggered_at: r.triggered_at,
    escalated_at: r.escalated_at,
    resolved_at: r.resolved_at,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    openedAt: r.triggered_at,
    location: (r.lat && r.lng)
      ? `${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}`
      : (r.ai_summary ? r.ai_summary.slice(0, 40) : null),
    assigned_responder: r.assigned_responder_id
      ? { id: r.assigned_responder_id, full_name: r.responder_full_name }
      : null,
  }));

  return { items, total, page, limit };
}

/**
 * Incidents aggregated over time for chart.
 * @param {'today'|'7days'|'30days'} range
 */
export async function getIncidentsOverTime(range = 'today') {
  const pool = getPool();
  let sql;

  if (range === 'today') {
    // Group by hour for the last 24 hours
    sql = `
      SELECT
        TO_CHAR(DATE_TRUNC('hour', triggered_at), 'HH12 AM') AS time,
        COUNT(*)::INT AS incidents
      FROM incidents
      WHERE is_deleted = FALSE
        AND triggered_at >= NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', triggered_at)
      ORDER BY DATE_TRUNC('hour', triggered_at)
    `;
  } else if (range === '7days') {
    sql = `
      SELECT
        TO_CHAR(DATE_TRUNC('day', triggered_at), 'Mon DD') AS time,
        COUNT(*)::INT AS incidents
      FROM incidents
      WHERE is_deleted = FALSE
        AND triggered_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', triggered_at)
      ORDER BY DATE_TRUNC('day', triggered_at)
    `;
  } else {
    sql = `
      SELECT
        TO_CHAR(DATE_TRUNC('day', triggered_at), 'Mon DD') AS time,
        COUNT(*)::INT AS incidents
      FROM incidents
      WHERE is_deleted = FALSE
        AND triggered_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', triggered_at)
      ORDER BY DATE_TRUNC('day', triggered_at)
    `;
  }

  const { rows } = await pool.query(sql);
  return rows.map(r => ({ time: r.time, incidents: r.incidents }));
}

/**
 * Delete an incident (Admin only).
 * @param {string} id
 */
export async function deleteIncident(id) {
  const pool = getPool();
  await pool.query(`UPDATE incidents SET is_deleted = TRUE WHERE id = $1`, [id]);
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
