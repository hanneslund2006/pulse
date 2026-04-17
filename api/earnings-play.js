const YF_BASE = 'https://query1.finance.yahoo.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; PULSE/1.0)' };

async function fetchQuoteSummary(ticker) {
  const modules = [
    'defaultKeyStatistics',
    'earningsHistory',
    'earningsTrend',
    'financialData',
    'upgradeDowngradeHistory',
    'incomeStatementHistoryQuarterly',
  ].join(',');
  const url = `${YF_BASE}/v10/finance/quoteSummary/${ticker}?modules=${modules}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo quoteSummary ${res.status}`);
  const json = await res.json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error('Ticker ikke funnet');
  return result;
}

async function fetchImpliedMove(ticker, currentPrice) {
  const url = `${YF_BASE}/v7/finance/options/${ticker}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  const opt = json?.optionChain?.result?.[0];
  if (!opt) return null;

  const expiry = opt.expirationDates?.[0];
  const calls = opt.options?.[0]?.calls || [];
  const puts  = opt.options?.[0]?.puts  || [];
  if (!calls.length || !puts.length) return null;

  // Find ATM strike (nearest to current price)
  const strikes = calls.map(c => c.strike).filter(Boolean);
  const atm = strikes.reduce((prev, curr) =>
    Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
  );

  const call = calls.find(c => c.strike === atm);
  const put  = puts.find(p => p.strike === atm);
  if (!call || !put) return null;

  const callMid = ((call.bid ?? 0) + (call.ask ?? 0)) / 2;
  const putMid  = ((put.bid  ?? 0) + (put.ask  ?? 0)) / 2;
  const straddle = callMid + putMid;
  const percent  = currentPrice > 0 ? (straddle / currentPrice) * 100 : 0;

  const expiryDate = expiry
    ? new Date(expiry * 1000).toISOString().slice(0, 10)
    : null;

  return {
    percent:  parseFloat(percent.toFixed(2)),
    straddle: parseFloat(straddle.toFixed(2)),
    expiry:   expiryDate,
    strike:   atm,
  };
}

function parseKeyStats(ks) {
  return {
    shortFloat:       ks?.shortPercentOfFloat?.raw  ?? null,
    forwardPE:        ks?.forwardPE?.raw             ?? null,
    insiderOwnership: ks?.heldPercentInsiders?.raw   ?? null,
    floatShares:      ks?.floatShares?.raw            ?? null,
  };
}

function parseEpsHistory(eh) {
  const items = eh?.history || [];
  return items.slice(0, 4).map(h => ({
    quarter:   h.quarter?.fmt   ?? null,
    actual:    h.epsActual?.raw  ?? null,
    estimate:  h.epsEstimate?.raw ?? null,
    surprise:  h.epsDifference?.raw ?? null,
    surprisePct: h.surprisePercent?.raw ?? null,
  }));
}

function parseEstimates(et) {
  const trend = et?.trend?.[0];
  if (!trend) return {};
  return {
    forwardEPS:        trend.earningsEstimate?.avg?.raw     ?? null,
    forwardRevenue:    trend.revenueEstimate?.avg?.raw      ?? null,
    analystCount:      trend.earningsEstimate?.numberOfAnalysts?.raw ?? null,
    revisionMomentum7d:  trend.earningsEstimate?.growth?.raw ?? null,
    epsTrend7d:        trend.epsTrend?.['7daysAgo']?.raw    ?? null,
    epsTrend30d:       trend.epsTrend?.['30daysAgo']?.raw   ?? null,
    epsTrendCurrent:   trend.epsTrend?.current?.raw         ?? null,
    earningsDate:      et?.trend?.find(t => t.period === '0q')
                         ?.earningsDate?.[0]?.fmt            ?? null,
  };
}

function parseRevenueTrend(ish) {
  const stmts = ish?.incomeStatementHistory || [];
  return stmts.slice(0, 6).map(s => ({
    date:      s.endDate?.fmt      ?? null,
    revenue:   s.totalRevenue?.raw  ?? null,
    netIncome: s.netIncome?.raw      ?? null,
  }));
}

function parseAnalystSentiment(fd, udh) {
  const recentChanges = (udh?.history || []).slice(0, 5).map(h => ({
    firm: h.firm       ?? null,
    from: h.fromGrade  ?? null,
    to:   h.toGrade    ?? null,
    date: h.epochGradeDate
      ? new Date(h.epochGradeDate * 1000).toISOString().slice(0, 10)
      : null,
    action: h.action ?? null,
  }));

  return {
    consensus:   fd?.recommendationKey  ?? null,
    targetPrice: fd?.targetMeanPrice?.raw ?? null,
    currentPrice: fd?.currentPrice?.raw  ?? null,
    recentChanges,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker) return res.status(400).json({ error: 'Mangler ticker-parameter' });

  try {
    const summary = await fetchQuoteSummary(ticker);

    const ks  = summary.defaultKeyStatistics;
    const eh  = summary.earningsHistory;
    const et  = summary.earningsTrend;
    const fd  = summary.financialData;
    const udh = summary.upgradeDowngradeHistory;
    const ish = summary.incomeStatementHistoryQuarterly;

    const currentPrice = fd?.currentPrice?.raw ?? null;
    const impliedMove  = currentPrice
      ? await fetchImpliedMove(ticker, currentPrice).catch(() => null)
      : null;

    const data = {
      ticker,
      currentPrice,
      keyStats:        parseKeyStats(ks),
      epsHistory:      parseEpsHistory(eh),
      estimates:       parseEstimates(et),
      revenueTrend:    parseRevenueTrend(ish),
      analystSentiment: parseAnalystSentiment(fd, udh),
      impliedMove,
    };

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
