const { Redis } = require('@upstash/redis');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker || !/^[A-Z0-9.]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'Ugyldig ticker-parameter' });
  }

  const key = `earnings_play2_${ticker}`;

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Redis-miljøvariabler mangler.' });
  }

  const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

  try {
    await redis.del(key);
    console.log(`[cache-clear] Slettet: ${key}`);
    return res.status(200).json({ ok: true, deleted: key });
  } catch (e) {
    console.error('[cache-clear] Redis del feilet:', e.message);
    return res.status(500).json({ error: 'Klarte ikke slette cache-nøkkel.' });
  }
};
