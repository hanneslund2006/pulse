const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const { Redis } = require('@upstash/redis');
let redis = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

async function fetchYahoo(ticker) {
  const [quoteData, summaryData] = await Promise.all([
    yf.quote(ticker).catch(() => null),
    yf.quoteSummary(ticker, {
      modules: ['earnings', 'earningsTrend', 'financialData', 'incomeStatementHistoryQuarterly'],
    }).catch(() => ({})),
  ]);

  console.log(`[earnings-play] Yahoo: quote=${!!quoteData}, earnings=${!!summaryData.earnings}, trend=${!!summaryData.earningsTrend}, income=${!!(summaryData.incomeStatementHistoryQuarterly)}`);
  return { quoteData, summaryData };
}

function mapYahooData(ticker, { quoteData, summaryData }) {
  const q = quoteData || {};
  const s = summaryData || {};

  // EPS history from earnings.earningsChart.quarterly — most recent first
  const epsRaw = s.earnings?.earningsChart?.quarterly || [];
  const epsHistory = epsRaw.slice(0, 4).map(e => {
    const actual = e.actual ?? null;
    const estimate = e.estimate ?? null;
    const surprise = e.difference != null ? parseFloat(e.difference) : null;
    // Yahoo surprisePct is a percentage string "1.69" → convert to decimal 0.0169
    const surprisePct = e.surprisePct != null ? parseFloat(e.surprisePct) / 100 : null;
    const quarter = e.periodEndDate
      ? new Date(e.periodEndDate * 1000).toISOString().slice(0, 10)
      : (e.date ?? null);
    return { quarter, actual, estimate, surprise, surprisePct };
  });

  // Revenue trend — oldest first from Yahoo, keep as-is (most recent first)
  const incomeRaw = s.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
  const revenueTrend = incomeRaw.slice(0, 6).map(i => ({
    date: i.endDate ? new Date(i.endDate).toISOString().slice(0, 10) : null,
    revenue: i.totalRevenue ?? null,
    netIncome: i.netIncome ?? null,
  }));

  // Estimates from earningsTrend (current quarter = trend[0] with period "0q")
  const trend0 = s.earningsTrend?.trend?.find(t => t.period === '0q') || s.earningsTrend?.trend?.[0] || {};
  const forwardEPS = trend0.earningsEstimate?.avg ?? null;
  const forwardRevenue = trend0.revenueEstimate?.avg ?? null;
  const analystCount = trend0.earningsEstimate?.numberOfAnalysts ?? null;

  // earningsDate from quote.earningsTimestamp
  let earningsDate = null;
  if (q.earningsTimestamp) {
    try {
      const d = new Date(q.earningsTimestamp);
      const normalized = d.toISOString().split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized) && !isNaN(d.getTime())) {
        earningsDate = normalized;
      } else {
        console.warn('[earnings-play] Invalid earningsTimestamp (format):', q.earningsTimestamp);
      }
    } catch (e) {
      console.error('[earnings-play] Invalid earningsTimestamp (parse error):', q.earningsTimestamp, e.message);
    }
  }

  // Analyst sentiment from financialData
  const fd = s.financialData || {};
  const targetPrice = fd.targetMeanPrice ?? null;
  const consensus = fd.recommendationKey ?? null;
  const currentPrice = q.regularMarketPrice ?? null;

  return {
    ticker,
    currentPrice,
    keyStats: {
      shortFloat: null,
      forwardPE: q.forwardPE ?? null,
      insiderOwnership: null,
      floatShares: q.sharesOutstanding ?? null,
    },
    epsHistory,
    estimates: {
      forwardEPS,
      forwardRevenue,
      analystCount,
      epsTrendCurrent: null,
      epsTrend7d: null,
      epsTrend30d: null,
      earningsDate,
    },
    revenueTrend,
    analystSentiment: {
      consensus,
      targetPrice,
      currentPrice,
      recentChanges: [],
    },
  };
}

async function claudeInterpret(ticker, mapped) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `Financial analyst. Given structured earnings data for ${ticker}, return ONLY valid JSON: {"interpretation":"2-3 sentences on earnings outlook","impliedMove":number_or_null}. impliedMove = estimated ±% move at earnings based on historical EPS surprise magnitude. Use null if insufficient data.`;

  const payload = JSON.stringify({
    epsHistory: mapped.epsHistory,
    forwardEPS: mapped.estimates.forwardEPS,
    analystCount: mapped.estimates.analystCount,
    targetPrice: mapped.analystSentiment.targetPrice,
    currentPrice: mapped.currentPrice,
  });

  try {
    console.log('[earnings-play] Claude kall starter');
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: payload }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return { interpretation: null, impliedMove: null };
    return JSON.parse(text.substring(firstBrace, lastBrace + 1));
  } catch (e) {
    console.error('[earnings-play] claudeInterpret failed:', e.message);
    return { interpretation: null, impliedMove: null };
  }
}

async function fetchAndCache(ticker, cacheKey) {
  const raw = await fetchYahoo(ticker);
  const mapped = mapYahooData(ticker, raw);
  const ai = await claudeInterpret(ticker, mapped);
  console.log('[earnings-play] Claude response:', JSON.stringify(ai));

  const safe = {
    ...mapped,
    interpretation: ai.interpretation ?? null,
    impliedMove: ai.impliedMove != null ? { percent: ai.impliedMove } : null,
  };

  const shouldCache = safe.estimates.earningsDate === null ||
                     (typeof safe.estimates.earningsDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(safe.estimates.earningsDate));

  if (shouldCache) {
    cache.set(cacheKey, safe, 60 * 60 * 6);
    console.log(`[earnings-play] Cached: ${cacheKey} (earningsDate: ${safe.estimates.earningsDate || 'none'})`);
  } else {
    console.warn(`[earnings-play] Skipping cache: invalid earningsDate format`);
  }

  return safe;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker || !/^[A-Z0-9.]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'Missing or invalid ticker parameter' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing.' });
  }

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:earnings-play:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  const today = new Date().toISOString().slice(0, 10);
  const CACHE_KEY = `earnings:${ticker}:${today}`;
  const cached = await cache.get(CACHE_KEY);
  if (cached) {
    const earningsDate = cached.estimates?.earningsDate;

    if (earningsDate && earningsDate <= today) {
      console.log(`[earnings-play] STALE: ${ticker} earnings date ${earningsDate} has passed — invalidating cache`);

      const lockKey = `earnings:lock:${ticker}`;
      let lockAcquired = false;

      if (redis) {
        try {
          lockAcquired = await redis.set(lockKey, '1', { ex: 10, nx: true });
          if (!lockAcquired) {
            console.log(`[earnings-play] LOCK: ${ticker} refresh already in progress — serving stale data`);
            return res.status(200).json(cached);
          }
        } catch (e) {
          console.error('[earnings-play] Lock acquire failed:', e.message);
        }
      }

      if (redis) {
        try {
          await redis.del(`pulse:${CACHE_KEY}`);
          console.log(`[earnings-play] Deleted stale cache: ${CACHE_KEY}`);
        } catch (e) {
          console.error('[earnings-play] Cache delete failed:', e.message);
        }
      }

      try {
        const result = await fetchAndCache(ticker, CACHE_KEY);
        return res.status(200).json(result);
      } finally {
        if (redis && lockAcquired) {
          redis.del(lockKey).catch(() => {});
        }
      }
    } else {
      console.log(`[earnings-play] CACHE HIT: ${ticker}:${today}`);
      return res.status(200).json(cached);
    }
  }
  console.log(`[earnings-play] CACHE MISS: ${ticker}:${today} — fetching Yahoo Finance`);

  try {
    const result = await fetchAndCache(ticker, CACHE_KEY);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[earnings-play] API error:', error.status, error.message, error);
    const message = error.status === 401
      ? 'Invalid API key.'
      : error.status === 429
        ? 'Too many requests. Wait a bit and try again.'
        : 'Failed to analyze earnings. Try again.';
    return res.status(500).json({ error: message });
  }
};
