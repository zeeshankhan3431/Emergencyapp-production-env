/**
 * Unit tests — Track A urgency score formula
 *
 * Formula: urgency = clamp( (confidence × 0.6) + (anomaly_score × 0.4), 0, 1 )
 *
 * Boundary values from spec: 0.0, 0.5, 0.75, 1.0
 */
import { describe, it, expect } from 'vitest';
import { computeUrgency } from '../../src/lambda/realtimeThreatClassifier.js';

describe('computeUrgency — Track A formula', () => {
  it('returns 0 for all-zero inputs', () => {
    expect(computeUrgency(0, 0)).toBe(0);
  });

  it('returns 1 for all-one inputs (clamped)', () => {
    expect(computeUrgency(1, 1)).toBe(1);
  });

  it('boundary: confidence=0.75, anomaly=0 → 0.45', () => {
    expect(computeUrgency(0.75, 0)).toBeCloseTo(0.45, 5);
  });

  it('boundary: confidence=0, anomaly=0.75 → 0.30', () => {
    expect(computeUrgency(0, 0.75)).toBeCloseTo(0.30, 5);
  });

  it('boundary: confidence=0.5, anomaly=0.5 → 0.50', () => {
    expect(computeUrgency(0.5, 0.5)).toBeCloseTo(0.50, 5);
  });

  it('spec values: confidence=1.0, anomaly=1.0 → clamped to 1.0', () => {
    const u = computeUrgency(1.0, 1.0);
    expect(u).toBe(1.0);
  });

  it('spec values: confidence=0.75, anomaly=0.5 → 0.65', () => {
    expect(computeUrgency(0.75, 0.5)).toBeCloseTo(0.65, 5);
  });

  it('escalation threshold: confidence=0.74, anomaly=0 → urgency < 0.45 (below SNS threshold)', () => {
    const u = computeUrgency(0.74, 0);
    expect(u).toBeCloseTo(0.444, 2);
  });

  it('clamps negative values to 0', () => {
    expect(computeUrgency(-1, -1)).toBe(0);
  });

  it('clamps over-unity values to 1', () => {
    expect(computeUrgency(2, 2)).toBe(1);
  });
});
