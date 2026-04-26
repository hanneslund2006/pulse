const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');

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

  // ── Per-sektor Haiku-analyse ──────────────────────────────
  if (req.query.ticker) {
    if (!process.env.ANTHROPIC_API_KEY)
      return res.status(500).json({ error: 'API-nøkkel mangler.' });

    const rl = rateCheck(req);
    if (rl) return res.status(429).json({ error: `Prøv igjen om ${rl.waitMinutes} minutt(er).` });

    const ticker = (req.query.ticker || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const navn   = (req.query.navn   || ticker).slice(0, 40);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: 'Du er en kortfattet handels-orientert analytiker. Svar alltid på norsk. Maks 4 korte setninger. Ingen markdown, ingen liste-symboler.',
        messages: [{
          role: 'user',
          content: `Analyser ${ticker} (${navn}) SPDR-sektoren akkurat nå: 1) Hva driver sektoren, 2) Viktigste katalysator for og mot, 3) 1-2 konkrete aksjer å følge. Eksempel-stil: "XLK drevet av AI-vekst. Katalysator: Fed-pivot og sterk big tech. Risiko: høy P/E. Følg: NVDA, MSFT."`
        }]
      });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      return res.status(200).json({ analyse: text });
    } catch (e) {
      console.error('[sektor] Haiku feil:', e.message);
      return res.status(500).json({ error: 'Klarte ikke hente analyse. Prøv igjen.' });
    }
  }

  // ── Sektor-liste (Yahoo Finance) ──────────────────────────
  try {
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
  } catch (error) {
    console.error('Sektor API feil:', error);
    return res.status(500).json({ error: 'Klarte ikke hente sektordata.' });
  }
};
