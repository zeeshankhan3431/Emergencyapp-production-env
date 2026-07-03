import { describe, it, expect } from 'vitest';
import { isValidTransition, isTerminal, ESCALATION_CONFIDENCE_THRESHOLD } from '../../src/constants/incidentStatus.js';

describe('incident state machine', () => {
  it('allows triggered → ai_processing', () => {
    expect(isValidTransition('triggered', 'ai_processing')).toBe(true);
  });

  it('allows ai_processing → escalated', () => {
    expect(isValidTransition('ai_processing', 'escalated')).toBe(true);
  });

  it('allows escalated → responder_assigned', () => {
    expect(isValidTransition('escalated', 'responder_assigned')).toBe(true);
  });

  it('allows responder_assigned → resolved', () => {
    expect(isValidTransition('responder_assigned', 'resolved')).toBe(true);
  });

  it('allows any non-terminal → cancelled', () => {
    expect(isValidTransition('triggered', 'cancelled')).toBe(true);
    expect(isValidTransition('ai_processing', 'cancelled')).toBe(true);
    expect(isValidTransition('escalated', 'cancelled')).toBe(true);
    expect(isValidTransition('responder_assigned', 'cancelled')).toBe(true);
  });

  it('rejects backwards transition resolved → triggered', () => {
    expect(isValidTransition('resolved', 'triggered')).toBe(false);
  });

  it('rejects skip: triggered → escalated (must go through ai_processing)', () => {
    expect(isValidTransition('triggered', 'escalated')).toBe(false);
  });

  it('rejects from terminal state resolved', () => {
    expect(isValidTransition('resolved', 'cancelled')).toBe(false);
  });

  it('rejects from terminal state cancelled', () => {
    expect(isValidTransition('cancelled', 'resolved')).toBe(false);
  });

  it('marks resolved and cancelled as terminal', () => {
    expect(isTerminal('resolved')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('triggered')).toBe(false);
    expect(isTerminal('escalated')).toBe(false);
  });
});

describe('escalation threshold', () => {
  it('threshold constant is 0.75', () => {
    expect(ESCALATION_CONFIDENCE_THRESHOLD).toBe(0.75);
  });

  it('0.74 is below threshold (no escalation)', () => {
    expect(0.74 < ESCALATION_CONFIDENCE_THRESHOLD).toBe(true);
  });

  it('0.75 meets threshold (escalate)', () => {
    expect(0.75 >= ESCALATION_CONFIDENCE_THRESHOLD).toBe(true);
  });

  it('0.99 is above threshold (escalate)', () => {
    expect(0.99 >= ESCALATION_CONFIDENCE_THRESHOLD).toBe(true);
  });
});
