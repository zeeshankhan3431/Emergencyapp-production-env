/**
 * Time-series analytics from anonymised_incidents (k-safe data).
 * Bucketing is done in application code for PostgreSQL + pg-mem compatibility.
 */
import { getPool } from '../db/pool.js';

/**
 * @param {Date} d
 * @param {'day'|'week'|'month'} gran
 */
function bucketDate(d, gran) {
  const x = new Date(d);
  if (gran === 'month') {
    return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1)).toISOString();
  }
  if (gran === 'week') {
    const day = x.getUTCDay();
    const diff = (day + 6) % 7;
    const w = new Date(x);
    w.setUTCDate(x.getUTCDate() - diff);
    w.setUTCHours(0, 0, 0, 0);
    return w.toISOString();
  }
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())).toISOString();
}

/**
 * @param {{
 *   date_from?: string,
 *   date_to?: string,
 *   granularity?: 'day'|'week'|'month',
 * }} p
 */
export async function getAnalyticsTrends(p = {}) {
  const pool = getPool();
  const gran = p.granularity === 'week' || p.granularity === 'month' ? p.granularity : 'day';

  const conds = [`1=1`];
  const vals = [];
  let n = 1;
  if (p.date_from) {
    conds.push(`hour_bucket >= $${n}::timestamptz`);
    vals.push(p.date_from);
    n++;
  }
  if (p.date_to) {
    conds.push(`hour_bucket <= $${n}::timestamptz`);
    vals.push(p.date_to);
    n++;
  }
  const where = conds.join(' AND ');

  const { rows } = await pool.query(
    `SELECT hour_bucket, type::text AS type, COUNT(*)::INT AS cnt
     FROM anonymised_incidents
     WHERE ${where}
     GROUP BY hour_bucket, type
     ORDER BY hour_bucket ASC`,
    vals
  );

  /** @type {Map<string, { date: string, total: number, by_type: Record<string, number> }>} */
  const map = new Map();

  for (const r of rows) {
    const hb = r.hour_bucket instanceof Date ? r.hour_bucket : new Date(r.hour_bucket);
    const keyIso = bucketDate(hb, gran);
    if (!map.has(keyIso)) {
      map.set(keyIso, { date: keyIso, total: 0, by_type: {} });
    }
    const entry = map.get(keyIso);
    entry.by_type[r.type] = (entry.by_type[r.type] ?? 0) + r.cnt;
    entry.total += r.cnt;
  }

  const series = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { granularity: gran, series };
}
