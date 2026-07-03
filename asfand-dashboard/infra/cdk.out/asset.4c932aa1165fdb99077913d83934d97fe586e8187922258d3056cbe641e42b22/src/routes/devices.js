import { Router } from 'express';
import { upsertDeviceToken, deleteDeviceToken, listTokensForUser } from '../services/deviceTokensService.js';

const router = Router();

/**
 * POST /api/devices/register-token
 * Body: { fcm_token, device_id, platform: ios|android }
 */
router.post('/register-token', async (req, res) => {
  const { fcm_token: fcmToken, device_id: deviceId, platform } = req.body ?? {};
  if (!fcmToken || !deviceId || !platform) {
    return res.status(400).json({
      error: 'VALIDATION',
      message: 'fcm_token, device_id, and platform are required',
    });
  }
  const p = String(platform).toLowerCase();
  if (p !== 'ios' && p !== 'android') {
    return res.status(400).json({ error: 'VALIDATION', message: 'platform must be ios or android' });
  }

  const userId = req.user.id;
  const row = await upsertDeviceToken({
    userId,
    deviceId: String(deviceId),
    fcmToken: String(fcmToken),
    platform: /** @type {'ios'|'android'} */ (p),
  });

  return res.status(200).json({ ok: true, updated_at: row.updated_at });
});

/**
 * DELETE /api/devices/token
 * Body optional: { device_id } or { fcm_token } — prefer device_id for precise row delete.
 */
router.delete('/token', async (req, res) => {
  const deviceId = req.body?.device_id ?? req.query?.device_id;
  const fcmToken = req.body?.fcm_token ?? req.query?.fcm_token;
  const userId = req.user.id;

  if (deviceId) {
    await deleteDeviceToken(userId, String(deviceId));
    return res.json({ ok: true });
  }
  if (fcmToken) {
    const rows = await listTokensForUser(userId);
    const row = rows.find((r) => r.fcm_token === String(fcmToken));
    if (row?.device_id) {
      await deleteDeviceToken(userId, String(row.device_id));
    }
    return res.json({ ok: true });
  }
  return res.status(400).json({
    error: 'VALIDATION',
    message: 'device_id or fcm_token is required',
  });
});

export default router;
