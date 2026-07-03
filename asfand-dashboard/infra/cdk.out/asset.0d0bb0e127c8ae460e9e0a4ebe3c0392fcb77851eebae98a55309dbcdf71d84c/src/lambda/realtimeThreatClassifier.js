/**
 * Lambda: realtime-threat-classifier  (Track A)
 *
 * Invoked in parallel with incident creation (async invoke from POST /api/incidents).
 * Target latency: < 1 second p99 with provisioned concurrency.
 *
 * Steps:
 *  1. Call SageMaker 'threat-classifier-v2' endpoint
 *  2. Call SageMaker 'geo-anomaly-v1' endpoint (LSTM)
 *  3. Combine: urgency = (confidence × 0.6) + (anomaly_score × 0.4)
 *  4. Write to DynamoDB ai_results
 *  5. Call runEscalationEngine (Module 2) with the computed scores
 */

import { getParameter, SSM_PATHS } from '../services/ssmService.js';
import { invokeThreatClassifier, invokeGeoAnomaly } from '../services/sageMakerService.js';
import { writeAiResult } from '../services/aiResultsRepository.js';
import { runEscalationEngine } from '../services/escalationEngine.js';
import { updateIncident } from '../services/incidentRepository.js';

/**
 * Urgency formula:
 *   urgency = clamp( (confidence × 0.6) + (anomaly_score × 0.4), 0, 1 )
 *
 * @param {number} confidence   0–1 from threat classifier
 * @param {number} anomalyScore 0–1 from geo-anomaly LSTM
 * @returns {number}
 */
export function computeUrgency(confidence, anomalyScore) {
  const raw = confidence * 0.6 + anomalyScore * 0.4;
  return Math.min(1, Math.max(0, raw));
}

/**
 * Core classification logic — extracted for unit-testability.
 *
 * @param {{
 *   incidentId: string;
 *   typeDeclared: string;
 *   lat: number;
 *   lng: number;
 *   userHistory?: object;
 *   deviceSignals?: {
 *     accelerometer_variance?: number;
 *     ambient_noise_level?: number;
 *     geofence_breach_flag?: number;
 *   };
 *   gpsHistory?: Array<{ lat: number; lng: number; timestamp: string }>;
 * }} input
 */
export async function classifyIncident(input) {
  const {
    incidentId,
    typeDeclared,
    lat,
    lng,
    userHistory = {},
    deviceSignals = {},
    gpsHistory = [],
  } = input;

  // ── Read model endpoints from SSM at cold start (cached) ──────────────────
  const [threatEndpoint, geoEndpoint] = await Promise.all([
    getParameter(SSM_PATHS.THREAT_CLASSIFIER_ENDPOINT),
    getParameter(SSM_PATHS.GEO_ANOMALY_ENDPOINT),
  ]);

  const tcEndpoint  = threatEndpoint ?? 'threat-classifier-v2';
  const geoEndpoint_ = geoEndpoint   ?? 'geo-anomaly-v1';

  // ── Mark incident as ai_processing ────────────────────────────────────────
  await updateIncident(incidentId, { status: 'ai_processing' });

  // ── Step 1: Threat Classifier (parallel with Geo Anomaly) ─────────────────
  const [threatResult, geoResult] = await Promise.all([
    invokeThreatClassifier(tcEndpoint, {
      declared_type:                         typeDeclared,
      time_of_day:                           new Date().getUTCHours(),
      user_location_history_anomaly_score:   userHistory?.locationAnomalyScore ?? 0,
      accelerometer_variance:                deviceSignals?.accelerometer_variance ?? 0,
      ambient_noise_level:                   deviceSignals?.ambient_noise_level ?? 0,
      geofence_breach_flag:                  deviceSignals?.geofence_breach_flag ?? 0,
    }),
    invokeGeoAnomaly(geoEndpoint_, gpsHistory.slice(-10)),
  ]);

  // ── Step 3: Combine scores ─────────────────────────────────────────────────
  const urgencyScore = computeUrgency(threatResult.confidence, geoResult.anomaly_score);

  // ── Step 4: Write to DynamoDB ai_results ──────────────────────────────────
  await writeAiResult({
    incidentId,
    confidence:          threatResult.confidence,
    anomalyScore:        geoResult.anomaly_score,
    urgencyScore,
    classifiedType:      threatResult.class,
    anomalyType:         geoResult.anomaly_type,
    threatModelVersion:  threatResult.model_version,
    geoModelVersion:     geoResult.model_version,
    track:               'A',
  });

  // ── Step 5: Hand off to Module 2 Escalation Engine ────────────────────────
  const escalationResult = await runEscalationEngine({
    incidentId,
    confidenceScore: threatResult.confidence,
    urgencyScore,
  });

  return {
    incidentId,
    confidence:     threatResult.confidence,
    anomalyScore:   geoResult.anomaly_score,
    urgencyScore,
    classifiedType: threatResult.class,
    anomalyType:    geoResult.anomaly_type,
    escalated:      escalationResult.escalated,
  };
}

// ─── Lambda handler (async-invoked by POST /api/incidents) ───────────────────

/**
 * @param {{ incidentId: string; typeDeclared: string; lat: number; lng: number;
 *           userHistory?: object; deviceSignals?: object; gpsHistory?: object[] }} event
 */
export async function handler(event) {
  try {
    const result = await classifyIncident(event);
    console.info('[realtime-threat-classifier] OK', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[realtime-threat-classifier] ERROR', err);
    throw err;
  }
}
