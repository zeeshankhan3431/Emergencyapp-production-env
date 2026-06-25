/**
 * Firebase Cloud Messaging — HTTP legacy API (server key) or HTTP v1 (service account) behind flag.
 * Mock mode records sends for tests.
 */
import https from 'node:https';

const FCM_LEGACY_URL = 'https://fcm.googleapis.com/fcm/send';

/** @type {Array<{ token: string, body: object, response?: string }>} */
let mockSends = [];

export function useMock() {
  return process.env.FCM_USE_MOCK === 'true';
}

/**
 * @param {string} token
 * @param {{ incidentId: string, title?: string, body?: string }} data
 * @returns {Promise<{ ok: boolean, unregistered?: boolean, raw?: string }>}
 */
export async function sendFcmToToken(token, data) {
  if (useMock()) {
    mockSends.push({ token, body: data, response: 'ok' });
    return { ok: true };
  }

  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    console.warn('[fcm] FCM_SERVER_KEY unset — skip push');
    return { ok: false, raw: 'no_server_key' };
  }

  const payload = JSON.stringify({
    to:       token,
    priority: 'high',
    notification: {
      title: data.title ?? 'Emergency alert',
      body:  data.body ?? `Incident ${data.incidentId}`,
    },
    data: {
      incident_id: data.incidentId,
    },
  });

  return new Promise((resolve) => {
    const req = https.request(
      FCM_LEGACY_URL,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization:   `key=${serverKey}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            const err = parsed.results?.[0]?.error;
            if (err === 'NotRegistered' || err === 'InvalidRegistration') {
              resolve({ ok: false, unregistered: true, raw });
              return;
            }
            resolve({ ok: res.statusCode === 200 && parsed.success === 1, raw });
          } catch {
            resolve({ ok: false, raw });
          }
        });
      }
    );
    req.on('error', () => resolve({ ok: false }));
    req.write(payload);
    req.end();
  });
}

export function __clearFcmMock() { mockSends = []; }
export function __getFcmMockSends() { return [...mockSends]; }
