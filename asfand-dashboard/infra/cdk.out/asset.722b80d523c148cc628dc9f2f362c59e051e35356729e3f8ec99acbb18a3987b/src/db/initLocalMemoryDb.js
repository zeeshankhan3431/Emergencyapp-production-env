/**
 * Local development: when DATABASE_URL is unset, use pg-mem with the same
 * schemas as tests (see server/test/schema*.sql) plus a small seed dataset.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { newDb, DataType } from 'pg-mem';
import { resetPool, resolveDatabaseUrl, setPool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCHEMA_FILES = [
  'schema.sql',
  'schema-incidents.sql',
  'schema-evidence.sql',
  'schema-analytics.sql',
];

/** Sample data so dashboard / incidents are non-empty in the browser. */
const SEED_SQL = `
INSERT INTO users (id, email, cognito_sub, role, full_name, is_verified)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'admin@era.dev',
  'dev-cognito-sub',
  'Admin',
  'ERA Admin',
  TRUE
) ON CONFLICT (id) DO NOTHING;

INSERT INTO incidents (id, user_id, type, lat, lng, status, triggered_at, urgency_score, confidence_score)
VALUES
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'assault', 40.7128, -74.0060, 'escalated', now() - interval '2 hours', 0.85, 0.9),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-000000000001', 'medical', 40.7580, -73.9855, 'triggered', now() - interval '1 day', 0.6, 0.75)
ON CONFLICT (id) DO NOTHING;
`;

/**
 * Call once at process startup before accepting traffic.
 * If DATABASE_URL is set, no-op (real Postgres via {@link ./pool.js}).
 */
export async function initLocalDatabaseIfNeeded() {
  if (resolveDatabaseUrl()) {
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL or RDS_HOST+RDS_PASSWORD is required when NODE_ENV=production. For local dev, unset NODE_ENV or use a non-production value.'
    );
  }

  if (process.env.SKIP_AUTH === undefined) {
    process.env.SKIP_AUTH = 'true';
  }
  if (process.env.AUDIT_LOG_DISABLED === undefined) {
    process.env.AUDIT_LOG_DISABLED = 'true';
  }

  console.log('[db] No DATABASE_URL — using in-memory Postgres (dev only).');
  console.log('[db] Tip: set DATABASE_URL to use a real Postgres (Docker, RDS, etc.).');

  await resetPool();

  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: DataType.uuid,
    implementation: () => randomUUID(),
  });

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const testDir = join(__dirname, '../../test');
  for (const file of SCHEMA_FILES) {
    const sql = readFileSync(join(testDir, file), 'utf8');
    await pool.query(sql);
  }
  await pool.query(SEED_SQL);

  if (process.env.COGNITO_USE_MOCK === 'true') {
    const { seedMockCognitoUser } = await import('../services/cognitoService.js');
    seedMockCognitoUser('admin@era.dev', 'EraAdmin123!', 'dev-cognito-sub', true);
  }

  setPool(pool);
  process.env.__ERA_MEMORY_DB = 'true';
}
