/**
 * Lambda: sms-dispatcher — subscribed to SNS emergency-alerts topic.
 */
import { findUserById, parseNotificationPrefs } from '../services/userRepository.js';
import { sendSms } from '../services/smsDispatchService.js';
import { logNotification } from '../services/notificationLogService.js';
import { generaliseCoordinates } from '../services/anonymisationService.js';

/**
 * @param {import('aws-lambda').SNSEvent} event
 */
export async function handler(event) {
  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.Sns.Message);
      const responderId = msg.assignedResponderId;
      const incidentId = msg.incidentId;
      const type = msg.type ?? 'incident';
      if (!responderId || !incidentId) {
        console.warn('[sms-dispatcher] missing responder or incident id');
        continue;
      }

      const user = await findUserById(responderId);
      if (!user?.phone) {
        await logNotification({
          channel: 'sms',
          status:  'skipped_no_phone',
          userId:  responderId,
          incidentId,
          detail:  'no phone',
        });
        continue;
      }

      const prefs = user.notificationPrefs ?? parseNotificationPrefs(user.notification_prefs);
      if (!prefs.sms_enabled) {
        await logNotification({
          channel: 'sms',
          status:  'skipped_prefs',
          userId:  responderId,
          incidentId,
        });
        continue;
      }

      const { generalised_lat: gla, generalised_lng: glo } = generaliseCoordinates(
        Number(msg.lat ?? 0),
        Number(msg.lng ?? 0)
      );
      const text =
        `EMERGENCY ALERT: ${type} incident near (${gla}, ${glo}). ` +
        `Incident ID: ${incidentId}. Open app.`;

      let phone = String(user.phone).trim();
      if (!phone.startsWith('+')) phone = `+${phone}`;

      const result = await sendSms(phone, text);
      await logNotification({
        channel: 'sms',
        status:  result.ok ? 'sent' : 'failed',
        userId:  responderId,
        incidentId,
        detail:  JSON.stringify(result),
      });
    } catch (err) {
      console.error('[sms-dispatcher]', err);
      await logNotification({
        channel: 'sms',
        status: 'error',
        detail: String(err?.message ?? err),
      });
    }
  }
}
