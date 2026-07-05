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
 * GET /api/dashboard/summary — Admin or Analyst
 * Combines stats and recent incidents, formats them to match what the frontend Dashboard.jsx expects.
 */
router.get('/summary', requireAdminOrAnalyst, async (_req, res) => {
  const stats = await getDashboardStats();
  const { items: recentIncidents } = await listDashboardIncidents({ limit: 5 });

  const metrics = [
    {
      key: 'active',
      title: 'Active Incidents',
      value: String(stats.active_incidents),
      change: '0%', 
      changePositive: true,
    },
    {
      key: 'today',
      title: "Today's Incidents",
      value: String(stats.created_today),
      change: '0%',
      changePositive: true,
    },
    {
      key: 'resolved',
      title: 'Resolved Cases',
      value: String(stats.resolved_today),
      change: '0%',
      changePositive: true,
    },
    {
      key: 'avgResponse',
      title: 'Avg Response Time',
      value: stats.avg_response_time_seconds 
               ? `${Math.floor(stats.avg_response_time_seconds / 60)}m ${Math.floor(stats.avg_response_time_seconds % 60)}s`
               : 'N/A',
      change: '0%',
      changePositive: true,
    },
  ];

  const incidentTypeBreakdown = stats.top_incident_types.map(t => ({
    name: t.type,
    value: t.count
  }));

  return res.json({
    metrics,
    recentIncidents,
    incidentsOverTime: [], 
    incidentTypeBreakdown
  });
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
