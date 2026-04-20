// Yahoo Finance proxy — no API key required
// Always use query1 (not query2) and set User-Agent

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

// Module-level 60s cache
let _cache = null;
let _cacheKey = '';
let _cachedAt = 0;

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PULSE/1.0)' },
  });
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

  // Cache hit (same symbol set, within 60s)
  const cacheKey = symbols.slice().sort().join(',');
  if (_cache && _cacheKey === cacheKey && Date.now() - _cachedAt < 60_000) {
    return res.status(200).json(_cache);
  }

  try {
    const results = await Promise.all(
      symbols.map(sym => fetchQuote(sym).catch(() => null))
    );
    const data = results.filter(Boolean);

    _cache = data;
    _cacheKey = cacheKey;
    _cachedAt = Date.now();

    return res.status(200).json(data);
  } catch (error) {
    console.error('Quotes API feil:', error);
    return res.status(500).json({ error: 'Klarte ikke hente kursdata.' });
  }
};
