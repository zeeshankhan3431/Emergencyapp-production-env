/** @typedef {'triggered'|'ai_processing'|'escalated'|'responder_assigned'|'resolved'|'cancelled'} IncidentStatus */
/** @typedef {'assault'|'medical'|'kidnap'|'other'} IncidentType */

export const INCIDENT_STATUSES = /** @type {const} */ ([
  'triggered', 'ai_processing', 'escalated',
  'responder_assigned', 'resolved', 'cancelled',
]);

export const INCIDENT_TYPES = /** @type {const} */ (['assault', 'medical', 'kidnap', 'other']);

/**
 * Valid forward transitions per current status.
 * Admin may cancel any non-terminal status.
 * @type {Record<IncidentStatus, IncidentStatus[]>}
 */
export const VALID_TRANSITIONS = {
  triggered:          ['ai_processing', 'cancelled'],
  ai_processing:      ['escalated', 'resolved', 'cancelled'],
  escalated:          ['responder_assigned', 'resolved', 'cancelled'],
  responder_assigned: ['resolved', 'cancelled'],
  resolved:           [],
  cancelled:          [],
};

/**
 * @param {IncidentStatus} from
 * @param {IncidentStatus} to
 */
export function isValidTransition(from, to) {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/** @param {IncidentStatus} s */
export function isTerminal(s) {
  return s === 'resolved' || s === 'cancelled';
}

export const ESCALATION_CONFIDENCE_THRESHOLD = 0.75;
