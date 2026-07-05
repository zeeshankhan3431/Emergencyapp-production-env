/**
 * Lambda: incident-summariser  (Track B — part 2)
 *
 * Triggered by SQS queue 'summarisation-jobs'.
 * Message format: { incidentId, transcriptKey }
 *
 * Steps:
 *  1. Load transcript text from S3
 *  2. Call Claude (claude-sonnet-4-20250514) or GPT-4 with structured prompt
 *  3. Validate JSON response against Zod schema
 *  4. Store summary in incidents.ai_summary (PostgreSQL)
 *  5. Emit WebSocket event 'incident:ai_ready'
 */

import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import https from 'node:https';

import { getParameter, SSM_PATHS }       from '../services/ssmService.js';
import { getSecret }                     from '../services/secretsManagerService.js';
import { getObjectBuffer }               from '../services/s3Service.js';
import { updateIncident, getIncidentById } from '../services/incidentRepository.js';
import { emitIncidentAiReady }           from '../services/socketService.js';

// ─── Zod schema for LLM response ─────────────────────────────────────────────

export const AiSummarySchema = z.object({
  incident_type: z.enum(['assault', 'medical', 'kidnap', 'other']),
  key_events: z.array(z.string()).min(1).max(20),
  persons_mentioned: z.array(z.string()),
  location_description: z.string().max(500),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  recommended_action: z.string().max(1000),
  confidence_notes: z.string().max(500),
});

/** @typedef {z.infer<typeof AiSummarySchema>} AiSummary */

// ─── LLM system prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an emergency response analyst. Given the following incident transcript and metadata,
produce a structured JSON summary with keys: incident_type, key_events (array),
persons_mentioned (anonymised), location_description, risk_level (low|medium|high|critical),
recommended_action, confidence_notes. Be concise. Do not invent facts.
Respond ONLY with valid JSON — no markdown, no explanation, no code fences.`;

// ─── Mock ─────────────────────────────────────────────────────────────────────
let mockSummary = null;

export function __setLlmMock(/** @type {unknown} */ summary) { mockSummary = summary; }
export function __clearLlmMock() { mockSummary = null; }

function useLlmMock() {
  return process.env.LLM_USE_MOCK === 'true';
}

// ─── Core logic ──────────────────────────────────────────────────────────────

/**
 * @param {{ incidentId: string; transcriptKey: string }} job
 */
export async function processSummarisationJob(job) {
  const { incidentId, transcriptKey } = job;

  const incident = await getIncidentById(incidentId);
  if (!incident) throw new Error(`[incident-summariser] Incident not found: ${incidentId}`);

  // Idempotency: already summarised
  if (incident.ai_summary) {
    console.info('[incident-summariser] Already summarised — skip', incidentId);
    return { skipped: true, incidentId };
  }

  // ── Step 1: Load transcript ────────────────────────────────────────────────
  const transcriptBuf = await getObjectBuffer(transcriptKey);
  const transcript    = transcriptBuf.toString('utf8');

  // ── Step 2: Call LLM ──────────────────────────────────────────────────────
  const rawJson = await callLlm(transcript, incident);

  // ── Step 3: Validate against Zod schema ───────────────────────────────────
  let parsed;
  try {
    const obj = JSON.parse(rawJson);
    const result = AiSummarySchema.safeParse(obj);
    if (!result.success) {
      const friendly = fromZodError(result.error).toString();
      throw new Error(`[incident-summariser] Zod validation failed: ${friendly}`);
    }
    parsed = result.data;
  } catch (err) {
    if (err.message.includes('Zod')) throw err;
    throw new Error(`[incident-summariser] LLM returned invalid JSON: ${err.message}\nRaw: ${rawJson.slice(0, 300)}`);
  }

  // ── Step 4: Persist to PostgreSQL ─────────────────────────────────────────
  await updateIncident(incidentId, { aiSummary: JSON.stringify(parsed) });

  // ── Step 5: Emit WebSocket event ──────────────────────────────────────────
  const updated = await getIncidentById(incidentId);
  emitIncidentAiReady(updated);

  return { incidentId, summary: parsed };
}

// ─── LLM dispatch ─────────────────────────────────────────────────────────────

/**
 * @param {string} transcript
 * @param {object} incident
 * @returns {Promise<string>} raw JSON string
 */
async function callLlm(transcript, incident) {
  if (useLlmMock()) {
    if (mockSummary) return JSON.stringify(mockSummary);
    return JSON.stringify({
      incident_type:        incident.type ?? 'other',
      key_events:           ['Incident detected', 'User triggered alert'],
      persons_mentioned:    [],
      location_description: `Lat ${incident.lat}, Lng ${incident.lng}`,
      risk_level:           'medium',
      recommended_action:   'Dispatch nearest available responder.',
      confidence_notes:     'Mock response — model not invoked.',
    });
  }

  const modelId = (await getParameter(SSM_PATHS.LLM_MODEL_ID)) ?? 'claude-sonnet-4-20250514';
  const userContent = buildUserContent(transcript, incident);

  if (modelId.startsWith('claude')) {
    const claudeKeyArn = await getParameter(SSM_PATHS.CLAUDE_API_KEY_ARN);
    const apiKey       = await getSecret(claudeKeyArn);
    return await callClaude(modelId, apiKey, userContent);
  }

  // Default: OpenAI GPT-4
  const openaiKey = await getSecret(process.env.OPENAI_API_KEY_ARN ?? 'era/ai/openai-api-key');
  return await callOpenAI(modelId, openaiKey, userContent);
}

function buildUserContent(transcript, incident) {
  return [
    `Incident type declared: ${incident.type}`,
    `Urgency score: ${incident.urgency_score ?? 'unknown'}`,
    `Location: lat ${incident.lat}, lng ${incident.lng}`,
    `Transcript:\n${transcript}`,
  ].join('\n');
}

// ─── Claude API ───────────────────────────────────────────────────────────────

/**
 * @param {string} model   e.g. 'claude-sonnet-4-20250514'
 * @param {string} apiKey
 * @param {string} userContent
 */
async function callClaude(model, apiKey, userContent) {
  const body = JSON.stringify({
    model,
    max_tokens: 1024,
    system:   SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });
  return httpsPost('api.anthropic.com', '/v1/messages', {
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type':      'application/json',
  }, body, (data) => {
    const res  = JSON.parse(data);
    const text = res.content?.[0]?.text ?? '';
    return text;
  });
}

// ─── OpenAI API ───────────────────────────────────────────────────────────────

/**
 * @param {string} model   e.g. 'gpt-4o'
 * @param {string} apiKey
 * @param {string} userContent
 */
async function callOpenAI(model, apiKey, userContent) {
  const body = JSON.stringify({
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userContent },
    ],
  });
  return httpsPost('api.openai.com', '/v1/chat/completions', {
    Authorization:  `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }, body, (data) => {
    const res = JSON.parse(data);
    return res.choices?.[0]?.message?.content ?? '';
  });
}

// ─── Generic HTTPS POST helper ────────────────────────────────────────────────

/**
 * @param {string} hostname
 * @param {string} path
 * @param {Record<string, string>} headers
 * @param {string} body
 * @param {(data: string) => string} extractor
 * @returns {Promise<string>}
 */
function httpsPost(hostname, path, headers, body, extractor) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`[llm] HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
              return;
            }
            resolve(extractor(data));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Lambda handler ───────────────────────────────────────────────────────────

/** @param {{ Records: Array<{ body: string; messageId: string }> }} event */
export async function handler(event) {
  const failures = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      await processSummarisationJob(body);
    } catch (err) {
      console.error('[incident-summariser] Failed record', record.messageId, err);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures.map((f) => ({ itemIdentifier: f.itemIdentifier })) };
}
