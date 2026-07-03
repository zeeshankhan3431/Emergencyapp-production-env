import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { insertUser } from '../../src/services/userRepository.js';
import { createIncident, getIncidentById } from '../../src/services/incidentRepository.js';
import { runEscalationEngine } from '../../src/services/escalationEngine.js';
import { __getSnsMockPublished, __clearSnsMock } from '../../src/services/snsService.js';

beforeEach(async () => {
  process.env.KINESIS_USE_MOCK = 'true';
  process.env.SNS_USE_MOCK = 'true';
  process.env.MOCK_AUTO_VERIFY = 'true';
  await initTestDatabase();
  __clearSnsMock();
});

afterEach(async () => {
  await teardownTestDatabase();
  __clearSnsMock();
});

async function seedUserAndIncident(type = 'medical') {
  const user = await insertUser({ email: 'u@test.com', cognitoSub: 'sub1', role: 'Public', fullName: 'U', isVerified: true });
  const incident = await createIncident({ userId: user.id, type, lat: 37.7, lng: -122.4 });
  return { user, incident };
}

describe('escalation engine — below threshold (0.74)', () => {
  it('auto-resolves incident and does NOT publish to SNS', async () => {
    const { incident } = await seedUserAndIncident();
    const result = await runEscalationEngine({ incidentId: incident.id, confidenceScore: 0.74 });

    expect(result.escalated).toBe(false);
    expect(result.reason).toBe('below_threshold');
    const updated = await getIncidentById(incident.id);
    expect(updated.status).toBe('resolved');
    expect(__getSnsMockPublished()).toHaveLength(0);
  });
});

describe('escalation engine — at threshold (0.75)', () => {
  it('escalates incident and publishes SNS alert', async () => {
    const { incident } = await seedUserAndIncident('assault');
    const result = await runEscalationEngine({
      incidentId: incident.id,
      confidenceScore: 0.75,
      aiSummary: 'Violent incident detected.',
      urgencyScore: 0.9,
    });

    expect(result.escalated).toBe(true);
    const updated = await getIncidentById(incident.id);
    expect(['escalated', 'responder_assigned']).toContain(updated.status);
    expect(updated.escalated_at).not.toBeNull();
    const published = __getSnsMockPublished();
    expect(published).toHaveLength(1);
    expect(published[0].subject).toMatch(/ASSAULT/i);
  });
});

describe('escalation engine — above threshold (0.99)', () => {
  it('escalates and sets ai_summary and confidence_score', async () => {
    const { incident } = await seedUserAndIncident('kidnap');
    await runEscalationEngine({
      incidentId: incident.id,
      confidenceScore: 0.99,
      aiSummary: 'High-confidence kidnap detected.',
      urgencyScore: 1.0,
    });
    const updated = await getIncidentById(incident.id);
    expect(Number(updated.confidence_score)).toBeCloseTo(0.99);
    expect(updated.ai_summary).toBe('High-confidence kidnap detected.');
  });
});

describe('escalation engine — idempotency', () => {
  it('skips already-processed incidents', async () => {
    const { incident } = await seedUserAndIncident();
    await runEscalationEngine({ incidentId: incident.id, confidenceScore: 0.9 });
    __clearSnsMock();
    const result2 = await runEscalationEngine({ incidentId: incident.id, confidenceScore: 0.9 });
    expect(result2.reason).toBe('already_processed');
    expect(__getSnsMockPublished()).toHaveLength(0);
  });
});

describe('escalation engine — incident not found', () => {
  it('returns not_found reason gracefully', async () => {
    const result = await runEscalationEngine({
      incidentId: '00000000-0000-0000-0000-000000000000',
      confidenceScore: 0.9,
    });
    expect(result.escalated).toBe(false);
    expect(result.reason).toBe('incident_not_found');
  });
});
