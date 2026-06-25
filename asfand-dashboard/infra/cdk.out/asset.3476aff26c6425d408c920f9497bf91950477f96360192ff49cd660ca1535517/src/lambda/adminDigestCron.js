/**
 * Lambda: scheduled admin digest — publishes summary JSON to SNS admin-digest-{env}
 * (EventBridge daily). Consumers email Admins via SES or third-party.
 */
import { publishToSns } from '../services/snsService.js';
import { adminDigestTopicArn } from '../services/snsTopics.js';

/**
 * @param {unknown} _event
 */
export async function handler(_event) {
  const arn = adminDigestTopicArn();
  if (!arn) {
    console.warn('[admin-digest] SNS_ADMIN_DIGEST_ARN unset');
    return { ok: false };
  }

  const digest = {
    generated_at: new Date().toISOString(),
    summary:      'Placeholder — wire dashboard stats query in production.',
  };

  await publishToSns({
    topicArn: arn,
    subject:  `Admin digest ${new Date().toISOString().slice(0, 10)}`,
    message:  digest,
  });

  return { ok: true };
}
