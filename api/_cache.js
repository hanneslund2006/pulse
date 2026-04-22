const { Redis } = require('@upstash/redis');

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

function get(key) {
  const entry = memCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;

  // Background: hydrate memory from Redis so subsequent calls on this instance hit
  if (redis) {
    redis.get(key).then(val => {
      if (val && typeof val === 'object' && Date.now() < val.expiresAt) {
        memCache.set(key, val);
      }
    }).catch(() => {});
  }

  return null;
}

function set(key, data, ttlSeconds) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  memCache.set(key, { data, expiresAt });

  // Fire-and-forget write to Redis for cross-instance sharing
  if (redis) {
    redis.set(key, { data, expiresAt }, { ex: ttlSeconds }).catch(() => {});
  }
}

function nextMidnightTTL() {
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.floor((midnight - Date.now()) / 1000));
}

module.exports = { get, set, nextMidnightTTL };
