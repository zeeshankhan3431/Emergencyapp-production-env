/**
 * AWS Secrets Manager helper — fetches named secrets.
 * Results are cached in-process for the Lambda execution lifetime.
 * Never log the returned secret values.
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/** @type {SecretsManagerClient | null} */
let client = null;

function getClient() {
  if (!client) {
    client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return client;
}

/** @type {Map<string, { value: string; fetchedAt: number }>} */
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Mock map: secretId → value */
const mockSecrets = new Map();

export function useMock() {
  return process.env.SECRETS_MANAGER_USE_MOCK === 'true';
}

/** @param {string} secretId @param {string} value */
export function __setSecretMock(secretId, value) { mockSecrets.set(secretId, value); }
export function __clearSecretsMock()             { mockSecrets.clear(); cache.clear(); }

/**
 * @param {string} secretId  ARN or name
 * @returns {Promise<string>}  plaintext secret value (JSON string or raw)
 */
export async function getSecret(secretId) {
  if (useMock()) {
    const v = mockSecrets.get(secretId);
    if (v === undefined) throw new Error(`[secrets-manager] No mock configured for "${secretId}"`);
    return v;
  }

  const cached = cache.get(secretId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const res = await getClient().send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  const value = res.SecretString ?? '';
  cache.set(secretId, { value, fetchedAt: Date.now() });
  return value;
}
