import { describe, it, expect } from 'vitest';
import {
  generaliseCoordinates,
  hourBucket,
  computeCohortId,
  evaluateKAnonymity,
  K_ANON_MIN,
} from '../../src/services/anonymisationService.js';

describe('anonymisation helpers', () => {
  it('generalises lat/lng to 3 decimal places', () => {
    expect(generaliseCoordinates(51.507351, -0.127758)).toEqual({
      generalised_lat: 51.507,
      generalised_lng: -0.128,
    });
  });

  it('hourBucket rounds to UTC hour boundary', () => {
    const d = new Date('2026-04-12T14:37:00.000Z');
    const b = hourBucket(d);
    expect(b.toISOString()).toBe('2026-04-12T14:00:00.000Z');
  });

  it('cohort_id is stable for same grid cell', () => {
    const a = computeCohortId(51.507, -0.128);
    const b = computeCohortId(51.507, -0.128);
    expect(a).toBe(b);
    expect(a.startsWith('coh_')).toBe(true);
  });

  it('evaluateKAnonymity: k ≥ 5 satisfied when all in same bucket', () => {
    const rec = Array.from({ length: 5 }, () => ({
      glat: 51.507,
      glng: -0.128,
      hour: '2026-04-12T14:00:00.000Z',
      type: 'assault',
    }));
    const r = evaluateKAnonymity(rec);
    expect(r.satisfied).toBe(true);
    expect(r.minGroupSize).toBe(5);
  });

  it('evaluateKAnonymity: fails when group size < 5', () => {
    const rec = Array.from({ length: 4 }, () => ({
      glat: 51.507,
      glng: -0.128,
      hour: '2026-04-12T14:00:00.000Z',
      type: 'assault',
    }));
    const r = evaluateKAnonymity(rec);
    expect(r.satisfied).toBe(false);
    expect(r.minGroupSize).toBe(4);
  });

  it('K_ANON_MIN is 5', () => {
    expect(K_ANON_MIN).toBe(5);
  });
});
