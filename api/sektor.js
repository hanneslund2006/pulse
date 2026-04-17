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
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PULSE/1.0)' },
  });
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
};
