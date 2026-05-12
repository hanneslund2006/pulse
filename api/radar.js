const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

const SYSTEM_PROMPT = `Search US stocks meeting ALL criteria:
1. High short interest (>15% short float)
2. Positive price momentum (last week)
3. Recent positive catalyst (news/earnings/upgrade)

Prioritize stocks above 200-day SMA. Return JSON only:
[{"ticker":"TSLA","direction":"Bullish","reason":"20-word max rationale"}]

Return 3-5 candidates. direction: exactly "Bullish" or "Bearish". reason: max 20 words, include specific catalyst + technical setup. Be analytical and specific. No markdown.`;


module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key missing' });

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:radar:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  const today = new Date().toISOString().slice(0, 10);
  const CACHE_KEY = 'radar:' + today;
  const cached = await cache.get(CACHE_KEY);
  if (cached) {
    console.log('[radar] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[radar] CACHE MISS — calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      messages: [{ role: 'user', content: 'Find the best swing trading candidates right now based on high short float, positive momentum and catalyst. Return JSON array.' }],
    });

    const finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!finalText) return res.status(500).json({ error: 'No response from AI.' });

    const firstBrace = finalText.indexOf('[');
    const lastBrace = finalText.lastIndexOf(']');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[radar] No JSON found');
      return res.status(500).json({ error: 'Parsing failed' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[radar] JSON.parse failed:', e.message);
      return res.status(500).json({ error: 'JSON parse failed' });
    }
    if (!Array.isArray(parsed)) {
      console.error('[radar] Not valid array');
      return res.status(500).json({ error: 'AI returned invalid format.' });
    }

    const valid = parsed.filter(item => item.ticker && item.direction && item.reason);
    if (!valid.length) {
      console.error('[radar] No valid items in array');
      return res.status(500).json({ error: 'AI returned no valid candidates.' });
    }

    cache.set(CACHE_KEY, valid, cache.nextMidnightTTL());
    return res.status(200).json(valid);

  } catch (error) {
    console.error('[radar] API error:', error);
    const msg = error.status === 429 ? 'Too many requests. Wait a bit.' : 'Failed to run radar.';
    return res.status(500).json({ error: msg });
  }
};
