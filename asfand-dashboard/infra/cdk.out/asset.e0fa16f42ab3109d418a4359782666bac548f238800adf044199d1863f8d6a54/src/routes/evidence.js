import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  generateUploadPresignedUrl,
  generateDownloadPresignedUrl,
  UPLOAD_TTL_SEC,
  ACCESS_TTL_SEC,
  MAX_SIZE_BYTES,
} from '../services/s3Service.js';
import {
  createEvidence,
  findEvidenceById,
  updateEvidenceStatus,
} from '../services/evidenceRepository.js';
import { logEvidenceEvent } from '../services/evidenceAuditService.js';
import { getIncidentById } from '../services/incidentRepository.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

const S3_KEY_PREFIX = () => process.env.S3_EVIDENCE_KEY_PREFIX ?? 'evidence';
const ENV           = () => process.env.NODE_ENV ?? 'development';

/**
 * POST /api/evidence/upload-url
 * Any authenticated user — must own the incident.
 * Returns presigned S3 PUT URL (5-min TTL) + evidence_id.
 */
router.post('/upload-url', async (req, res) => {
  const { incident_id, file_size_bytes, checksum_sha256 } = req.body ?? {};

  if (!incident_id || !file_size_bytes || !checksum_sha256) {
    return res.status(400).json({
      error: 'VALIDATION',
      message: 'incident_id, file_size_bytes and checksum_sha256 are required',
    });
  }
  if (typeof file_size_bytes !== 'number' || file_size_bytes <= 0) {
    return res.status(400).json({ error: 'VALIDATION', message: 'file_size_bytes must be a positive number' });
  }
  if (file_size_bytes > MAX_SIZE_BYTES) {
    return res.status(413).json({
      error: 'FILE_TOO_LARGE',
      message: `Max file size is ${MAX_SIZE_BYTES} bytes (500 MB)`,
    });
  }
  if (!/^[a-f0-9]{64}$/i.test(String(checksum_sha256))) {
    return res.status(400).json({ error: 'VALIDATION', message: 'checksum_sha256 must be a 64-character hex string' });
  }

  const incident = await getIncidentById(String(incident_id));
  if (!incident) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Incident not found' });
  }

  const user = req.user;
  const isAdmin = user.role === 'Admin';
  if (incident.user_id !== user.id && !isAdmin) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only upload evidence for your own incidents' });
  }

  // Generate UUID and S3 key together so they are consistent
  const evidenceId = randomUUID();
  const s3Key = `${S3_KEY_PREFIX()}/${incident_id}/${evidenceId}`;

  await createEvidence({
    id: evidenceId,
    incidentId: String(incident_id),
    userId: user.id,
    s3Key,
    checksumSha256: String(checksum_sha256).toLowerCase(),
    fileSizeBytes: file_size_bytes,
  });

  let uploadUrl;
  try {
    uploadUrl = await generateUploadPresignedUrl({
      key: s3Key,
      fileSizeBytes: file_size_bytes,
      checksumSha256: String(checksum_sha256).toLowerCase(),
    });
  } catch (err) {
    if (err.status === 413) return res.status(413).json({ error: 'FILE_TOO_LARGE', message: err.message });
    throw err;
  }

  return res.status(201).json({
    evidence_id: evidenceId,
    s3_key: s3Key,
    upload_url: uploadUrl,
    expires_in_seconds: UPLOAD_TTL_SEC,
    instructions: 'PUT the encrypted file directly to upload_url. Include header: Content-Length and X-Amz-Checksum-SHA256.',
  });
});

/**
 * POST /api/evidence/confirm
 * Called after mobile completes S3 upload.
 * Marks evidence as uploaded; S3 event → Lambda does the actual verification.
 */
router.post('/confirm', async (req, res) => {
  const { evidence_id, incident_id } = req.body ?? {};

  if (!evidence_id || !incident_id) {
    return res.status(400).json({ error: 'VALIDATION', message: 'evidence_id and incident_id are required' });
  }

  const evidence = await findEvidenceById(String(evidence_id));
  if (!evidence) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Evidence record not found' });
  }
  if (evidence.incident_id !== String(incident_id)) {
    return res.status(400).json({ error: 'VALIDATION', message: 'incident_id does not match evidence record' });
  }

  const user = req.user;
  const isAdmin = user.role === 'Admin';
  if (evidence.user_id !== user.id && !isAdmin) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only confirm your own evidence uploads' });
  }

  if (evidence.status !== 'pending') {
    return res.status(409).json({
      error: 'CONFLICT',
      message: `Evidence already in status '${evidence.status}'`,
    });
  }

  await updateEvidenceStatus(String(evidence_id), { status: 'processing', uploadedAt: new Date() });

  await logEvidenceEvent({
    evidenceId: String(evidence_id),
    incidentId: String(incident_id),
    userId: user.id,
    action: 'uploaded',
    ipAddress: req.ip,
    s3Key: evidence.s3_key,
  });

  return res.json({
    ok: true,
    evidence_id: String(evidence_id),
    status: 'processing',
    message: 'Upload confirmed. Evidence is being verified and queued for transcription.',
  });
});

/**
 * GET /api/evidence/:evidence_id/access-url
 * Admin only — returns time-limited presigned GET URL.
 * Writes access event to evidence_audit_log.
 */
router.get('/:evidenceId/access-url', requireRole('Admin'), async (req, res) => {
  const evidence = await findEvidenceById(req.params.evidenceId);
  if (!evidence) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Evidence not found' });
  }
  if (evidence.status === 'rejected') {
    return res.status(410).json({ error: 'REJECTED', message: 'Evidence was rejected during verification' });
  }

  const accessUrl = await generateDownloadPresignedUrl(evidence.s3_key);

  await logEvidenceEvent({
    evidenceId: req.params.evidenceId,
    incidentId: evidence.incident_id,
    userId: req.user.id,
    action: 'accessed',
    ipAddress: req.ip,
    s3Key: evidence.s3_key,
    metadata: { admin_id: req.user.id },
  });

  return res.json({
    access_url: accessUrl,
    expires_in_seconds: ACCESS_TTL_SEC,
    s3_key: evidence.s3_key,
    warning: 'This URL is time-limited. Decrypt client-side using the per-incident key from Secrets Manager. Do NOT log or store this URL.',
  });
});

export default router;
