/**
 * notificationService.js
 *
 * Sends push notifications to pre-registered emergency contacts
 * when a session is created.
 *
 * Uses Firebase Cloud Messaging (FCM) via the firebase-admin SDK.
 */

let admin;

try {
  const { default: firebaseAdmin } = await import('firebase-admin');
  admin = firebaseAdmin;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
} catch (e) {
  console.warn('[NotificationService] firebase-admin not initialised. Push notifications disabled.');
  admin = null;
}

/**
 * Send an FCM push notification to all registered contact tokens for a user.
 *
 * @param {object} session - EmergencySession mongoose document
 */
export async function sendEmergencyNotification(session) {
  if (!admin) {
    console.log('[NotificationService] Skipped (firebase-admin not configured).');
    return;
  }

  const contactTokens = await getContactTokens(session.userId);

  if (!contactTokens.length) {
    console.log(`[NotificationService] No contact tokens for user ${session.userId}`);
    return;
  }

  const locationStr = session.location
    ? `${session.location.lat.toFixed(4)}, ${session.location.lng.toFixed(4)}`
    : 'Unknown location';

  const message = {
    notification: {
      title: '🚨 Emergency Alert',
      body: `${session.scenarioMessage} | Location: ${locationStr}`,
    },
    data: {
      sessionId: session._id.toString(),
      userId: session.userId,
      platform: session.platform,
    },
    tokens: contactTokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `[NotificationService] Sent ${response.successCount}/${contactTokens.length} notifications.`,
    );
    if (response.failureCount > 0) {
      response.responses.forEach((r, i) => {
        if (!r.success) {
          console.error(`[NotificationService] Token ${i} failed:`, r.error?.message);
        }
      });
    }
  } catch (err) {
    console.error('[NotificationService] FCM error:', err);
    throw err;
  }
}

/**
 * Placeholder: returns FCM tokens for a user's registered emergency contacts.
 */
async function getContactTokens(userId) {
  console.log(`[NotificationService] Fetching contact tokens for ${userId} (stub)`);
  return [];
}