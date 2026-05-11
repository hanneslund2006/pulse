const { Redis } = require('@upstash/redis');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker || !/^[A-Z0-9.]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker parameter' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const keys = [
    `earnings:${ticker}:${today}`,
    `insider_${ticker}`,
    `sec_cik_${ticker}`
  ];

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Redis environment variables missing.' });
  }

  const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

  try {
    await Promise.all(keys.map(k => redis.del(k)));
    console.log(`[cache-clear] Deleted: ${keys.join(', ')}`);
    return res.status(200).json({ ok: true, deleted: keys });
  } catch (e) {
    console.error('[cache-clear] Redis del failed:', e.message);
    return res.status(500).json({ error: 'Failed to delete cache key.' });
  }
};
