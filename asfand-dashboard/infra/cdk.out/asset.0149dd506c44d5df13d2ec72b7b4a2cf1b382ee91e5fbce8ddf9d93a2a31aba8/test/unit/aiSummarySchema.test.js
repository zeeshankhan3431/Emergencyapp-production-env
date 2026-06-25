/**
 * Unit tests — Zod schema validation for LLM responses (Track B, incident-summariser)
 *
 * Verifies that the AiSummarySchema correctly rejects malformed LLM output.
 */
import { describe, it, expect } from 'vitest';
import { AiSummarySchema } from '../../src/lambda/incidentSummariser.js';

const VALID_SUMMARY = {
  incident_type:        'assault',
  key_events:           ['Person A attacked Person B near park', 'Alert triggered'],
  persons_mentioned:    ['Person A (anonymised)', 'Person B (anonymised)'],
  location_description: 'City park area, north side',
  risk_level:           'high',
  recommended_action:   'Dispatch patrol unit to grid 4B immediately.',
  confidence_notes:     'Transcript quality high. No ambiguity.',
};

describe('AiSummarySchema — valid inputs', () => {
  it('accepts a well-formed summary', () => {
    const result = AiSummarySchema.safeParse(VALID_SUMMARY);
    expect(result.success).toBe(true);
  });

  it('accepts empty persons_mentioned array', () => {
    const result = AiSummarySchema.safeParse({ ...VALID_SUMMARY, persons_mentioned: [] });
    expect(result.success).toBe(true);
  });

  it('accepts all risk_level values', () => {
    for (const level of ['low', 'medium', 'high', 'critical']) {
      const result = AiSummarySchema.safeParse({ ...VALID_SUMMARY, risk_level: level });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all incident_type values', () => {
    for (const type of ['assault', 'medical', 'kidnap', 'other']) {
      const result = AiSummarySchema.safeParse({ ...VALID_SUMMARY, incident_type: type });
      expect(result.success).toBe(true);
    }
  });
});

describe('AiSummarySchema — invalid inputs (reject malformed LLM responses)', () => {
  it('rejects missing incident_type', () => {
    const { incident_type: _, ...rest } = VALID_SUMMARY;
    expect(AiSummarySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects unknown incident_type', () => {
    const result = AiSummarySchema.safeParse({ ...VALID_SUMMARY, incident_type: 'earthquake' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown risk_level', () => {
    const result = AiSummarySchema.safeParse({ ...VALID_SUMMARY, risk_level: 'extreme' });
    expect(result.success).toBe(false);
  });

  it('rejects empty key_events array', () => {
    const result = AiSummarySchema.safeParse({ ...VALID_SUMMARY, key_events: [] });
    expect(result.success).toBe(false);
  });

  it('rejects key_events that is not an array', () => {
    const result = AiSummarySchema.safeParse({ ...VALID_SUMMARY, key_events: 'some event' });
    expect(result.success).toBe(false);
  });

  it('rejects location_description exceeding 500 chars', () => {
    const result = AiSummarySchema.safeParse({
      ...VALID_SUMMARY,
      location_description: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects recommended_action exceeding 1000 chars', () => {
    const result = AiSummarySchema.safeParse({
      ...VALID_SUMMARY,
      recommended_action: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects completely empty object', () => {
    const result = AiSummarySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects null', () => {
    const result = AiSummarySchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('rejects numeric risk_level', () => {
    const result = AiSummarySchema.safeParse({ ...VALID_SUMMARY, risk_level: 5 });
    expect(result.success).toBe(false);
  });
});
