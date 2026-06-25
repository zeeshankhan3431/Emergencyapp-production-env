import { Pool } from 'pg';

/** @type {import('pg').Pool | null} */
let poolInstance = null;

export function getPool() {
  if (!poolInstance) {
    let url = process.env.DATABASE_URL;
    
    // If DATABASE_URL is not set, construct it from individual RDS environment variables
    if (!url) {
      const { RDS_HOST, RDS_PORT, RDS_USER, RDS_DATABASE, RDS_PASSWORD } = process.env;
      if (!RDS_HOST || !RDS_PORT || !RDS_USER || !RDS_DATABASE || !RDS_PASSWORD) {
        throw new Error('DATABASE_URL is not set and RDS environment variables are incomplete');
      }
      url = `postgresql://${RDS_USER}:${RDS_PASSWORD}@${RDS_HOST}:${RDS_PORT}/${RDS_DATABASE}`;
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
