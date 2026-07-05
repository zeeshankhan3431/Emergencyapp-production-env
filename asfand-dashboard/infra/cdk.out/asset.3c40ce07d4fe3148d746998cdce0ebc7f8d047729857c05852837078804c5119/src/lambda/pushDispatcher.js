/**
 * Lambda: push-dispatcher — subscribed to SNS emergency-alerts topic.
 */
import { findUserById, parseNotificationPrefs } from '../services/userRepository.js';
import { listTokensForUser, deleteDeviceToken } from '../services/deviceTokensService.js';
import { sendFcmToToken } from '../services/fcmPushService.js';
import { logNotification } from '../services/notificationLogService.js';

/**
 * @param {import('aws-lambda').SNSEvent} event
 */
export async function handler(event) {
  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.Sns.Message);
      const responderId = msg.assignedResponderId;
      const incidentId = msg.incidentId;
      if (!responderId || !incidentId) continue;

      const user = await findUserById(responderId);
      if (!user) continue;

      const prefs = user.notificationPrefs ?? parseNotificationPrefs(user.notification_prefs);
      if (!prefs.push_enabled) {
        await logNotification({
          channel: 'push',
          status:  'skipped_prefs',
          userId:  responderId,
          incidentId,
        });
        continue;
      }

      const tokens = await listTokensForUser(responderId);
      for (const row of tokens) {
        const t = row.fcm_token;
        const deviceId = row.device_id;
        if (!t) continue;

        const res = await sendFcmToToken(t, {
          incidentId,
          title: 'Emergency alert',
          body:  `New ${msg.type ?? 'incident'} — open app`,
        });

        await logNotification({
          channel: 'push',
          status: res.ok ? 'sent' : res.unregistered ? 'unregistered' : 'failed',
          userId:  responderId,
          incidentId,
          detail: res.raw ?? '',
        });

        if (res.unregistered && deviceId) {
          await deleteDeviceToken(responderId, String(deviceId));
        }
      }
    } catch (err) {
      console.error('[push-dispatcher]', err);
      await logNotification({ channel: 'push', status: 'error', detail: String(err?.message ?? err) });
    }
  }
}
