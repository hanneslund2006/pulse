const { Redis } = require('@upstash/redis');

/**
 * IP-based rate limiting using Redis
 *
 * Keys: pulse:rl:{ip}
 * Scope: Per IP address (not per user or API key)
 * Window: 1 hour sliding window
 * Max calls: 25 per hour
 *
 * IMPORTANT:
 * - Rate limits are tied to client IP, not API key or session
 * - Rotating ANTHROPIC_API_KEY does NOT reset rate limits
 * - Users behind the same NAT/proxy share rate limits
 * - Keys expire automatically after 1 hour of inactivity
 *
 * To manually reset a rate limit:
 *   redis.del('pulse:rl:{ip}')
 */

const WINDOW_SEC = 3600; // 60 minutes
const MAX_CALLS = 25;

let redis = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

function getIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

// Returns null if allowed, { waitMinutes } if rate limited
async function check(req) {
  // Fallback: if Redis is not available, allow request (graceful degradation)
  if (!redis) {
    console.warn('[ratelimit] Redis not configured - rate limiting disabled');
    return null;
  }

  const ip = getIP(req);
  const key = `pulse:rl:${ip}`;

  try {
    // Atomisk INCR - returnerer ny count
    const count = await redis.incr(key);

    // Only set TTL on first request (when key is created) to create a true 1-hour window
    if (count === 1) {
      await redis.expire(key, WINDOW_SEC);
    }

    if (count > MAX_CALLS) {
      // Hent TTL for å fortelle brukeren hvor lenge de må vente
      const ttl = await redis.ttl(key);
      // Defensive: handle negative TTL (should not happen, but Redis can return -1 or -2)
      const waitMinutes = Math.max(1, Math.ceil(ttl / 60));
      return { waitMinutes };
    }

    return null; // Request tillatt
  } catch (error) {
    console.error('[ratelimit] Redis error:', error.message);
    // Graceful degradation: ved Redis-feil, tillat request
    return null;
  }
}

module.exports = { check };
