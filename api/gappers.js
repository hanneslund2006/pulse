const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function enrichWithSma(ticker) {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 290);
    const rows = await yf.historical(ticker, {
      period1: start.toISOString().slice(0, 10),
      period2: end.toISOString().slice(0, 10),
      interval: '1d',
    });
    const closes = (rows || []).map(r => r.close).filter(c => typeof c === 'number');
    if (closes.length < 10) return null;
    const current = closes[closes.length - 1];
    const smaData = closes.length >= 200 ? closes.slice(-200) : closes;
    const sma200 = smaData.reduce((a, b) => a + b, 0) / smaData.length;
    return current > sma200;
  } catch (_) { return null; }
}

const SYSTEM_PROMPT = `Du er en markedsanalytiker. Søk etter de største pre-market gap movers i USA i dag.

Finn de 5 aksjene med størst pre-market gap (både opp og ned). Gap betyr prosentvis prisendring fra gårsdagens sluttkurs til pre-market pris i dag.

Returner KUN gyldig JSON-array. Ingen preamble. Ingen markdown. Kun JSON-arrayen.

Eksakt format:
[
  {"ticker": "XXXX", "company": "Company Name", "gap": 8.4, "volume": "2.3M"},
  {"ticker": "YYYY", "company": "Company Name", "gap": -5.1, "volume": "890K"}
]

gap: positiv for gap opp, negativ for gap ned. Sorter etter størst absolutt gap (blanding av opp og ned er OK).
volume: formatert som "1.2M" eller "450K"
Returner nøyaktig 5 entries. Svar KUN med JSON-arrayen.`;


module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API-nøkkel mangler' });

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const cached = await cache.get('gappers_v1');
  if (cached) {
    console.log('[gappers] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[gappers] CACHE MISS — calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [{ role: 'user', content: 'Finn de 5 største pre-market gap movers på US-børsene i dag. Returner JSON-array.' }];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      messages,
    });

    const finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!finalText) return res.status(500).json({ error: 'Ingen respons fra AI.' });

    const firstBrace = finalText.indexOf('[');
    const lastBrace = finalText.lastIndexOf(']');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[gappers] Ingen JSON funnet');
      return res.status(500).json({ error: 'Parsing feilet' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[gappers] JSON.parse feilet:', e.message);
      return res.status(500).json({ error: 'JSON parse feilet' });
    }
    if (!Array.isArray(parsed)) {
      console.error('[gappers] Ikke gyldig array');
      return res.status(500).json({ error: 'AI returnerte ugyldig format.' });
    }

    const enriched = await Promise.all(
      parsed.map(async g => {
        const above200sma = await enrichWithSma(g.ticker).catch(() => null);
        return { ...g, above200sma };
      })
    );
    cache.set('gappers_v1', enriched, 60 * 60 * 4);
    return res.status(200).json(enriched);

  } catch (error) {
    console.error('[gappers] API feil:', error);
    const msg = error.status === 429 ? 'For mange forespørsler. Vent litt.' : 'Klarte ikke hente gappers.';
    return res.status(500).json({ error: msg });
  }
};
