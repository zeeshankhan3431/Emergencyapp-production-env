/**
 * Integration tests — AI Pipeline (Module 4)
 *
 * Tracks tested:
 *  A. classifyIncident → SageMaker mock → urgency → escalation engine → DB
 *  B. processTranscriptionJob → mock Transcribe → S3 → summarisation-jobs SQS
 *     processSummarisationJob → mock LLM → Zod validation → DB → Socket.io
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { insertUser } from '../../src/services/userRepository.js';
import { createIncident } from '../../src/services/incidentRepository.js';
import { __setSageMakerMockResponse, __clearSageMakerMock } from '../../src/services/sageMakerService.js';
import { __clearAiResultsMemory, __getAiResultsMemory } from '../../src/services/aiResultsRepository.js';
import { __getSqsMockQueue, __clearSqsMock } from '../../src/services/sqsService.js';
import { __mockS3PutObject, __clearS3Mock } from '../../src/services/s3Service.js';
import { classifyIncident } from '../../src/lambda/realtimeThreatClassifier.js';
import { processTranscriptionJob } from '../../src/lambda/audioTranscriptionWorker.js';
import {
  processSummarisationJob,
  AiSummarySchema,
  __setLlmMock,
  __clearLlmMock,
} from '../../src/lambda/incidentSummariser.js';
import { getIncidentById } from '../../src/services/incidentRepository.js';

let userId;
let incidentId;

beforeEach(async () => {
  await initTestDatabase();

  // Env flags for all mocks
  process.env.SAGEMAKER_USE_MOCK       = 'true';
  process.env.AI_RESULTS_DISABLED      = 'true';
  process.env.SSM_USE_MOCK             = 'true';
  process.env.TRANSCRIBE_USE_MOCK      = 'true';
  process.env.LLM_USE_MOCK             = 'true';
  process.env.SECRETS_MANAGER_USE_MOCK = 'true';
  process.env.SQS_USE_MOCK             = 'true';
  process.env.S3_USE_MOCK              = 'true';

  __clearSageMakerMock();
  __clearAiResultsMemory();
  __clearSqsMock();
  __clearS3Mock();

  // Seed: admin user + incident
  const user = await insertUser({
    email:      'ai-tester@example.com',
    cognitoSub: 'ai-sub-001',
    role:       'Admin',
    fullName:   'AI Tester',
    isVerified: true,
  });
  userId = user.id;

  const incident = await createIncident({
    userId,
    type:   'assault',
    lat:    51.5074,
    lng:    -0.1278,
    status: 'triggered',
  });
  incidentId = incident.id;
});

afterEach(async () => {
  await teardownTestDatabase();
});

// ── Track A ───────────────────────────────────────────────────────────────────

describe('Track A — classifyIncident (real-time threat classification)', () => {
  it('escalates incident when confidence > 0.75', async () => {
    __setSageMakerMockResponse('threat-classifier-v2', {
      class: 'assault', confidence: 0.90, model_version: 'v2-test',
    });
    __setSageMakerMockResponse('geo-anomaly-v1', {
      anomaly_score: 0.6, anomaly_type: 'stopped', model_version: 'v1-test',
    });

    const result = await classifyIncident({
      incidentId,
      typeDeclared: 'assault',
      lat:          51.5074,
      lng:          -0.1278,
    });

    expect(result.confidence).toBe(0.90);
    expect(result.anomalyScore).toBe(0.6);
    expect(result.urgencyScore).toBeCloseTo(0.90 * 0.6 + 0.6 * 0.4, 4);
    expect(result.escalated).toBe(true);

    const updated = await getIncidentById(incidentId);
    expect(['escalated', 'responder_assigned']).toContain(updated.status);
  });

  it('does NOT escalate when confidence = 0.74 (below threshold)', async () => {
    __setSageMakerMockResponse('threat-classifier-v2', {
      class: 'other', confidence: 0.74, model_version: 'v2-test',
    });
    __setSageMakerMockResponse('geo-anomaly-v1', {
      anomaly_score: 0.0, anomaly_type: 'normal', model_version: 'v1-test',
    });

    const result = await classifyIncident({
      incidentId,
      typeDeclared: 'other',
      lat:          51.5074,
      lng:          -0.1278,
    });

    expect(result.escalated).toBe(false);
    const updated = await getIncidentById(incidentId);
    expect(updated.status).toBe('resolved');
  });

  it('escalates when confidence = exactly 0.75', async () => {
    __setSageMakerMockResponse('threat-classifier-v2', {
      class: 'assault', confidence: 0.75, model_version: 'v2-test',
    });
    __setSageMakerMockResponse('geo-anomaly-v1', {
      anomaly_score: 0.0, anomaly_type: 'normal', model_version: 'v1-test',
    });

    const result = await classifyIncident({
      incidentId,
      typeDeclared: 'assault',
      lat:          51.5074,
      lng:          -0.1278,
    });
    expect(result.escalated).toBe(true);
  });

  it('stores ai_result in DynamoDB mock store', async () => {
    __setSageMakerMockResponse('threat-classifier-v2', {
      class: 'medical', confidence: 0.82, model_version: 'v2-test',
    });

    await classifyIncident({ incidentId, typeDeclared: 'medical', lat: 51.5, lng: -0.1 });

    const results = __getAiResultsMemory();
    expect(results.length).toBeGreaterThanOrEqual(1);
    const row = results.find((r) => r.incident_id === incidentId);
    expect(row).toBeDefined();
    expect(row.confidence).toBe(0.82);
    expect(row.track).toBe('A');
  });
});

// ── Track B — Transcription ───────────────────────────────────────────────────

describe('Track B — processTranscriptionJob', () => {
  const MOCK_TRANSCRIPT = 'The victim stated they were assaulted at the park entrance.';

  beforeEach(() => {
    process.env._MOCK_TRANSCRIPT = MOCK_TRANSCRIPT;
    // Seed a fake encrypted audio object in S3 mock
    __mockS3PutObject(`evidence/${incidentId}/audio.enc`, {
      content:  Buffer.from('fake-encrypted-audio'),
      checksum: 'abc',
      size:     20,
    });
  });

  it('writes transcript to S3 and pushes to summarisation queue', async () => {
    const result = await processTranscriptionJob({
      incidentId,
      s3Key: `evidence/${incidentId}/audio.enc`,
    });

    expect(result.skipped).toBeUndefined();
    expect(result.transcriptKey).toBe(`transcripts/${incidentId}.txt`);

    const updated = await getIncidentById(incidentId);
    expect(updated.transcript_s3_key).toBe(`transcripts/${incidentId}.txt`);

    const sqsQueue = __getSqsMockQueue();
    const sumJob   = sqsQueue.find((m) => m.body?.incidentId === incidentId);
    expect(sumJob).toBeDefined();
    expect(sumJob.body.transcriptKey).toBe(`transcripts/${incidentId}.txt`);
  });

  it('skips transcription if incident already has transcript_s3_key', async () => {
    // Set transcript key directly
    const { updateIncident } = await import('../../src/services/incidentRepository.js');
    await updateIncident(incidentId, { transcriptS3Key: `transcripts/${incidentId}.txt` });

    const result = await processTranscriptionJob({
      incidentId,
      s3Key: `evidence/${incidentId}/audio.enc`,
    });
    expect(result.skipped).toBe(true);
  });
});

// ── Track B — Summarisation ───────────────────────────────────────────────────

describe('Track B — processSummarisationJob', () => {
  const transcriptKey = `transcripts/${incidentId}-mock.txt`;
  const MOCK_SUMMARY  = {
    incident_type:        'assault',
    key_events:           ['Alert triggered', 'Victim reported attacker fled north'],
    persons_mentioned:    ['Person A (anonymised)'],
    location_description: 'Park entrance, north side',
    risk_level:           'high',
    recommended_action:   'Dispatch patrol to park immediately.',
    confidence_notes:     'High-quality transcript.',
  };

  beforeEach(() => {
    __setLlmMock(MOCK_SUMMARY);

    // Seed transcript in S3 mock
    __mockS3PutObject(transcriptKey, {
      content:  Buffer.from(JSON.stringify(MOCK_SUMMARY)),
      checksum: '',
      size:     100,
    });
  });

  it('stores validated ai_summary in PostgreSQL', async () => {
    const result = await processSummarisationJob({ incidentId, transcriptKey });
    expect(result.skipped).toBeUndefined();
    expect(result.summary).toMatchObject({ risk_level: 'high', incident_type: 'assault' });

    const updated = await getIncidentById(incidentId);
    expect(updated.ai_summary).toBeTruthy();
    const parsed = JSON.parse(updated.ai_summary);
    expect(AiSummarySchema.safeParse(parsed).success).toBe(true);
  });

  it('skips if ai_summary already set (idempotency)', async () => {
    const { updateIncident } = await import('../../src/services/incidentRepository.js');
    await updateIncident(incidentId, { aiSummary: '{"already":"set"}' });

    const result = await processSummarisationJob({ incidentId, transcriptKey });
    expect(result.skipped).toBe(true);
  });
});

// ── Track B — Zod rejection ───────────────────────────────────────────────────

describe('Track B — Zod rejection of malformed LLM output', () => {
  it('throws if LLM returns malformed JSON structure', async () => {
    process.env.LLM_USE_MOCK = 'true';
    __setLlmMock({ bad_field: 'no schema match' });

    const transcriptKey2 = `transcripts/${incidentId}-bad.txt`;
    __mockS3PutObject(transcriptKey2, {
      content:  Buffer.from('mock transcript'),
      checksum: '',
      size:     16,
    });

    await expect(
      processSummarisationJob({ incidentId, transcriptKey: transcriptKey2 })
    ).rejects.toThrow(/Zod validation failed/);

    __clearLlmMock();
    delete process.env._MOCK_TRANSCRIPT;
  });
});
