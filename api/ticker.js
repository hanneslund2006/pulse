const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const { validateTicker } = require('./_validate');
const cache = require('./_cache');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const SYSTEM_PROMPT = `Return JSON only:
{
  "ticker": "string",
  "company": "string",
  "found": true,
  "layers": [
    {"name": "News", "sentiment": "Bullish", "summary": "string"},
    {"name": "Earnings", "sentiment": "Neutral", "summary": "string"},
    {"name": "Insider", "sentiment": "Bearish", "summary": "string"},
    {"name": "Short Float", "sentiment": "Neutral", "summary": "string"},
    {"name": "Sentiment", "sentiment": "Bullish", "summary": "string"}
  ]
}

Search each layer independently. Be analytical and specific. No filler phrases. sentiment: exactly "Bullish", "Bearish", or "Neutral". summary: max 20 words, focus on actionable price catalyst. If ticker not found: {"ticker":"X","company":"","found":false}. No markdown.`;

function timeoutPromise(ms, message) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  );
}

async function fetchTechnicals(ticker) {
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
    const currentPrice = closes[closes.length - 1];
    const smaData = closes.length >= 200 ? closes.slice(-200) : closes;
    const sma200 = smaData.reduce((a, b) => a + b, 0) / smaData.length;
    const k = 2 / 9;
    let ema8 = closes[0];
    for (let i = 1; i < closes.length; i++) ema8 = closes[i] * k + ema8 * (1 - k);
    const recent = closes.slice(-60);
    const swingHighs = [], swingLows = [];
    for (let i = 1; i < recent.length - 1; i++) {
      if (recent[i] > recent[i - 1] && recent[i] > recent[i + 1]) swingHighs.push(recent[i]);
      if (recent[i] < recent[i - 1] && recent[i] < recent[i + 1]) swingLows.push(recent[i]);
    }
    const h = swingHighs.slice(-4), l = swingLows.slice(-4);
    let trend = 'Mixed';
    if (h.length >= 2 && l.length >= 2) {
      if (h.every((v, i) => i === 0 || v > h[i - 1]) && l.every((v, i) => i === 0 || v > l[i - 1])) trend = 'Bullish';
      else if (h.every((v, i) => i === 0 || v < h[i - 1]) && l.every((v, i) => i === 0 || v < l[i - 1])) trend = 'Bearish';
    }
    return {
      sma200: parseFloat(sma200.toFixed(2)),
      ema8: parseFloat(ema8.toFixed(2)),
      trend,
      above200sma: currentPrice > sma200,
      priceVsSma200pct: parseFloat(((currentPrice - sma200) / sma200 * 100).toFixed(2)),
    };
  } catch (e) {
    console.error('[ticker] fetchTechnicals error:', e.message);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key missing.' });
  }

  try {
    var ticker = validateTicker(req.body?.ticker);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:ticker:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  const cached = await cache.get(`ticker_${ticker}`);
  if (cached) {
    console.log(`[ticker] CACHE HIT: ${ticker}`);
    return res.status(200).json(cached);
  }
  console.log(`[ticker] CACHE MISS: ${ticker} — calling Claude`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: `Search for information about the stock ${ticker} and return the analysis as JSON.`
      }
    ];

    const [response, technical] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
        messages,
      }),
      fetchTechnicals(ticker),
    ]);

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
      console.error('[ticker] No JSON found');
      return res.status(500).json({ error: 'Parsing failed' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[ticker] JSON.parse failed:', e.message);
      return res.status(500).json({ error: 'JSON parse failed' });
    }

    if (technical) parsed.technical = technical;
    cache.set(`ticker_${ticker}`, parsed, 60 * 60 * 24);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Ticker API error:', error);
    const message = error.status === 401
      ? 'Invalid API key.'
      : error.status === 429
        ? 'Too many requests. Wait a bit and try again.'
        : 'Failed to fetch ticker data. Try again.';
    return res.status(500).json({ error: message });
  }
};
