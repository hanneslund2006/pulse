const { Redis } = require('@upstash/redis');

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
  // Fallback: hvis Redis ikke er tilgjengelig, tillat request (graceful degradation)
  if (!redis) {
    console.warn('[ratelimit] Redis ikke konfigurert - rate limiting deaktivert');
    return null;
  }

  const ip = getIP(req);
  const key = `pulse:rl:${ip}`;

  try {
    // Atomisk INCR - returnerer ny count
    const count = await redis.incr(key);

    // Sett TTL for å unngå at keys akkumuleres (alltid kjøres, unngår race condition)
    await redis.expire(key, WINDOW_SEC);

    if (count > MAX_CALLS) {
      // Hent TTL for å fortelle brukeren hvor lenge de må vente
      const ttl = await redis.ttl(key);
      const waitMinutes = Math.ceil(ttl / 60);
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
