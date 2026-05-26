const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function timeoutPromise(ms, message) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  );
}

async function enrichWithSma(ticker) {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 290);

    const historicalPromise = yf.historical(ticker, {
      period1: start.toISOString().slice(0, 10),
      period2: end.toISOString().slice(0, 10),
      interval: '1d',
    });

    const rows = await Promise.race([
      historicalPromise,
      timeoutPromise(30000, 'Yahoo Finance timeout')
    ]);
    const closes = (rows || []).map(r => r.close).filter(c => typeof c === 'number');
    if (closes.length < 10) return null;
    const current = closes[closes.length - 1];
    const smaData = closes.length >= 200 ? closes.slice(-200) : closes;
    const sma200 = smaData.reduce((a, b) => a + b, 0) / smaData.length;
    return current > sma200;
  } catch (_) { return null; }
}

async function fetchPreMarketQuote(ticker) {
  try {
    const quote = await yf.quote(ticker);
    const gap = typeof quote.preMarketChangePercent === 'number'
      ? parseFloat(quote.preMarketChangePercent.toFixed(2))
      : null;
    const price = typeof quote.preMarketPrice === 'number' ? quote.preMarketPrice : null;
    return { gap, price };
  } catch (_) {
    return { gap: null, price: null };
  }
}

const SYSTEM_PROMPT = `Search 5 largest pre-market gap movers (USA). Return JSON only:
[{"ticker":"TSLA","company":"Tesla Inc","gap":5.2,"volume":"1.2M"}]

Return exactly 5 stocks. gap: % change from yesterday close to pre-market (positive=up, negative=down). Sort by largest absolute gap. Mix up/down allowed. volume: format "1.2M" or "450K". Be analytical and specific in stock selection. No markdown, no preamble.`;


module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key missing' });

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:gappers:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  const cached = await cache.get('gappers_v1');
  if (cached) {
    console.log('[gappers] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[gappers] CACHE MISS — calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [{ role: 'user', content: 'Find the 5 largest pre-market gap movers on US exchanges today. Return JSON array.' }];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 280,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      messages,
    });

    const finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!finalText) return res.status(500).json({ error: 'No response from AI.' });

    const firstBrace = finalText.indexOf('[');
    const lastBrace = finalText.lastIndexOf(']');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[gappers] No JSON found');
      return res.status(500).json({ error: 'Parsing failed' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[gappers] JSON.parse failed:', e.message);
      return res.status(500).json({ error: 'JSON parse failed' });
    }
    if (!Array.isArray(parsed)) {
      console.error('[gappers] Not valid array');
      return res.status(500).json({ error: 'AI returned invalid format.' });
    }

    const enriched = await Promise.all(
      parsed.map(async g => {
        const [above200sma, preMarket] = await Promise.all([
          enrichWithSma(g.ticker).catch(() => null),
          fetchPreMarketQuote(g.ticker),
        ]);
        return {
          ...g,
          above200sma,
          gap: preMarket.gap,
          preMarketPrice: preMarket.price,
        };
      })
    );

    cache.set('gappers_v1', enriched, 60 * 30);
    return res.status(200).json(enriched);

  } catch (error) {
    console.error('[gappers] API error:', error);
    const msg = error.status === 429 ? 'Too many requests. Wait a bit.' : 'Failed to fetch gappers.';
    return res.status(500).json({ error: msg });
  }
};
