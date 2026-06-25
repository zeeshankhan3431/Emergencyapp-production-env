import { Pool } from 'pg';

/** @type {import('pg').Pool | null} */
let poolInstance = null;

/** Build connection string from RDS_* parts (ECS/Lambda) or use DATABASE_URL. */
export function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;

  const host = process.env.RDS_HOST;
  const password = process.env.RDS_PASSWORD;
  if (!host || !password) return null;

  const port = process.env.RDS_PORT || '5432';
  const user = process.env.RDS_USER || 'era_admin';
  const database = process.env.RDS_DATABASE || 'emergencydb';
  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  return `postgresql://${encUser}:${encPass}@${host}:${port}/${database}`;
}

export function getPool() {
  if (!poolInstance) {
    const url = resolveDatabaseUrl();
    if (!url) {
      throw new Error('DATABASE_URL or RDS_HOST+RDS_PASSWORD is not set');
    }
    poolInstance = new Pool({ connectionString: url });
  }
  return poolInstance;
}

/** @param {import('pg').Pool | null} pool */
export function setPool(pool) {
  poolInstance = pool;
}

export async function resetPool() {
  if (poolInstance) {
    await poolInstance.end().catch(() => {});
    poolInstance = null;
  }
}
