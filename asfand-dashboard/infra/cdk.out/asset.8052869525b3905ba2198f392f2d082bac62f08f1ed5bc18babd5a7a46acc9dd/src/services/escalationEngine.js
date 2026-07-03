/**
 * Escalation Engine — invoked by:
 *   - The Kinesis Lambda consumer (production)
 *   - Direct call in integration tests
 *
 * Handles the async AI → escalate → assign → SNS fan-out chain.
 * All steps are idempotent: safe to retry on Lambda partial-batch failure.
 */
import { updateIncident, findNearestResponder, getIncidentById } from './incidentRepository.js';
import { publishToSns } from './snsService.js';
import { emitIncidentUpdated, emitIncidentEscalated } from './socketService.js';
import { ESCALATION_CONFIDENCE_THRESHOLD } from '../constants/incidentStatus.js';

/**
 * @typedef {object} EscalationPayload
 * @property {string} incidentId
 * @property {number} confidenceScore   Threat classifier confidence (0–1)
 * @property {string} [aiSummary]
 * @property {number} [urgencyScore]
 * @property {string} [transcriptS3Key]
 */

/**
 * @param {EscalationPayload} payload
 * @returns {Promise<{ escalated: boolean, incidentId: string, reason?: string }>}
 */
export async function runEscalationEngine(payload) {
  const { incidentId, confidenceScore, aiSummary, urgencyScore, transcriptS3Key } = payload;

  const incident = await getIncidentById(incidentId);
  if (!incident) {
    return { escalated: false, incidentId, reason: 'incident_not_found' };
  }

  // Idempotency: already beyond ai_processing — skip
  if (incident.status !== 'triggered' && incident.status !== 'ai_processing') {
    return { escalated: false, incidentId, reason: 'already_processed' };
  }

  // Attach AI outputs regardless of escalation decision
  await updateIncident(incidentId, {
    status: 'ai_processing',
    confidenceScore,
    aiSummary: aiSummary ?? null,
    urgencyScore: urgencyScore ?? null,
    transcriptS3Key: transcriptS3Key ?? null,
  });

  if (confidenceScore < ESCALATION_CONFIDENCE_THRESHOLD) {
    // Low confidence — auto-resolve without escalation
    await updateIncident(incidentId, {
      status: 'resolved',
      resolvedAt: new Date(),
    });
    const resolved = await getIncidentById(incidentId);
    emitIncidentUpdated(resolved);
    return { escalated: false, incidentId, reason: 'below_threshold' };
  }

  // ── Escalate ──────────────────────────────────────────────────────────────
  const responderId = await findNearestResponder(
    Number(incident.lat),
    Number(incident.lng)
  );

  const escalated = await updateIncident(incidentId, {
    status: responderId ? 'responder_assigned' : 'escalated',
    escalatedAt: new Date(),
    assignedResponderId: responderId ?? null,
  });

  emitIncidentUpdated(escalated);
  emitIncidentEscalated(escalated);

  await publishToSns({
    subject: `EMERGENCY ALERT — ${incident.type?.toUpperCase()} [${incidentId}]`,
    message: {
      incidentId,
      type: incident.type,
      lat: incident.lat,
      lng: incident.lng,
      confidenceScore,
      urgencyScore: urgencyScore ?? null,
      assignedResponderId: responderId ?? null,
      escalatedAt: escalated?.escalated_at ?? new Date().toISOString(),
    },
  });

  return { escalated: true, incidentId, assignedResponderId: responderId };
}
