const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

const SYSTEM_PROMPT = `Search today's market news. Return JSON only:
{"verdict":"string (max 15 words)","score":0-100,"keydata":[{"label":"string","value":"string"}],"categories":[{"name":"MACRO","sentiment":"Bullish","summary":"string"},{"name":"ENERGY","sentiment":"Bearish","summary":"string"},{"name":"FINANCIALS","sentiment":"Mixed","summary":"string"},{"name":"TECH","sentiment":"Neutral","summary":"string"}]}

keydata: S&P 500, Nasdaq Futures, VIX, US 10Y yield (exact order). sentiment: "Bullish"/"Bearish"/"Mixed"/"Neutral". summary: max 2 sentences, 40 words, no *, #, bullets.`;


module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key missing. Set ANTHROPIC_API_KEY in environment variables.' });
  }

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:sentiment:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  const today = new Date().toISOString().slice(0, 10);
  const CACHE_KEY = 'sentiment:' + today;
  const cached = await cache.get(CACHE_KEY);
  if (cached) {
    console.log('[sentiment] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[sentiment] CACHE MISS — calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: 'Search for today\'s market news and return the sentiment report as JSON.'
      }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages
    });

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!finalText) {
      return res.status(500).json({ error: 'Got no response from AI. Try again.' });
    }

    const firstBrace = finalText.indexOf('{');
    const lastBrace = finalText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[sentiment] No JSON found');
      return res.status(500).json({ error: 'Parsing failed' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[sentiment] JSON.parse failed:', e.message);
      return res.status(500).json({ error: 'JSON parse failed' });
    }

    if (!parsed.verdict || !Array.isArray(parsed.categories) || parsed.categories.length === 0) {
      console.error('[sentiment] Parsed JSON missing required fields:', JSON.stringify(parsed).slice(0, 200));
      return res.status(500).json({ error: 'AI returned incomplete report. Try again.' });
    }

    cache.set(CACHE_KEY, parsed, cache.nextMidnightTTL());
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Anthropic API error:', error);

    const message = error.status === 401
      ? 'Invalid API key.'
      : error.status === 429
        ? 'Too many requests. Wait a bit and try again.'
        : error.status === 529
          ? 'Anthropic is overloaded right now. Try again in 30 seconds.'
          : 'Failed to fetch sentiment. Try again.';

    return res.status(500).json({ error: message });
  }
};
