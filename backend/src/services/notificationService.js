/**
 * notificationService.js
 *
 * Sends push notifications to pre-registered emergency contacts
 * when a session is created.
 *
 * Uses Firebase Cloud Messaging (FCM) via the firebase-admin SDK.
 *
 *   npm install firebase-admin
 *
 * Set up:
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Generate a new private key → save as serviceAccountKey.json
 *   3. Set env var: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *      (or pass the object directly to initializeApp)
 */

let admin;

try {
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
} catch (e) {
  console.warn('[NotificationService] firebase-admin not installed. Push notifications disabled.');
  admin = null;
}

/**
 * Send an FCM push notification to all registered contact tokens for a user.
 *
 * In a real app, you would fetch the contact FCM tokens from the DB.
 * This function shows the structure – replace the token lookup with
 * your actual user/contacts model.
 *
 * @param {import('../models/EmergencySession')} session
 */
async function sendEmergencyNotification(session) {
  if (!admin) {
    console.log('[NotificationService] Skipped (firebase-admin not configured).');
    return;
  }

  // TODO: Replace with real token lookup from your Users / Contacts model
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
 * Replace with a real DB query in Milestone 3 when the contacts model is built.
 */
async function getContactTokens(userId) {
  // Example stub – return real tokens from your DB here
  console.log(`[NotificationService] Fetching contact tokens for ${userId} (stub)`);
  return [];
}

module.exports = { sendEmergencyNotification };