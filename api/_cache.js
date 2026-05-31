const { Redis } = require('@upstash/redis');

const NAMESPACE = 'pulse:';

// In-memory cache — sync, works within same warm lambda instance
const memCache = new Map();

// Redis client — null if env vars missing (local dev falls back to memory only)
let redis = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

async function get(key) {
  const entry = memCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;

  if (redis) {
    try {
      const val = await redis.get(NAMESPACE + key);
      if (val && typeof val === 'object' && Date.now() < val.expiresAt) {
        memCache.set(key, val);
        return val.data;
      }
    } catch (_) {}
  }

  return null;
}

function set(key, data, ttlSeconds) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  memCache.set(key, { data, expiresAt });

  // Fire-and-forget write to Redis for cross-instance sharing
  if (redis) {
    redis.set(NAMESPACE + key, { data, expiresAt }, { ex: ttlSeconds }).catch(() => {});
  }
}

function nextMidnightTTL() {
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.floor((midnight - Date.now()) / 1000));
}

// Last-good copy outlives the normal TTL so endpoints can serve stale data
// when a fresh upstream fetch fails, instead of returning a blank 500.
const STALE_PREFIX = 'lastgood:';
const STALE_TTL = 7 * 24 * 3600;

// Writes the normal TTL'd entry AND a long-lived last-good copy.
function setWithStale(key, data, ttlSeconds) {
  set(key, data, ttlSeconds);
  set(STALE_PREFIX + key, data, STALE_TTL);
}

// Writes ONLY the last-good copy, no normal cache entry. For endpoints that must
// stay uncached on the happy path (quotes) but still need a failure fallback.
function setStaleOnly(key, data, ttlSeconds = STALE_TTL) {
  set(STALE_PREFIX + key, data, ttlSeconds);
}

// Reads only the long-lived last-good copy (null if none within 7 days).
function getStale(key) {
  return get(STALE_PREFIX + key);
}

module.exports = { get, set, nextMidnightTTL, setWithStale, setStaleOnly, getStale };
