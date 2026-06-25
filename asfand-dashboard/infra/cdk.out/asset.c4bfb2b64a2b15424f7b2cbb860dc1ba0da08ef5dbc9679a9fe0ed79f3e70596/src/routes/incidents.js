import { Router } from 'express';
import {
  createIncident,
  listIncidents,
  getIncidentById,
  updateIncident,
  softDeleteIncident,
  addIncidentNote,
  listIncidentNotes,
} from '../services/incidentRepository.js';
import { publishToKinesis } from '../services/kinesisService.js';
import { emitIncidentNew, emitIncidentUpdated, emitIncidentResolved } from '../services/socketService.js';
import { publishIncidentStatusUpdate } from '../services/incidentUpdatesService.js';
import { isValidTransition, INCIDENT_TYPES, isTerminal } from '../constants/incidentStatus.js';
import { syncAnonymisedIncidents } from '../services/anonymisationService.js';

const router = Router();

// ─── RBAC helpers ─────────────────────────────────────────────────────────────

function isAdmin(req) { return req.user?.role === 'Admin'; }
function isResponder(req) { return req.user?.role === 'Responder'; }
function isAnalyst(req) { return req.user?.role === 'Analyst'; }

/**
 * POST /api/incidents — any authenticated user (mobile app trigger)
 * The route is mounted with authenticateJWT but NOT the blanket requireRole guard;
 * see app.js where this route is mounted separately.
 */
router.post('/', async (req, res) => {
  const { type, lat, lng, accuracy, device_id, encrypted_audio_key } = req.body ?? {};
  const userId = req.body?.user_id ?? req.user?.id;

  if (!userId || !type || lat == null || lng == null) {
    return res.status(400).json({
      error: 'VALIDATION',
      message: 'user_id, type, lat and lng are required',
    });
  }
  if (!INCIDENT_TYPES.includes(type)) {
    return res.status(400).json({ error: 'VALIDATION', message: `type must be one of: ${INCIDENT_TYPES.join(', ')}` });
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'VALIDATION', message: 'lat and lng must be numbers' });
  }

  const incident = await createIncident({
    userId,
    type,
    lat,
    lng,
    accuracy: accuracy ?? null,
    deviceId: device_id ?? null,
    encryptedAudioS3Key: encrypted_audio_key ?? null,
  });

  // Non-blocking Kinesis push — do NOT await for SLA
  publishToKinesis(incident.id, {
    eventType: 'INCIDENT_TRIGGERED',
    incidentId: incident.id,
    userId,
    type,
    lat,
    lng,
    accuracy: accuracy ?? null,
    deviceId: device_id ?? null,
    encryptedAudioS3Key: encrypted_audio_key ?? null,
    triggeredAt: incident.triggered_at,
  }).catch((e) => console.error('[kinesis] publish error', e));

  emitIncidentNew(incident);

  return res.status(202).json({ incident_id: incident.id, status: incident.status });
});

/**
 * GET /api/incidents — Admin or Analyst (paginated, filtered)
 */
router.get('/', (req, res, next) => {
  if (!isAdmin(req) && !isAnalyst(req)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin or Analyst role required' });
  }
  return next();
}, async (req, res) => {
  const { status, type, from, to, page, limit } = req.query;
  const result = await listIncidents({
    status: status ? String(status) : undefined,
    type: type ? String(type) : undefined,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
    page: page ? Number(page) : 1,
    limit: limit ? Math.min(Number(limit), 100) : 20,
  });
  return res.json({ items: result.rows, total: result.total, page: result.page, limit: result.limit });
});

/**
 * GET /api/incidents/:id — Admin or Responder assigned to this incident
 */
router.get('/:id', async (req, res) => {
  const incident = await getIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'NOT_FOUND', message: 'Incident not found' });

  const user = req.user;
  const canView =
    isAdmin(user) ||
    (isResponder({ user }) && incident.assigned_responder_id === user.id) ||
    incident.user_id === user.id;

  if (!canView) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied' });
  }
  return res.json(incident);
});

/**
 * PATCH /api/incidents/:id/status — Responder (assigned) or Admin
 */
router.patch('/:id/status', async (req, res) => {
  const { status: newStatus } = req.body ?? {};
  if (!newStatus) {
    return res.status(400).json({ error: 'VALIDATION', message: 'status is required' });
  }

  const incident = await getIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'NOT_FOUND', message: 'Incident not found' });

  const user = req.user;
  const isAssignedResponder = isResponder({ user }) && incident.assigned_responder_id === user.id;
  if (!isAdmin({ user }) && !isAssignedResponder) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Only Admin or assigned Responder can update status' });
  }

  if (!isValidTransition(incident.status, newStatus)) {
    return res.status(422).json({
      error: 'INVALID_TRANSITION',
      message: `Cannot move from '${incident.status}' to '${newStatus}'`,
    });
  }

  const updates = { status: newStatus };
  if (newStatus === 'resolved') updates.resolvedAt = new Date();

  const updated = await updateIncident(req.params.id, updates);
  emitIncidentUpdated(updated);
  if (updated?.assigned_responder_id) {
    publishIncidentStatusUpdate(updated, incident.status).catch((e) =>
      console.error('[incident-updates] sns error', e)
    );
  }
  if (newStatus === 'resolved') {
    emitIncidentResolved(updated);
  }
  if (isTerminal(newStatus)) {
    syncAnonymisedIncidents().catch((e) => console.error('[anonymisation] sync error', e));
  }
  return res.json(updated);
});

/**
 * POST /api/incidents/:id/notes — Responder (assigned) or Admin
 */
router.post('/:id/notes', async (req, res) => {
  const { body } = req.body ?? {};
  if (!body || String(body).trim() === '') {
    return res.status(400).json({ error: 'VALIDATION', message: 'body is required' });
  }

  const incident = await getIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'NOT_FOUND', message: 'Incident not found' });

  const user = req.user;
  const isAssignedResponder = isResponder({ user }) && incident.assigned_responder_id === user.id;
  if (!isAdmin({ user }) && !isAssignedResponder) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Only Admin or assigned Responder can add notes' });
  }

  const note = await addIncidentNote({
    incidentId: req.params.id,
    responderId: user.id,
    body: String(body).trim(),
  });
  return res.status(201).json(note);
});

/**
 * GET /api/incidents/:id/notes — Admin or assigned Responder
 */
router.get('/:id/notes', async (req, res) => {
  const incident = await getIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'NOT_FOUND', message: 'Incident not found' });

  const user = req.user;
  const isAssignedResponder = isResponder({ user }) && incident.assigned_responder_id === user.id;
  if (!isAdmin({ user }) && !isAssignedResponder) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied' });
  }

  const notes = await listIncidentNotes(req.params.id);
  return res.json({ items: notes });
});

/**
 * DELETE /api/incidents/:id — Admin only (soft delete)
 */
router.delete('/:id', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin only' });
  }
  const ok = await softDeleteIncident(req.params.id);
  if (!ok) return res.status(404).json({ error: 'NOT_FOUND', message: 'Incident not found' });
  return res.json({ ok: true });
});

export default router;
