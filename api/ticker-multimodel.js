const { check: rateCheck } = require('./_ratelimit');
const { validateTicker } = require('./_validate');
const { fetchWithTimeout } = require('./_fetch');
const cache = require('./_cache');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: 'OPENROUTER_API_KEY not configured.' });
  }

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  const { ticker: rawTicker, layers } = req.body || {};

  let ticker;
  try {
    ticker = validateTicker(rawTicker);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (!Array.isArray(layers)) {
    return res.status(400).json({ error: 'layers required as array' });
  }

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:ticker-multimodel:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  const today = new Date().toISOString().slice(0, 10);
  const CACHE_KEY = `multimodel:${ticker}:${today}`;
  const cached = await cache.get(CACHE_KEY);
  if (cached) {
    console.log('[ticker-multimodel] CACHE HIT:', ticker);
    return res.status(200).json(cached);
  }

  const layerSummary = layers
    .map(l => `${l.name}: ${l.sentiment} — ${l.summary}`)
    .join('\n');

  const prompt = `Ticker: ${ticker}\n\nClaude analysis:\n${layerSummary}\n\nWhat is your independent assessment for swing trading? Return ONLY JSON: {"verdict":"Bullish","confidence":"High","reason":"max 15 words English"}`;

  const MODELS = [
    { id: 'openai/gpt-4o-mini',         name: 'GPT-4o Mini' },
    { id: 'google/gemini-flash-1.5-8b', name: 'Gemini Flash' },
  ];

  try {
    const results = await Promise.all(MODELS.map(async ({ id, name }) => {
      const response = await fetchWithTimeout(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://pulse-theta-wheat.vercel.app',
          'X-Title': 'PULSE Swingtrading',
        },
        body: JSON.stringify({
          model: id,
          max_tokens: 120,
          messages: [{ role: 'user', content: prompt }],
        }),
      }, 30000);

      if (!response.ok) {
        console.error('[ticker-multimodel]', id, 'returned', response.status);
        return { model: name, verdict: null, confidence: null, reason: null };
      }

      const data = await response.json();
      const text = (data.choices?.[0]?.message?.content || '').trim();
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first === -1) return { model: name, verdict: null, confidence: null, reason: null };

      try {
        const parsed = JSON.parse(text.substring(first, last + 1));
        return { model: name, ...parsed };
      } catch {
        return { model: name, verdict: null, confidence: null, reason: null };
      }
    }));

    const result = { opinions: results };
    cache.set(CACHE_KEY, result, cache.nextMidnightTTL());
    return res.status(200).json(result);
  } catch (error) {
    console.error('[ticker-multimodel] error:', error);
    return res.status(500).json({ error: 'Failed to fetch other models\' analysis.' });
  }
};
