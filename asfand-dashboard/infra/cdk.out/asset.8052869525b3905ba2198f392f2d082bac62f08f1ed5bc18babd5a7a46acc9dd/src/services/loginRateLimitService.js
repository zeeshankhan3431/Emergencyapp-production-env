import Redis from 'ioredis';

const MAX_FAIL = 5;
const LOCK_MIN = 1;
const LOCK_MS = LOCK_MIN * 60 * 1000;

/** @type {Redis | null} */
let redisClient = null;

function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redisClient) {
    redisClient = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redisClient;
}

/** @type {Map<string, { count: number, lockUntil: number }>} */
const memoryStore = new Map();

function keyFail(email) {
  return `login:fail:${email.toLowerCase()}`;
}
function keyLock(email) {
  return `login:lock:${email.toLowerCase()}`;
}

/**
 * @param {string} email
 * @returns {Promise<{ allowed: boolean, lockedUntil?: number }>}
 */
export async function checkLoginAllowed(email) {
  const e = email.trim().toLowerCase();
  const redis = getRedis();
  if (redis) {
    const lockTtl = await redis.ttl(keyLock(e));
    if (lockTtl > 0) {
      return { allowed: false, lockedUntil: Date.now() + lockTtl * 1000 };
    }
    return { allowed: true };
  }
  const m = memoryStore.get(e);
  if (m && m.lockUntil > Date.now()) {
    return { allowed: false, lockedUntil: m.lockUntil };
  }
  return { allowed: true };
}

/**
 * @param {string} email
 */
export async function recordLoginFailure(email) {
  const e = email.trim().toLowerCase();
  const redis = getRedis();
  if (redis) {
    const k = keyFail(e);
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, 3600);
    if (n >= MAX_FAIL) {
      await redis.set(keyLock(e), '1', 'PX', LOCK_MS);
      await redis.del(k);
    }
    return;
  }
  const now = Date.now();
  let rec = memoryStore.get(e);
  if (!rec) {
    rec = { count: 0, lockUntil: 0 };
  }
  if (rec.lockUntil > now) return;
  rec.count += 1;
  if (rec.count >= MAX_FAIL) {
    rec.lockUntil = now + LOCK_MS;
    rec.count = 0;
  }
  memoryStore.set(e, rec);
}

/** @param {string} email */
export async function recordLoginSuccess(email) {
  const e = email.trim().toLowerCase();
  const redis = getRedis();
  if (redis) {
    await redis.del(keyFail(e), keyLock(e));
    return;
  }
  memoryStore.delete(e);
}

export function __resetLoginRateLimitMemory() {
  memoryStore.clear();
}
