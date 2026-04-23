const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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
  const earningsDate = q.earningsTimestamp
    ? new Date(q.earningsTimestamp).toISOString().slice(0, 10)
    : null;

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
      model: 'claude-sonnet-4-6',
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
    console.error('[earnings-play] claudeInterpret feilet:', e.message);
    return { interpretation: null, impliedMove: null };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker || !/^[A-Z0-9.]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'Mangler eller ugyldig ticker-parameter' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler.' });
  }

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const cached = await cache.get(`earnings_play3_${ticker}`);
  if (cached) {
    console.log(`[earnings-play] CACHE HIT: ${ticker}`);
    return res.status(200).json(cached);
  }
  console.log(`[earnings-play] CACHE MISS: ${ticker} — fetching Yahoo Finance`);

  try {
    const raw = await fetchYahoo(ticker);
    const mapped = mapYahooData(ticker, raw);
    const ai = await claudeInterpret(ticker, mapped);
    console.log('[earnings-play] Claude svar:', JSON.stringify(ai));

    const safe = {
      ...mapped,
      interpretation: ai.interpretation ?? null,
      impliedMove: ai.impliedMove != null ? { percent: ai.impliedMove } : null,
    };

    cache.set(`earnings_play3_${ticker}`, safe, 12 * 3600);
    return res.status(200).json(safe);

  } catch (error) {
    console.error('[earnings-play] API feil:', error.status, error.message, error);
    const message = error.status === 401
      ? 'Ugyldig API-nøkkel.'
      : error.status === 429
        ? 'For mange forespørsler. Vent litt og prøv igjen.'
        : 'Klarte ikke analysere earnings. Prøv igjen.';
    return res.status(500).json({ error: message });
  }
};
