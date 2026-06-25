/**
 * AWS Lambda handler — triggered by Kinesis 'incident-events' stream.
 * Record data is a JSON EscalationPayload from the AI pipeline (Module 4).
 *
 * In production: configure Kinesis → Lambda event source mapping.
 * For SLA < 2s, use batch size = 1 and starting position = TRIM_HORIZON or LATEST.
 */
import { runEscalationEngine } from '../services/escalationEngine.js';

/**
 * @param {{ Records: Array<{ kinesis: { data: string } }> }} event
 */
export async function handler(event) {
  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const raw = Buffer.from(record.kinesis.data, 'base64').toString('utf8');
      const payload = JSON.parse(raw);

      // The AI pipeline emits: { incidentId, confidenceScore, aiSummary, urgencyScore, transcriptS3Key }
      return runEscalationEngine(payload);
    })
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[escalation-handler] ${failed.length} record(s) failed`);
    // Re-throw to cause Kinesis to retry the batch
    throw new Error(`${failed.length} escalation(s) failed`);
  }

  return { batchItemFailures: [] };
}
