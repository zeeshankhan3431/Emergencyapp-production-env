/**
 * Monthly analytics reports — S3 JSON + DynamoDB reports_index (idempotent per month).
 */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getPool } from '../db/pool.js';
import { putTextObject, getObjectText } from './s3Service.js';

const TABLE = () => process.env.REPORTS_INDEX_TABLE ?? 'reports_index';
const BUCKET = () => process.env.S3_REPORTS_BUCKET ?? process.env.S3_EVIDENCE_BUCKET ?? 'era-evidence-dev';

/** @type {DynamoDBDocumentClient | null} */
let doc = null;
function getDoc() {
  if (!doc) {
    const c = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    doc = DynamoDBDocumentClient.from(c, { marshallOptions: { removeUndefinedValues: true } });
  }
  return doc;
}

/** @type {Map<string, { s3Key: string, generatedAt: string, body?: string }>} */
const memIndex = new Map();

export function useMock() {
  return process.env.REPORTS_INDEX_DISABLED === 'true';
}

function key(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function s3Key(year, month) {
  return `reports/${year}/${String(month).padStart(2, '0')}.json`;
}

/**
 * @param {number} year
 * @param {number} month 1-12
 */
export async function getMonthlyReportRecord(year, month) {
  const pk = key(year, month);
  if (useMock()) {
    return memIndex.get(pk) ?? null;
  }
  const res = await getDoc().send(
    new GetCommand({ TableName: TABLE(), Key: { report_key: pk } })
  );
  return res.Item ?? null;
}

/**
 * @param {number} year
 * @param {number} month
 * @returns {Promise<object | null>} parsed JSON or null
 */
export async function getMonthlyReportJson(year, month) {
  const rec = await getMonthlyReportRecord(year, month);
  if (rec?.body) {
    try { return JSON.parse(rec.body); } catch { return null; }
  }
  if (rec?.s3Key) {
    try {
      const text = await getObjectText(rec.s3Key, BUCKET());
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Idempotent: if report already exists for month, returns { cached: true } without regenerating.
 * @param {number} year
 * @param {number} month
 */
export async function generateMonthlyReport(year, month) {
  const pk = key(year, month);
  const existing = await getMonthlyReportRecord(year, month);
  if (existing?.s3Key || existing?.body) {
    return { cached: true, report_key: pk };
  }

  const body = await buildMonthlyReportPayload(year, month);
  const json = JSON.stringify(body, null, 2);
  const sk = s3Key(year, month);

  await putTextObject(sk, json, BUCKET());

  const item = {
    report_key:    pk,
    s3_key:        sk,
    generated_at:  new Date().toISOString(),
    status:        'complete',
  };

  if (useMock()) {
    memIndex.set(pk, { s3Key: sk, generatedAt: item.generated_at, body: json });
    return { cached: false, report_key: pk, s3_key: sk };
  }

  await getDoc().send(new PutCommand({ TableName: TABLE(), Item: item }));
  return { cached: false, report_key: pk, s3_key: sk };
}

/**
 * Core statistics + LLM narrative (mocked in tests via REPORTS_LLM_MOCK).
 * @param {number} year
 * @param {number} month
 */
async function buildMonthlyReportPayload(year, month) {
  const pool = getPool();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const total = await pool.query(
    `SELECT COUNT(*)::INT AS c FROM anonymised_incidents
     WHERE hour_bucket >= $1 AND hour_bucket <= $2`,
    [start.toISOString(), end.toISOString()]
  );

  const byType = await pool.query(
    `SELECT type::text AS type, COUNT(*)::INT AS count
     FROM anonymised_incidents
     WHERE hour_bucket >= $1 AND hour_bucket <= $2
     GROUP BY type
     ORDER BY count DESC`,
    [start.toISOString(), end.toISOString()]
  );

  const hotspots = await pool.query(
    `SELECT generalised_lat, generalised_lng, cohort_id, COUNT(*)::INT AS count
     FROM anonymised_incidents
     WHERE hour_bucket >= $1 AND hour_bucket <= $2
     GROUP BY generalised_lat, generalised_lng, cohort_id
     ORDER BY count DESC
     LIMIT 5`,
    [start.toISOString(), end.toISOString()]
  );

  const urgency = await pool.query(
    `SELECT AVG(urgency_score)::float AS u FROM anonymised_incidents
     WHERE hour_bucket >= $1 AND hour_bucket <= $2 AND urgency_score IS NOT NULL`,
    [start.toISOString(), end.toISOString()]
  );

  const totalForRate = await pool.query(
    `SELECT COUNT(*)::INT AS c FROM anonymised_incidents
     WHERE hour_bucket >= $1 AND hour_bucket <= $2`,
    [start.toISOString(), end.toISOString()]
  );
  const resolvedCnt = await pool.query(
    `SELECT COUNT(*)::INT AS c FROM anonymised_incidents
     WHERE hour_bucket >= $1 AND hour_bucket <= $2 AND outcome = 'resolved'`,
    [start.toISOString(), end.toISOString()]
  );
  const tc = Number(totalForRate.rows[0]?.c ?? 0);
  const rc = Number(resolvedCnt.rows[0]?.c ?? 0);
  const resolutionRate = tc > 0 ? rc / tc : null;

  const stats = {
    year,
    month,
    total_incidents: Number(total.rows[0]?.c ?? 0),
    by_type:         Object.fromEntries(byType.rows.map((r) => [r.type, r.count])),
    top_hotspots:    hotspots.rows,
    avg_urgency:     urgency.rows[0]?.u ?? null,
    resolution_rate: resolutionRate,
  };

  let narrative;
  if (process.env.REPORTS_LLM_MOCK === 'true') {
    narrative = {
      executive_summary: 'Mock monthly report.',
      key_findings:      ['Finding 1'],
      hotspot_analysis: 'Hotspot text.',
      type_trends:       'Trend text.',
      resource_allocation: 'Allocate resources per mock.',
    };
  } else {
    narrative = {
      executive_summary: `Period ${year}-${month}: ${stats.total_incidents} anonymised incidents.`,
      key_findings:      [`Top type: ${Object.keys(stats.by_type)[0] ?? 'n/a'}`],
      hotspot_analysis: `${hotspots.rows.length} hotspot groups identified.`,
      type_trends:       JSON.stringify(stats.by_type),
      resource_allocation: 'Review staffing in high-count cohorts.',
    };
  }

  return {
    generated_at: new Date().toISOString(),
    statistics:   stats,
    narrative,
  };
}

export function __clearReportsMemory() {
  memIndex.clear();
}
