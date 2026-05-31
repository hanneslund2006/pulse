const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const { callClaudeWithRetry } = require('./_fetch');
const cache = require('./_cache');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(mon), end: fmt(fri) };
}

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
  return null;
}

async function enrichEarnings(company) {
  try {
    const [summary, quote] = await Promise.all([
      yf.quoteSummary(company.ticker, { modules: ['earningsTrend'] }).catch(() => null),
      yf.quote(company.ticker).catch(() => null),
    ]);

    let epsEstimate = company.epsEstimate;
    let date = company.date;
    let epsFromYahoo = false;
    let dateFromYahoo = false;

    const avg = summary?.earningsTrend?.trend?.find(t => t.period === '0q')?.earningsEstimate?.avg;
    if (typeof avg === 'number') {
      epsEstimate = avg.toFixed(2);
      epsFromYahoo = true;
    }

    if (quote?.earningsTimestamp) {
      try {
        const d = new Date(quote.earningsTimestamp);
        if (!isNaN(d.getTime())) {
          const normalized = d.toISOString().split('T')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            date = normalized;
            dateFromYahoo = true;
          }
        }
      } catch (_) { /* keep LLM date */ }
    }

    return {
      ...company,
      epsEstimate,
      date,
      source: (epsFromYahoo && dateFromYahoo) ? 'yahoo' : 'llm',
    };
  } catch (_) {
    return { ...company, source: 'llm' };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key missing.' });
  }

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  // Parse watchlist from query param
  const watchlistParam = req.query.watchlist || '';
  const watchlist = watchlistParam
    ? watchlistParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : [];

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:earnings:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `earnings_v1_${today}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log('[earnings] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[earnings] CACHE MISS — calling Claude');

  const { start, end } = getWeekRange();

  const SYSTEM = `You are a financial analyst. Search for earnings reports for the current week (${start} to ${end}).

Return ONLY a valid JSON array. No preamble, no markdown, just the array object.

Exact structure:
[
  {
    "ticker": "AAPL",
    "company": "Apple Inc.",
    "date": "2026-04-17",
    "time": "after hours",
    "epsEstimate": "1.62"
  }
]

Rules:
- "time" is exactly one of: "before market", "after hours", "unknown"
- "date" is ISO format YYYY-MM-DD
- "epsEstimate" is consensus estimate as string, e.g. "1.62" or "N/A"
- Max 8 companies in array
- Answer ONLY with the JSON array, nothing else`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: `Search for which companies are reporting earnings this week (${start}–${end}). Return the 5-8 most market-relevant companies reporting (large cap, high trading volume).`
      }
    ];

    const response = await callClaudeWithRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages,
    }));

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!finalText) return res.status(500).json({ error: 'No response from AI.' });

    console.error('[earnings] Claude raw text:', finalText);
    const parsed = extractJSON(finalText);
    if (!Array.isArray(parsed)) {
      console.error('Earnings JSON error. Raw text:', finalText);
      return res.status(500).json({ error: 'Invalid format from AI.' });
    }

    const enriched = await Promise.all(parsed.map(enrichEarnings));

    cache.setWithStale(cacheKey, enriched, 60 * 60 * 6);
    return res.status(200).json(enriched);

  } catch (err) {
    console.error('Earnings API error:', err);
    const stale = await cache.getStale(cacheKey);
    if (stale) return res.status(200).json(stale.map(e => ({ ...e, stale: true })));
    const msg = err.status === 401 ? 'Invalid API key.'
      : err.status === 429 ? 'Too many requests. Wait a bit.'
      : 'Failed to fetch earnings data.';
    return res.status(500).json({ error: msg });
  }
};
