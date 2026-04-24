import { Pool } from 'pg';

/** @type {import('pg').Pool | null} */
let poolInstance = null;

export function getPool() {
  if (!poolInstance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
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
