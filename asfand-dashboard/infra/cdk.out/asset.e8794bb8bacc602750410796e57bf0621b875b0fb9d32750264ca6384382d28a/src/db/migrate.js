import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const pool = getPool();
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  const incidents = readFileSync(join(__dirname, 'schema-incidents.sql'), 'utf8');
  await pool.query(incidents);
  const evidence = readFileSync(join(__dirname, 'schema-evidence.sql'), 'utf8');
  await pool.query(evidence);
  const analytics = readFileSync(join(__dirname, 'schema-analytics.sql'), 'utf8');
  await pool.query(analytics);
  const notifications = readFileSync(join(__dirname, 'schema-notifications.sql'), 'utf8');
  await pool.query(notifications);
}
