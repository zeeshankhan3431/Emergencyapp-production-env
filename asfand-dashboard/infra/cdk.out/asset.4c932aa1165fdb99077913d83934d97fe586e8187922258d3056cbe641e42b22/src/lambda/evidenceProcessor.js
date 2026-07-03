/**
 * Lambda: evidence-processor
 * Triggered by S3 PutObject event on era-evidence-{env} bucket.
 *
 * Responsibilities (all idempotent):
 *  1. Verify file size ≤ 500 MB
 *  2. Verify SHA-256 checksum against declared value in PostgreSQL
 *  3. Tag S3 object with incident metadata + classification=EVIDENCE
 *  4. Update incidents.encrypted_audio_s3_key + evidence.status → verified
 *  5. Push to SQS 'transcription-jobs' for AI pipeline (Module 4)
 *  6. Write verified event to DynamoDB evidence_audit_log
 *
 * On failure: mark evidence.status = 'rejected', log event, do NOT push SQS.
 */

import { headObject, verifyObjectChecksum, tagObject } from '../services/s3Service.js';
import { sendSqsMessage } from '../services/sqsService.js';
import { logEvidenceEvent } from '../services/evidenceAuditService.js';
import {
  findEvidenceByS3Key,
  updateEvidenceStatus,
} from '../services/evidenceRepository.js';
import { updateIncident } from '../services/incidentRepository.js';
import { MAX_SIZE_BYTES } from '../services/s3Service.js';

const TRANSCRIPTION_QUEUE = () =>
  process.env.SQS_TRANSCRIPTION_QUEUE_URL ?? 'https://sqs.us-east-1.amazonaws.com/000000000000/transcription-jobs';

/**
 * Core processing logic — extracted for testability.
 * @param {{ s3Key: string, bucketName: string }} params
 */
export async function processEvidenceRecord({ s3Key, bucketName }) {
  const evidence = await findEvidenceByS3Key(s3Key);
  if (!evidence) {
    console.warn(`[evidence-processor] No evidence record found for key: ${s3Key}`);
    return { skipped: true, reason: 'no_record' };
  }

  // Idempotency: skip if already processed
  if (evidence.status === 'verified') {
    return { skipped: true, reason: 'already_verified' };
  }

  // ── 1. Size check ──────────────────────────────────────────────────────────
  const { size, exists } = await headObject(s3Key);
  if (!exists) {
    return { ok: false, evidenceId: evidence.id, reason: 'object_not_found' };
  }
  if (size > MAX_SIZE_BYTES) {
    await rejectEvidence(evidence, 'file_too_large');
    return { ok: false, evidenceId: evidence.id, reason: 'file_too_large' };
  }

  // ── 2. Checksum verification ───────────────────────────────────────────────
  const { verified, reason: checksumReason } = await verifyObjectChecksum(
    s3Key,
    evidence.checksum_sha256
  );
  if (!verified) {
    await rejectEvidence(evidence, `checksum_mismatch:${checksumReason}`);
    return { ok: false, evidenceId: evidence.id, reason: 'checksum_mismatch' };
  }

  // ── 3. Tag S3 object ───────────────────────────────────────────────────────
  await tagObject(s3Key, {
    incident_id: evidence.incident_id,
    user_id: evidence.user_id,
    evidence_id: evidence.id,
    timestamp: new Date().toISOString(),
    classification: 'EVIDENCE',
    environment: process.env.DEPLOY_ENV ?? 'dev',
  });

  // ── 4. Update PostgreSQL ───────────────────────────────────────────────────
  await updateEvidenceStatus(evidence.id, {
    status: 'verified',
    verifiedAt: new Date(),
  });
  await updateIncident(evidence.incident_id, {
    encryptedAudioS3Key: s3Key,
  });

  // ── 5. Push transcription job to SQS ──────────────────────────────────────
  const { messageId } = await sendSqsMessage({
    queueUrl: TRANSCRIPTION_QUEUE(),
    messageGroupId: evidence.incident_id,
    deduplicationId: evidence.id,
    body: {
      evidenceId: evidence.id,
      incidentId: evidence.incident_id,
      s3Key,
      userId: evidence.user_id,
      checksumSha256: evidence.checksum_sha256,
      enqueuedAt: new Date().toISOString(),
    },
  });

  // ── 6. Audit log ───────────────────────────────────────────────────────────
  await logEvidenceEvent({
    evidenceId: evidence.id,
    incidentId: evidence.incident_id,
    userId: evidence.user_id,
    action: 'verified',
    s3Key,
    metadata: { sqsMessageId: messageId, fileSizeBytes: size },
  });

  console.log(`[evidence-processor] verified evidence=${evidence.id} incident=${evidence.incident_id}`);
  return { ok: true, evidenceId: evidence.id, sqsMessageId: messageId };
}

async function rejectEvidence(evidence, reason) {
  await updateEvidenceStatus(evidence.id, {
    status: 'rejected',
    rejectReason: reason,
    verifiedAt: new Date(),
  });
  await logEvidenceEvent({
    evidenceId: evidence.id,
    incidentId: evidence.incident_id,
    userId: evidence.user_id,
    action: 'rejected',
    s3Key: evidence.s3_key,
    metadata: { reason },
  });
}

// ─── Lambda handler ────────────────────────────────────────────────────────────

/**
 * @param {{ Records: Array<{ s3: { bucket: { name: string }, object: { key: string } } }> }} event
 */
export async function handler(event) {
  const results = await Promise.allSettled(
    event.Records.map((record) => {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const bucket = record.s3.bucket.name;
      return processEvidenceRecord({ s3Key: key, bucketName: bucket });
    })
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`[evidence-processor] ${failures.length} record(s) failed`, failures.map((f) => f.reason?.message));
    throw new Error(`${failures.length} evidence record(s) failed processing`);
  }

  return { processed: results.length };
}
