import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'node:crypto';
import { newDb, DataType } from 'pg-mem';
import { setPool, resetPool } from '../../src/db/pool.js';
import { __clearCognitoMock } from '../../src/services/cognitoService.js';
import { __resetLoginRateLimitMemory } from '../../src/services/loginRateLimitService.js';
import { __clearMemoryAuditLog } from '../../src/services/auditService.js';
import { __clearKinesisMock } from '../../src/services/kinesisService.js';
import { __clearSnsMock } from '../../src/services/snsService.js';
import { __clearS3Mock } from '../../src/services/s3Service.js';
import { __clearSqsMock } from '../../src/services/sqsService.js';
import { __clearEvidenceAuditLog } from '../../src/services/evidenceAuditService.js';
import { __clearSageMakerMock } from '../../src/services/sageMakerService.js';
import { __clearAiResultsMemory } from '../../src/services/aiResultsRepository.js';
import { __clearSsmCache } from '../../src/services/ssmService.js';
import { __clearReportsMemory } from '../../src/services/reportsService.js';
import { __resetSafetyTipsMock } from '../../src/services/safetyTipsService.js';
import { __resetOpenSearchMock } from '../../src/services/openSearchService.js';
import { __clearDeviceTokensMock } from '../../src/services/deviceTokensService.js';
import { __clearNotificationLogMock } from '../../src/services/notificationLogService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initTestDatabase() {
  await resetPool();
  __clearCognitoMock();
  __resetLoginRateLimitMemory();
  __clearMemoryAuditLog();
  __clearKinesisMock();
  __clearSnsMock();
  __clearS3Mock();
  __clearSqsMock();
  __clearEvidenceAuditLog();
  __clearSageMakerMock();
  __clearAiResultsMemory();
  __clearSsmCache();
  __clearReportsMemory();
  __resetSafetyTipsMock();
  __resetOpenSearchMock();
  __clearDeviceTokensMock();
  __clearNotificationLogMock();

  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: DataType.uuid,
    implementation: () => randomUUID(),
  });

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const sql = readFileSync(join(__dirname, '../schema.sql'), 'utf8');
  await pool.query(sql);
  const sqlIncidents = readFileSync(join(__dirname, '../schema-incidents.sql'), 'utf8');
  await pool.query(sqlIncidents);
  const sqlEvidence = readFileSync(join(__dirname, '../schema-evidence.sql'), 'utf8');
  await pool.query(sqlEvidence);
  const sqlAnalytics = readFileSync(join(__dirname, '../schema-analytics.sql'), 'utf8');
  await pool.query(sqlAnalytics);
  setPool(pool);
  return pool;
}

export async function teardownTestDatabase() {
  await resetPool();
}
