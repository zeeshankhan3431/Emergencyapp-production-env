/**
 * SMS via Amazon SNS direct publish to phone (E.164) with optional Twilio fallback.
 */
import https from 'node:https';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

/** @type {SNSClient | null} */
let client = null;
function getClient() {
  if (!client) client = new SNSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  return client;
}

export function useMock() {
  return process.env.SMS_DISPATCH_USE_MOCK === 'true';
}

/** @type {Array<{ phone: string, message: string }>} */
let mockSms = [];

/**
 * @param {string} phoneE164 e.g. +15551234567
 * @param {string} message
 */
export async function sendSms(phoneE164, message) {
  if (useMock()) {
    mockSms.push({ phone: phoneE164, message });
    return { ok: true, provider: 'mock' };
  }

  try {
    await getClient().send(
      new PublishCommand({
        PhoneNumber: phoneE164,
        Message:     message,
      })
    );
    return { ok: true, provider: 'sns' };
  } catch (e) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (sid && token && from) {
      return sendTwilio(sid, token, from, phoneE164, message);
    }
    throw e;
  }
}

/**
 * @param {string} sid
 * @param {string} token
 * @param {string} from
 * @param {string} to
 * @param {string} body
 */
async function sendTwilio(sid, token, from, to, body) {
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ From: from, To: to, Body: body });
  const payload = params.toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.twilio.com',
        path:     `/2010-04-01/Accounts/${sid}/Messages.json`,
        method:   'POST',
        headers: {
          Authorization:  `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Twilio HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve({ ok: true, provider: 'twilio' });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export function __clearSmsMock() { mockSms = []; }
export function __getSmsMock() { return [...mockSms]; }
