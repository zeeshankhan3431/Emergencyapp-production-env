import { Router } from 'express';
import { getDashboardStats, listDashboardIncidents, listAnonymisedMapPoints } from '../services/dashboardService.js';

const router = Router();

function isAdmin(req) { return req.user?.role === 'Admin'; }
function isAnalyst(req) { return req.user?.role === 'Analyst'; }

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin role required' });
  }
  return next();
}

function requireAdminOrAnalyst(req, res, next) {
  if (!isAdmin(req) && !isAnalyst(req)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin or Analyst role required' });
  }
  return next();
}

/**
 * GET /api/dashboard/stats — Admin only
 */
router.get('/stats', requireAdmin, async (_req, res) => {
  const stats = await getDashboardStats();
  return res.json(stats);
});

/**
 * GET /api/dashboard/incidents — Admin only
 * Query: status, type, date_from, date_to, responder_id, page, limit
 */
router.get('/incidents', requireAdmin, async (req, res) => {
  const {
    status,
    type,
    date_from,
    date_to,
    responder_id,
    page,
    limit,
  } = req.query;

  const result = await listDashboardIncidents({
    status:       status ? String(status) : undefined,
    type:         type ? String(type) : undefined,
    date_from:    date_from ? String(date_from) : undefined,
    date_to:      date_to ? String(date_to) : undefined,
    responder_id: responder_id ? String(responder_id) : undefined,
    page:         page ? Number(page) : 1,
    limit:        limit ? Math.min(Number(limit), 100) : 20,
  });
  return res.json(result);
});

/**
 * GET /api/dashboard/map — Admin, Analyst (anonymised heatmap points, last 30 days)
 */
router.get('/map', requireAdminOrAnalyst, async (req, res) => {
  const days = req.query.days ? Math.min(Number(req.query.days), 90) : 30;
  const points = await listAnonymisedMapPoints(days);
  return res.json({ points });
});

export default router;
