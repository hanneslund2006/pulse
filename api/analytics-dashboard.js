const { Redis } = require('@upstash/redis');

let redis = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

module.exports = async (req, res) => {
  // NO CORS header — internal use only

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authentication check (REQUIRED - first operation before any Redis calls)
  const secret = process.env.ANALYTICS_SECRET;
  if (!secret || req.headers['x-analytics-key'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!redis) {
    // Redis unavailable — return empty data, not error
    return res.status(200).json({});
  }

  try {
    const keys = await redis.keys('pulse:analytics:*');

    if (!keys || keys.length === 0) {
      return res.status(200).json({});
    }

    const result = {};

    for (const fullKey of keys) {
      try {
        // fullKey format: "pulse:analytics:ENDPOINT:YYYY-MM-DD"
        const keyParts = fullKey.replace('pulse:analytics:', '').split(':');
        if (keyParts.length !== 2) {
          console.warn(`[analytics-dashboard] Invalid key format: ${fullKey}`);
          continue;
        }

        const [endpoint, date] = keyParts;
        const valueObj = await redis.get(fullKey);

        // _cache.js stores {data, expiresAt}, so extract .data
        const count = valueObj?.data ?? valueObj ?? 0;

        if (!result[endpoint]) result[endpoint] = {};
        result[endpoint][date] = count;
      } catch (e) {
        console.warn(`[analytics-dashboard] Failed to process key ${fullKey}:`, e.message);
        continue;
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[analytics-dashboard] Redis error:', error);
    // Return empty data instead of 500 — dashboard should degrade gracefully
    return res.status(200).json({});
  }
};
