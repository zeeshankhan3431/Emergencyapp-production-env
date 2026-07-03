import { Router } from 'express';
import { findUserById, updateNotificationPrefs } from '../services/userRepository.js';

const router = Router();

function isAdmin(req) {
  return req.user?.role === 'Admin';
}

function canAccessUser(req, targetId) {
  return isAdmin(req) || req.user?.id === targetId;
}

/**
 * GET /api/users/:id/notification-prefs
 */
router.get('/:id/notification-prefs', async (req, res) => {
  const targetId = req.params.id;
  if (!canAccessUser(req, targetId)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied' });
  }
  const row = await findUserById(targetId);
  if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
  return res.json({ notification_prefs: row.notificationPrefs ?? {} });
});

/**
 * PATCH /api/users/:id/notification-prefs
 * Body: { sms_enabled?, push_enabled?, email_digest_enabled? }
 */
router.patch('/:id/notification-prefs', async (req, res) => {
  const targetId = req.params.id;
  if (!canAccessUser(req, targetId)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied' });
  }
  const { sms_enabled, push_enabled, email_digest_enabled } = req.body ?? {};
  const patch = {};
  if (typeof sms_enabled === 'boolean') patch.sms_enabled = sms_enabled;
  if (typeof push_enabled === 'boolean') patch.push_enabled = push_enabled;
  if (typeof email_digest_enabled === 'boolean') patch.email_digest_enabled = email_digest_enabled;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'VALIDATION', message: 'No valid preference fields' });
  }

  const row = await updateNotificationPrefs(targetId, patch);
  if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
  return res.json({ notification_prefs: row.notificationPrefs ?? {} });
});

export default router;
