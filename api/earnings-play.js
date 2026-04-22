const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

async function fetchFMP(ticker) {
  const k = process.env.FMP_API_KEY;
  const b = 'https://financialmodelingprep.com/api/v3';
  const safe = url => fetch(url).then(r => r.ok ? r.json() : []).catch(() => []);

  const [surprises, income, quote] = await Promise.all([
    safe(`${b}/earnings-surprises/${ticker}?apikey=${k}`),
    safe(`${b}/income-statement/${ticker}?period=quarter&limit=6&apikey=${k}`),
    safe(`${b}/quote/${ticker}?apikey=${k}`),
  ]);

  console.log(`[earnings-play] FMP: surprises=${surprises.length}, income=${income.length}, quote=${quote.length}`);
  return { surprises, income, quote };
}

function mapFMPData(ticker, fmp) {
  const { surprises, income, quote } = fmp;

  const q = Array.isArray(quote) && quote.length > 0 ? quote[0] : null;

  const epsHistory = (Array.isArray(surprises) ? surprises : []).slice(0, 4).map(e => {
    const actual = e.actualEarningResult ?? null;
    const estimate = e.estimatedEarning ?? null;
    const surprise = (actual !== null && estimate !== null) ? actual - estimate : null;
    const surprisePct = (surprise !== null && estimate !== null && estimate !== 0) ? surprise / Math.abs(estimate) : null;
    return { quarter: e.date ?? null, actual, estimate, surprise, surprisePct };
  });

  const revenueTrend = (Array.isArray(income) ? income : []).slice(0, 6).map(s => ({
    date: s.date ?? null,
    revenue: s.revenue ?? null,
    netIncome: s.netIncome ?? null,
  }));

  const earningsDate = q?.earningsAnnouncement ? String(q.earningsAnnouncement).slice(0, 10) : null;

  return {
    ticker,
    currentPrice: q?.price ?? null,
    keyStats: {
      shortFloat: null,
      forwardPE: q?.pe ?? null,
      insiderOwnership: null,
      floatShares: q?.sharesOutstanding ?? null,
    },
    epsHistory,
    estimates: { earningsDate },
    revenueTrend,
  };
}

async function claudeInterpret(ticker, mapped) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `Financial analyst. Given structured earnings data for ${ticker}, return ONLY valid JSON: {"interpretation":"2-3 sentences on earnings outlook","impliedMove":number_or_null}. impliedMove = estimated ±% move at earnings based on historical EPS surprise magnitude. Use null if insufficient data.`;

  const payload = JSON.stringify({
    epsHistory: mapped.epsHistory,
    currentPrice: mapped.currentPrice,
    revenueTrend: mapped.revenueTrend.slice(0, 3),
  });

  try {
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
  if (!process.env.FMP_API_KEY) {
    return res.status(500).json({ error: 'FMP_API_KEY mangler.' });
  }

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const cached = await cache.get(`earnings_play_${ticker}`);
  if (cached) {
    console.log(`[earnings-play] CACHE HIT: ${ticker}`);
    return res.status(200).json(cached);
  }
  console.log(`[earnings-play] CACHE MISS: ${ticker} — fetching FMP`);

  try {
    const fmpRaw = await fetchFMP(ticker);
    const mapped = mapFMPData(ticker, fmpRaw);
    const ai = await claudeInterpret(ticker, mapped);

    const safe = {
      ...mapped,
      interpretation: ai.interpretation ?? null,
      impliedMove: ai.impliedMove != null ? { percent: ai.impliedMove } : null,
    };

    cache.set(`earnings_play_${ticker}`, safe, 12 * 3600);
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
