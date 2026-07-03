/**
 * Lambda: audio-transcription-worker  (Track B — part 1)
 *
 * Triggered by SQS queue 'transcription-jobs'.
 * Each message contains: { incidentId, evidenceId, s3Key }
 *
 * Steps:
 *  1. Retrieve encrypted audio S3 key for the incident
 *  2. Decrypt audio using incident's KMS data key (fetched from Secrets Manager)
 *  3. Submit to AWS Transcribe Medical OR OpenAI Whisper (configured via SSM)
 *  4. Poll for job completion (Transcribe async)
 *  5. Store transcript as UTF-8 text in S3: transcripts/{incidentId}.txt
 *  6. Update incidents.transcript_s3_key in PostgreSQL
 *  7. Push to SQS 'summarisation-jobs'
 */

import { createDecipheriv } from 'node:crypto';
import { getParameter, SSM_PATHS }             from '../services/ssmService.js';
import { getSecret }                            from '../services/secretsManagerService.js';
import { getObjectBuffer, putTextObject }       from '../services/s3Service.js';
import { transcribeWithAws, transcribeWithWhisper, useMock as transcribeMock, __setTranscribeMock } from '../services/transcribeService.js';
import { sendSqsMessage }                       from '../services/sqsService.js';
import { updateIncident, getIncidentById }      from '../services/incidentRepository.js';
import { randomUUID }                           from 'node:crypto';

export { __setTranscribeMock };

const SUMMARISATION_QUEUE = () =>
  process.env.SQS_SUMMARISATION_QUEUE_URL ??
  'https://sqs.us-east-1.amazonaws.com/000000000000/summarisation-jobs';

/**
 * Core logic — extracted for testability.
 *
 * @param {{ incidentId: string; s3Key: string; evidenceId?: string }} job
 */
export async function processTranscriptionJob(job) {
  const { incidentId, s3Key } = job;

  const incident = await getIncidentById(incidentId);
  if (!incident) throw new Error(`[transcription-worker] Incident not found: ${incidentId}`);

  // ── Idempotency: already transcribed ──────────────────────────────────────
  if (incident.transcript_s3_key) {
    console.info('[transcription-worker] Already transcribed — skip', incidentId);
    return { skipped: true, incidentId };
  }

  // ── Step 2: Fetch & decrypt audio ─────────────────────────────────────────
  const audioEncrypted = await getObjectBuffer(s3Key);
  const decryptedAudio = await decryptAudio(audioEncrypted, incidentId);

  // ── Step 3: Choose transcription engine ───────────────────────────────────
  let transcript;

  if (transcribeMock()) {
    transcript = process.env._MOCK_TRANSCRIPT ?? 'Mock transcript text.';
  } else {
    const engine = (await getParameter(SSM_PATHS.TRANSCRIBE_ENGINE)) ?? 'aws';

    if (engine === 'whisper') {
      const whisperKeyArn = await getParameter(SSM_PATHS.WHISPER_API_KEY_ARN);
      const apiKey        = await getSecret(whisperKeyArn);
      transcript = await transcribeWithWhisper({ audioBuffer: decryptedAudio, apiKey });
    } else {
      const jobName = `era-${incidentId}-${Date.now()}`;
      const bucket  = process.env.S3_EVIDENCE_BUCKET ?? '';
      transcript = await transcribeWithAws({
        jobName,
        s3Uri: `s3://${bucket}/${s3Key}`,
        medical: true,
      });
    }
  }

  // ── Step 5: Store transcript in S3 ────────────────────────────────────────
  const transcriptKey = `transcripts/${incidentId}.txt`;
  await putTextObject(transcriptKey, transcript);

  // ── Step 6: Update PostgreSQL ──────────────────────────────────────────────
  await updateIncident(incidentId, { transcriptS3Key: transcriptKey });

  // ── Step 7: Push to summarisation queue ───────────────────────────────────
  await sendSqsMessage({
    queueUrl:        SUMMARISATION_QUEUE(),
    body:            { incidentId, transcriptKey },
    messageGroupId:  incidentId,
    deduplicationId: `summarise-${incidentId}`,
  });

  return { incidentId, transcriptKey };
}

// ─── AES-256-GCM decryption (client-side encrypted audio) ────────────────────

/**
 * Fetches the per-incident data key from Secrets Manager, then decrypts the
 * AES-256-GCM encrypted audio buffer.
 * Secret format (JSON): { key_hex: "...", iv_hex: "...", auth_tag_hex: "..." }
 *
 * @param {Buffer} encryptedBuffer
 * @param {string} incidentId
 * @returns {Promise<Buffer>}
 */
async function decryptAudio(encryptedBuffer, incidentId) {
  const secretArn = `era/incident/${incidentId}/audio-key`;

  let keyMeta;
  try {
    const raw = await getSecret(secretArn);
    keyMeta   = JSON.parse(raw);
  } catch {
    // In test/local mode without real Secrets Manager — return buffer as-is
    console.warn('[transcription-worker] No KMS key available — skipping decryption (dev mode)');
    return encryptedBuffer;
  }

  const key     = Buffer.from(keyMeta.key_hex,      'hex');
  const iv      = Buffer.from(keyMeta.iv_hex,       'hex');
  const authTag = Buffer.from(keyMeta.auth_tag_hex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

// ─── Lambda handler ────────────────────────────────────────────────────────────

/** @param {{ Records: Array<{ body: string; receiptHandle: string; messageId: string }> }} event */
export async function handler(event) {
  const failures = [];

  for (const record of event.Records) {
    let body;
    try {
      body = JSON.parse(record.body);
      await processTranscriptionJob(body);
    } catch (err) {
      console.error('[transcription-worker] Failed record', record.messageId, err);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  // SQS partial-batch failure — return failed items for retry
  return { batchItemFailures: failures.map((f) => ({ itemIdentifier: f.itemIdentifier })) };
}
