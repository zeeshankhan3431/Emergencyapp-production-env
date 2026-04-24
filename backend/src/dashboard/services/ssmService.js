/**
 * SSM Parameter Store — reads AI model endpoint names + LLM model IDs.
 * All Lambda functions read from SSM at cold start, cached in-process.
 * This enables zero-downtime model updates: update SSM → redeploy Lambda (or just wait for next cold start).
 */
import { SSMClient, GetParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';

/** @type {SSMClient | null} */
let ssmClient = null;

function getClient() {
  if (!ssmClient) {
    ssmClient = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return ssmClient;
}

/** In-process cache: param name → { value, fetchedAt } */
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Mock SSM values for tests — set via process.env.SSM_MOCK_* pattern.
 * e.g. SSM_MOCK_/era/ai/threat-classifier-endpoint=threat-classifier-v2
 */
function mockValue(name) {
  const key = `SSM_MOCK_${name.replace(/\//g, '_')}`;
  return process.env[key] ?? null;
}

export function useMock() {
  return process.env.SSM_USE_MOCK === 'true';
}

/** @param {string} name SSM parameter path (e.g. /era/ai/threat-classifier-endpoint) */
export async function getParameter(name) {
  if (useMock()) {
    return mockValue(name) ?? process.env[`SSM_DEFAULT_${name.split('/').pop()?.toUpperCase().replace(/-/g, '_')}`] ?? null;
  }

  const cached = cache.get(name);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const res = await getClient().send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );
  const value = res.Parameter?.Value ?? null;
  cache.set(name, { value, fetchedAt: Date.now() });
  return value;
}

/** @param {string[]} names */
export async function getParameters(names) {
  if (useMock()) {
    return Object.fromEntries(names.map((n) => [n, mockValue(n)]));
  }

  const res = await getClient().send(
    new GetParametersCommand({ Names: names, WithDecryption: true })
  );
  const result = {};
  for (const p of res.Parameters ?? []) {
    if (p.Name && p.Value) {
      cache.set(p.Name, { value: p.Value, fetchedAt: Date.now() });
      result[p.Name] = p.Value;
    }
  }
  return result;
}

export function __clearSsmCache() { cache.clear(); }

// ── Well-known parameter paths ────────────────────────────────────────────────
export const SSM_PATHS = {
  THREAT_CLASSIFIER_ENDPOINT: '/era/ai/threat-classifier-endpoint',
  GEO_ANOMALY_ENDPOINT:       '/era/ai/geo-anomaly-endpoint',
  LLM_MODEL_ID:               '/era/ai/llm-model-id',
  TRANSCRIBE_ENGINE:          '/era/ai/transcribe-engine',  // 'aws' | 'whisper'
  WHISPER_API_KEY_ARN:        '/era/ai/whisper-api-key-arn',
  CLAUDE_API_KEY_ARN:         '/era/ai/claude-api-key-arn',
};
