/**
 * SageMaker Runtime service.
 * Invokes real-time inference endpoints (InvokeEndpoint).
 * Mock mode returns configurable stubbed responses for tests.
 */
import { SageMakerRuntimeClient, InvokeEndpointCommand } from '@aws-sdk/client-sagemaker-runtime';

/** @type {SageMakerRuntimeClient | null} */
let client = null;

function getClient() {
  if (!client) {
    client = new SageMakerRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return client;
}

// ─── Mock store ──────────────────────────────────────────────────────────────
/** @type {Map<string, unknown>} endpointName → stubbed response */
const mockResponses = new Map();

export function useMock() {
  return process.env.SAGEMAKER_USE_MOCK === 'true';
}

/** @param {string} endpointName @param {unknown} response */
export function __setSageMakerMockResponse(endpointName, response) {
  mockResponses.set(endpointName, response);
}
export function __clearSageMakerMock() { mockResponses.clear(); }

// ─── Threat Classifier ───────────────────────────────────────────────────────

/**
 * @typedef {object} ThreatClassifierInput
 * @property {string} declared_type                    assault|medical|kidnap|other
 * @property {number} time_of_day                      Hour 0–23
 * @property {number} user_location_history_anomaly_score  0–1
 * @property {number} accelerometer_variance           0–1 normalized
 * @property {number} ambient_noise_level              0–1 normalized
 * @property {number} geofence_breach_flag             0 or 1
 */

/**
 * @typedef {object} ThreatClassifierOutput
 * @property {'assault'|'medical'|'kidnap'|'other'} class
 * @property {number} confidence   0–1
 * @property {string} model_version
 */

/**
 * @param {string} endpointName
 * @param {ThreatClassifierInput} features
 * @returns {Promise<ThreatClassifierOutput>}
 */
export async function invokeThreatClassifier(endpointName, features) {
  if (useMock()) {
    const mock = mockResponses.get(endpointName) ?? {
      class: features.declared_type ?? 'other',
      confidence: 0.82,
      model_version: 'threat-classifier-v2-mock',
    };
    return /** @type {ThreatClassifierOutput} */ (mock);
  }

  const body = Buffer.from(JSON.stringify(features), 'utf8');
  const res = await getClient().send(
    new InvokeEndpointCommand({
      EndpointName: endpointName,
      Body: body,
      ContentType: 'application/json',
      Accept: 'application/json',
    })
  );
  const text = Buffer.from(res.Body).toString('utf8');
  return JSON.parse(text);
}

// ─── Geo Anomaly (LSTM) ──────────────────────────────────────────────────────

/**
 * @typedef {object} GeoCoordinate
 * @property {number} lat
 * @property {number} lng
 * @property {string} timestamp ISO string
 */

/**
 * @typedef {object} GeoAnomalyOutput
 * @property {number} anomaly_score   0–1
 * @property {'stopped'|'wrong_direction'|'unusual_speed'|'normal'} anomaly_type
 * @property {string} model_version
 */

/**
 * @param {string} endpointName
 * @param {GeoCoordinate[]} coordinates  Last 10 GPS points
 * @returns {Promise<GeoAnomalyOutput>}
 */
export async function invokeGeoAnomaly(endpointName, coordinates) {
  if (useMock()) {
    const mock = mockResponses.get(endpointName) ?? {
      anomaly_score: 0.3,
      anomaly_type: 'normal',
      model_version: 'geo-anomaly-v1-mock',
    };
    return /** @type {GeoAnomalyOutput} */ (mock);
  }

  const body = Buffer.from(JSON.stringify({ coordinates }), 'utf8');
  const res = await getClient().send(
    new InvokeEndpointCommand({
      EndpointName: endpointName,
      Body: body,
      ContentType: 'application/json',
      Accept: 'application/json',
    })
  );
  const text = Buffer.from(res.Body).toString('utf8');
  return JSON.parse(text);
}
