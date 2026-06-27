import { Router } from 'express';
import { getDashboardStats, listDashboardIncidents, listAnonymisedMapPoints, getIncidentsOverTime } from '../services/dashboardService.js';

const TYPE_COLORS = {
  fire:         'bg-red-500',
  medical:      'bg-orange-500',
  traffic:      'bg-blue-500',
  public_order: 'bg-purple-500',
};
const TYPE_LABELS = {
  fire:         'Fire',
  medical:      'Medical',
  traffic:      'Traffic',
  public_order: 'Public Order',
};

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
  const [stats, { items: rawIncidents }, incidentsOverTime] = await Promise.all([
    getDashboardStats(),
    listDashboardIncidents({ limit: 5 }),
    getIncidentsOverTime(),
  ]);

  // Format the metrics array as expected by frontend
  const metrics = [
    {
      key: 'active',
      title: 'Active Incidents',
      value: String(stats.active_incidents),
      change: '',
      changePositive: true,
    },
    {
      key: 'today',
      title: "Today's Escalations",
      value: String(stats.escalated_today),
      change: '',
      changePositive: true,
    },
    {
      key: 'resolved',
      title: 'Resolved Cases',
      value: String(stats.resolved_today),
      change: '',
      changePositive: true,
    },
    {
      key: 'avgResponse',
      title: 'Avg Response Time',
      value: stats.avg_response_time_seconds
               ? `${Math.floor(stats.avg_response_time_seconds / 60)}m ${Math.floor(stats.avg_response_time_seconds % 60)}s`
               : '—',
      change: '',
      changePositive: true,
    },
  ];

  // Incident type breakdown — compute percentages and assign display colors
  const totalTypeCount = stats.top_incident_types.reduce((s, t) => s + t.count, 0) || 1;
  const incidentTypeBreakdown = stats.top_incident_types.map((t, i) => ({
    label: TYPE_LABELS[t.type] ?? t.type,
    name:  t.type,
    value: t.count,
    percent: Math.round((t.count / totalTypeCount) * 100),
    color: TYPE_COLORS[t.type] ?? ['bg-teal-500', 'bg-yellow-500', 'bg-pink-500'][i % 3],
  }));

  // Map recent incidents to the shape expected by RecentIncidents.jsx
  const recentIncidents = rawIncidents.map((r) => ({
    id: r.id,
    type: TYPE_LABELS[r.type] ?? r.type,
    typeKey: r.type,
    location: r.ai_summary ? r.ai_summary.slice(0, 60) : r.id,
    status: r.status === 'escalated' || r.status === 'responder_assigned'
              ? 'Dispatching'
              : r.status === 'resolved'
              ? 'Resolved'
              : r.status === 'ai_processing'
              ? 'On Scene'
              : 'Open',
    openedAt: r.triggered_at,
  }));

  return res.json({
    metrics,
    recentIncidents,
    incidentsOverTime,
    incidentTypeBreakdown,
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
