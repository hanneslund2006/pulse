const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

const SYSTEM_PROMPT = `Return JSON only:
{
  "case_summary": "string (restate investment case in max 10 words)",
  "stocks": [
    {
      "ticker": "string (e.g. AAPL)",
      "company": "string (full company name)",
      "description": "string (what company does, max 15 words)",
      "why_it_fits": "string (why it matches the case, max 20 words)",
      "sentiment": "Bullish | Bearish | Neutral"
    }
  ]
}
Return 3-7 US-listed stocks only. No markdown, no preamble. Be analytical and specific.`;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key missing' });

  const raw = (req.query.case || '').trim();
  if (!raw) return res.status(400).json({ error: 'Missing required parameter: case' });
  if (raw.length > 200) return res.status(400).json({ error: 'Investment case must be 200 characters or fewer' });

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  const normalizedCase = raw.toLowerCase().replace(/\s+/g, ' ');
  const CACHE_KEY = `screener:${normalizedCase}`;
  const cached = await cache.get(CACHE_KEY);
  if (cached) {
    console.log('[screener] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[screener] CACHE MISS — calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: `Find US stocks matching this investment case: ${raw}` }],
    });

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    if (!finalText) return res.status(500).json({ error: 'No response from AI.' });

    const firstBrace = finalText.indexOf('{');
    const lastBrace = finalText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[screener] No JSON found in response');
      return res.status(500).json({ error: 'Parsing failed' });
    }

    let parsed;
    try {
      parsed = JSON.parse(finalText.substring(firstBrace, lastBrace + 1));
    } catch (e) {
      console.error('[screener] JSON.parse failed:', e.message);
      return res.status(500).json({ error: 'JSON parse failed' });
    }

    if (!Array.isArray(parsed.stocks)) {
      console.error('[screener] Missing stocks array');
      return res.status(500).json({ error: 'AI returned invalid format.' });
    }

    const valid = parsed.stocks.filter(s => s.ticker && s.company && s.why_it_fits);
    if (!valid.length) {
      console.error('[screener] No valid stocks in response');
      return res.status(500).json({ error: 'AI returned no valid candidates.' });
    }

    const result = { case_summary: parsed.case_summary || raw, stocks: valid };
    cache.set(CACHE_KEY, result, 300);
    return res.status(200).json(result);

  } catch (error) {
    console.error('[screener] API error:', error);
    const msg = error.status === 429 ? 'Too many requests. Wait a bit.' : 'Failed to run screener.';
    return res.status(500).json({ error: msg });
  }
};
