// Yahoo Finance proxy — no API key required
// Always use query1 (not query2) and set User-Agent

const { fetchWithRetry } = require('./_fetch');
const cache = require('./_cache');

const DISPLAY_MAP = {
  '^GSPC'   : 'SPX',
  '^NDX'    : 'NDX',
  '^DJI'    : 'DJIA',
  '^RUT'    : 'RUT',
  '^VIX'    : 'VIX',
  'DX-Y.NYB': 'DXY',
  'GC=F'    : 'GOLD',
  'BTC-USD' : 'BTC',
  '^TNX'    : '10Y',
};

const NAME_MAP = {
  '^GSPC'   : 'S&P 500',
  '^NDX'    : 'Nasdaq 100',
  '^DJI'    : 'Dow Jones',
  '^RUT'    : 'Russell 2000',
  '^VIX'    : 'VIX',
  'DX-Y.NYB': 'Dollar Index',
  'GC=F'    : 'Gold',
  'BTC-USD' : 'Bitcoin',
  '^TNX'    : '10Y Treasury',
};


async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  // 8s timeout stays under the 10s function maxDuration so the handler returns
  // a structured response before the platform kills the function.
  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PULSE/1.0)' },
  }, 8000, 1);
  if (!res.ok) return null;
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const price = meta.regularMarketPrice ?? meta.previousClose ?? 0;
  const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = price - prev;
  const changePercent = prev !== 0 ? (change / prev) * 100 : 0;

  // Format updatedAt as HH:MM in US Eastern
  const updatedAt = new Date(meta.regularMarketTime * 1000)
    .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York', hour12: false });

  return {
    symbol,
    displaySymbol : DISPLAY_MAP[symbol] || symbol,
    name          : NAME_MAP[symbol] || meta.shortName || symbol,
    price,
    change        : parseFloat(change.toFixed(2)),
    changePercent : parseFloat(changePercent.toFixed(2)),
    updatedAt,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = (req.query.symbols || '').trim();
  if (!raw) return res.status(400).json({ error: 'symbols param required' });

  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (symbols.length === 0) return res.status(400).json({ error: 'No valid symbols' });
  if (symbols.length > 20) return res.status(400).json({ error: 'Max 20 symbols' });

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:quotes:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  try {
    const results = await Promise.all(
      symbols.map(async sym => {
        const fresh = await fetchQuote(sym).catch(() => null);
        if (fresh) {
          cache.setStaleOnly('quote:' + sym, fresh); // refresh last-good (no happy-path cache read)
          return fresh;
        }
        // Live fetch failed: serve last-good snapshot so the rail degrades instead of blanking.
        const stale = await cache.getStale('quote:' + sym);
        return stale ? { ...stale, stale: true } : null;
      })
    );
    const data = results.filter(Boolean);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Quotes API error:', error);
    return res.status(500).json({ error: 'Failed to fetch quote data.' });
  }
};
