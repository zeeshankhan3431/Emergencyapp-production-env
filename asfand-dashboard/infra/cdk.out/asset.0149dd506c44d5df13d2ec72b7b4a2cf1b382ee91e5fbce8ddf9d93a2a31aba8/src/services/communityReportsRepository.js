/**
 * Published community safety reports (PostgreSQL — no coordinates, no user PII).
 */
import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';

/**
 * @returns {Promise<Array<{ id: string, title: string, summary_text: string, published_at: Date }>>}
 */
export async function listPublishedCommunityReports() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, title, summary_text, published_at
     FROM community_reports
     WHERE is_published = TRUE
     ORDER BY published_at DESC
     LIMIT 100`
  );
  return rows;
}

/**
 * @param {{ title: string, summaryText: string }} p
 */
export async function insertCommunityReport(p) {
  const pool = getPool();
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO community_reports (id, title, summary_text, is_published)
     VALUES ($1, $2, $3, TRUE)
     RETURNING id, title, summary_text, published_at`,
    [id, p.title, p.summaryText]
  );
  return rows[0];
}
