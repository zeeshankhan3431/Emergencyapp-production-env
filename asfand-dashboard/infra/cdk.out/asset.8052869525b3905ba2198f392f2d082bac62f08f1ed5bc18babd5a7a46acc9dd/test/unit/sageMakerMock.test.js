/**
 * Unit tests — SageMaker service with stubbed confidence scores
 *
 * Validates that the mock correctly returns configurable stub responses,
 * enabling deterministic testing of urgency/escalation thresholds.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  invokeThreatClassifier,
  invokeGeoAnomaly,
  __setSageMakerMockResponse,
  __clearSageMakerMock,
} from '../../src/services/sageMakerService.js';

const TC_ENDPOINT  = 'threat-classifier-v2';
const GEO_ENDPOINT = 'geo-anomaly-v1';

beforeEach(() => {
  process.env.SAGEMAKER_USE_MOCK = 'true';
  __clearSageMakerMock();
});
afterEach(() => {
  __clearSageMakerMock();
});

const sampleFeatures = {
  declared_type:                        'assault',
  time_of_day:                          22,
  user_location_history_anomaly_score:  0.6,
  accelerometer_variance:               0.7,
  ambient_noise_level:                  0.5,
  geofence_breach_flag:                 1,
};

describe('invokeThreatClassifier — mock mode', () => {
  it('returns default mock response when no stub configured', async () => {
    const result = await invokeThreatClassifier(TC_ENDPOINT, sampleFeatures);
    expect(result).toMatchObject({
      class:      expect.stringMatching(/^(assault|medical|kidnap|other)$/),
      confidence: expect.any(Number),
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns stubbed high-confidence response', async () => {
    __setSageMakerMockResponse(TC_ENDPOINT, {
      class:         'assault',
      confidence:    0.95,
      model_version: 'threat-classifier-v2-test',
    });
    const result = await invokeThreatClassifier(TC_ENDPOINT, sampleFeatures);
    expect(result.confidence).toBe(0.95);
    expect(result.class).toBe('assault');
  });

  it('returns stubbed below-threshold response (0.74)', async () => {
    __setSageMakerMockResponse(TC_ENDPOINT, {
      class:         'other',
      confidence:    0.74,
      model_version: 'threat-classifier-v2-test',
    });
    const result = await invokeThreatClassifier(TC_ENDPOINT, sampleFeatures);
    expect(result.confidence).toBe(0.74);
  });

  it('returns stubbed exactly-at-threshold response (0.75)', async () => {
    __setSageMakerMockResponse(TC_ENDPOINT, {
      class:         'assault',
      confidence:    0.75,
      model_version: 'threat-classifier-v2-test',
    });
    const result = await invokeThreatClassifier(TC_ENDPOINT, sampleFeatures);
    expect(result.confidence).toBe(0.75);
  });
});

describe('invokeGeoAnomaly — mock mode', () => {
  it('returns default mock response', async () => {
    const result = await invokeGeoAnomaly(GEO_ENDPOINT, []);
    expect(result).toMatchObject({
      anomaly_score: expect.any(Number),
      anomaly_type:  expect.any(String),
    });
  });

  it('returns stubbed high anomaly response', async () => {
    __setSageMakerMockResponse(GEO_ENDPOINT, {
      anomaly_score:  0.9,
      anomaly_type:   'stopped',
      model_version:  'geo-anomaly-v1-test',
    });
    const coords = [{ lat: 51.5, lng: -0.1, timestamp: new Date().toISOString() }];
    const result = await invokeGeoAnomaly(GEO_ENDPOINT, coords);
    expect(result.anomaly_score).toBe(0.9);
    expect(result.anomaly_type).toBe('stopped');
  });

  it('different endpoints have independent mock stores', async () => {
    __setSageMakerMockResponse(TC_ENDPOINT,  { class: 'kidnap', confidence: 0.8, model_version: 'v1' });
    __setSageMakerMockResponse(GEO_ENDPOINT, { anomaly_score: 0.5, anomaly_type: 'unusual_speed', model_version: 'v2' });

    const tc  = await invokeThreatClassifier(TC_ENDPOINT, sampleFeatures);
    const geo = await invokeGeoAnomaly(GEO_ENDPOINT, []);

    expect(tc.class).toBe('kidnap');
    expect(geo.anomaly_type).toBe('unusual_speed');
  });
});
