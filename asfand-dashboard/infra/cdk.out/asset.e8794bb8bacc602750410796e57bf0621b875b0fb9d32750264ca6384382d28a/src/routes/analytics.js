import { Router } from 'express';
import { queryHotspotClusters } from '../services/openSearchService.js';
import { getAnalyticsTrends } from '../services/analyticsTrendsService.js';
import { generateMonthlyReport, getMonthlyReportJson } from '../services/reportsService.js';

const router = Router();

function isAdmin(req) { return req.user?.role === 'Admin'; }
function isAnalyst(req) { return req.user?.role === 'Analyst'; }

function requireAdminOrAnalyst(req, res, next) {
  if (!isAdmin(req) && !isAnalyst(req)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin or Analyst role required' });
  }
  return next();
}

/**
 * GET /api/analytics/hotspots — OpenSearch cluster centroids
 */
router.get('/hotspots', requireAdminOrAnalyst, async (_req, res) => {
  const clusters = await queryHotspotClusters();
  return res.json({ clusters });
});

/**
 * GET /api/analytics/trends — time series from anonymised_incidents
 */
router.get('/trends', requireAdminOrAnalyst, async (req, res) => {
  const { date_from, date_to, granularity } = req.query;
  const data = await getAnalyticsTrends({
    date_from:    date_from ? String(date_from) : undefined,
    date_to:      date_to ? String(date_to) : undefined,
    granularity:  granularity === 'week' || granularity === 'month' ? granularity : granularity === 'day' ? 'day' : 'day',
  });
  return res.json(data);
});

/**
 * GET /api/analytics/reports/:year/:month
 * If missing, generates on demand (idempotent per month).
 */
router.get('/reports/:year/:month', requireAdminOrAnalyst, async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'VALIDATION', message: 'Invalid year or month' });
  }

  let report = await getMonthlyReportJson(year, month);
  if (!report) {
    await generateMonthlyReport(year, month);
    report = await getMonthlyReportJson(year, month);
  }
  if (!report) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Report could not be generated' });
  }
  return res.json(report);
});

/**
 * POST /api/analytics/reports/generate — body: { year, month }
 */
router.post('/reports/generate', requireAdminOrAnalyst, async (req, res) => {
  const year = Number(req.body?.year);
  const month = Number(req.body?.month);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'VALIDATION', message: 'year and month (1-12) are required' });
  }
  const result = await generateMonthlyReport(year, month);
  return res.json(result);
});

export default router;
