const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const { validateTicker } = require('./_validate');
const cache = require('./_cache');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const SYSTEM_PROMPT = `Ticker analysis. Search 5 layers: Nyheter, Earnings, Insider, Short Float, Sentiment. Return JSON only:
{"ticker":"string","company":"string","found":true,"layers":[{"name":"Nyheter","sentiment":"Bullish","summary":"string"},{"name":"Earnings","sentiment":"Nøytral","summary":"string"},{"name":"Insider","sentiment":"Bearish","summary":"string"},{"name":"Short Float","sentiment":"Nøytral","summary":"string"},{"name":"Sentiment","sentiment":"Bullish","summary":"string"}]}

If not found: {"ticker":"XYZ","company":"","found":false}. sentiment: "Bullish"/"Bearish"/"Nøytral". summary: max 1 sentence, 20 words. Always 5 layers in order.`;

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
    console.error('[ticker] fetchTechnicals feil:', e.message);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API-nøkkel mangler.' });
  }

  try {
    var ticker = validateTicker(req.body?.ticker);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

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
        content: `Søk etter informasjon om aksjen ${ticker} og returner analysen som JSON.`
      }
    ];

    const [response, technical] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
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
      return res.status(500).json({ error: 'Fikk ikke svar fra AI. Prøv igjen.' });
    }

    const firstBrace = finalText.indexOf('{');
    const lastBrace = finalText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[ticker] Ingen JSON funnet');
      return res.status(500).json({ error: 'Parsing feilet' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[ticker] JSON.parse feilet:', e.message);
      return res.status(500).json({ error: 'JSON parse feilet' });
    }

    if (technical) parsed.technical = technical;
    cache.set(`ticker_${ticker}`, parsed, 60 * 60 * 24);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Ticker API feil:', error);
    const message = error.status === 401
      ? 'Ugyldig API-nøkkel.'
      : error.status === 429
        ? 'For mange forespørsler. Vent litt og prøv igjen.'
        : 'Klarte ikke hente ticker-data. Prøv igjen.';
    return res.status(500).json({ error: message });
  }
};
