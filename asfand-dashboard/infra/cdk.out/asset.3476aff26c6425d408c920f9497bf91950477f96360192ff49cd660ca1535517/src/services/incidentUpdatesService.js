/**
 * Publishes non-urgent incident status updates to SNS incident-updates topic
 * for the assigned responder workflow (Module 6).
 */
import { publishToSns } from './snsService.js';
import { incidentUpdatesTopicArn } from './snsTopics.js';

/**
 * @param {object} incident
 * @param {string} [previousStatus]
 */
export async function publishIncidentStatusUpdate(incident, previousStatus) {
  if (!incident?.assigned_responder_id) return;
  const arn = incidentUpdatesTopicArn();
  if (!arn) {
    console.warn('[incident-updates] SNS_INCIDENT_UPDATES_ARN unset — skip');
    return;
  }
  await publishToSns({
    topicArn: arn,
    subject:  `Incident update — ${incident.type} [${incident.id}]`,
    message:  {
      incidentId:          incident.id,
      status:              incident.status,
      previousStatus:      previousStatus ?? null,
      type:                incident.type,
      assignedResponderId: incident.assigned_responder_id,
      updatedAt:           new Date().toISOString(),
    },
  });
}
