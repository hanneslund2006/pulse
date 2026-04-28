const cache = require('./_cache');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: 'OPENROUTER_API_KEY ikke konfigurert.' });
  }

  const { ticker, layers } = req.body || {};
  if (!ticker || !Array.isArray(layers)) {
    return res.status(400).json({ error: 'ticker og layers kreves' });
  }

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

  const prompt = `Ticker: ${ticker}\n\nClaude-analyse:\n${layerSummary}\n\nHva er din uavhengige vurdering for swing trading? Returner KUN JSON: {"verdict":"Bullish","confidence":"Høy","reason":"maks 15 ord norsk"}`;

  const MODELS = [
    { id: 'openai/gpt-4o-mini',         name: 'GPT-4o Mini' },
    { id: 'google/gemini-flash-1.5-8b', name: 'Gemini Flash' },
  ];

  try {
    const results = await Promise.all(MODELS.map(async ({ id, name }) => {
      const response = await fetch(OPENROUTER_URL, {
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
      });

      if (!response.ok) {
        console.error('[ticker-multimodel]', id, 'returnerte', response.status);
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
    console.error('[ticker-multimodel] feil:', error);
    return res.status(500).json({ error: 'Klarte ikke hente andre modellers analyse.' });
  }
};
