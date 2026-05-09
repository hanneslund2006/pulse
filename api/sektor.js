const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const { validateTicker } = require('./_validate');
const { fetchWithTimeout } = require('./_fetch');
const cache = require('./_cache');

const SECTORS = [
  { symbol: 'XLK',  name: 'Technology' },
  { symbol: 'XLF',  name: 'Financials' },
  { symbol: 'XLE',  name: 'Energy' },
  { symbol: 'XLV',  name: 'Health Care' },
  { symbol: 'XLI',  name: 'Industrials' },
  { symbol: 'XLY',  name: 'Consumer Discret.' },
  { symbol: 'XLP',  name: 'Consumer Staples' },
  { symbol: 'XLU',  name: 'Utilities' },
  { symbol: 'XLRE', name: 'Real Estate' },
  { symbol: 'XLB',  name: 'Materials' },
  { symbol: 'XLC',  name: 'Communication' },
];

async function fetchWeeklyChange(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PULSE/1.0)' },
  }, 30000);
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
  if (closes.length < 2) return null;

  const first = closes[0];
  const last  = closes[closes.length - 1];
  const weeklyChange = ((last - first) / first) * 100;
  const price = result.meta?.regularMarketPrice ?? last;

  return {
    symbol,
    price:        parseFloat(price.toFixed(2)),
    weeklyChange: parseFloat(weeklyChange.toFixed(2)),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Per-sektor Haiku-analyse ──────────────────────────────
  if (req.query.ticker) {
    if (!process.env.ANTHROPIC_API_KEY)
      return res.status(500).json({ error: 'API key missing.' });

    const rl = await rateCheck(req);
    if (rl) return res.status(429).json({ error: `Try again in ${rl.waitMinutes} minute(s).` });

    let ticker;
    try {
      ticker = validateTicker(req.query.ticker);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const navn = (req.query.navn || ticker).slice(0, 40);

    // Analytics tracking (must never crash endpoint)
    try {
      const today = new Date().toISOString().slice(0, 10);
      const analyticsKey = `analytics:sektor:${today}`;
      const currentCount = await cache.get(analyticsKey) || 0;
      cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
    } catch (e) { /* analytics must never crash endpoint */ }

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `sektor:${ticker}:${today}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log(`[sektor] CACHE HIT: ${ticker}:${today}`);
      return res.status(200).json(cached);
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: 'You are a concise trading-oriented analyst. Always answer in English. Max 4 short sentences. No markdown, no bullet points.',
        messages: [{
          role: 'user',
          content: `Analyze ${ticker} (${navn}) SPDR sector right now: 1) What drives the sector, 2) Most important catalyst for and against, 3) 1-2 specific stocks to follow. Example style: "XLK driven by AI growth. Catalyst: Fed pivot and strong big tech. Risk: high P/E. Follow: NVDA, MSFT."`
        }]
      });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      const result = { analysis: text };
      cache.set(cacheKey, result, 24 * 3600);
      return res.status(200).json(result);
    } catch (e) {
      console.error('[sektor] Haiku error:', e.message);
      return res.status(500).json({ error: 'Failed to fetch analysis. Try again.' });
    }
  }

  // ── Sektor-liste (Yahoo Finance) ──────────────────────────
  try {
    const results = await Promise.all(
      SECTORS.map(async s => {
        const data = await fetchWeeklyChange(s.symbol).catch(() => null);
        if (!data) return null;
        return { ...s, ...data };
      })
    );

    const sectors = results
      .filter(Boolean)
      .sort((a, b) => b.weeklyChange - a.weeklyChange);

    return res.status(200).json(sectors);
  } catch (error) {
    console.error('Sektor API error:', error);
    return res.status(500).json({ error: 'Failed to fetch sector data.' });
  }
};
