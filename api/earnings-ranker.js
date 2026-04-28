const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

function getISOWeek() {
  const d = new Date();
  const dayOfWeek = d.getUTCDay() || 7;
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function endOfWeekTTL() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToSunday = day === 0 ? 7 : 7 - day;
  const end = new Date(now);
  end.setUTCDate(now.getUTCDate() + daysToSunday);
  end.setUTCHours(23, 59, 59, 0);
  return Math.max(3600, Math.floor((end - now) / 1000));
}

const SYSTEM_PROMPT = `Du er en swingtrading-analyst. Søk etter alle viktige selskaper som rapporterer earnings denne uken (inneværende handelsukes mandag til fredag).

Returner KUN gyldig JSON-array. Ingen preamble. Ingen markdown. Kun JSON-arrayen.

For hvert selskap, vurder:
- Historisk beat-rate (beater selskapet vanligvis estimatene?)
- Analytikerforventninger (er consensus positiv?)
- Volatilitet og potensial for implied move
- Om aksjen er over 200 SMA (positiv trend)

Ranger etter total trading-potensial (høyest øverst).

Eksakt format:
[
  {
    "ticker": "AAPL",
    "company": "Apple Inc.",
    "earningsDate": "2026-04-29",
    "time": "AMC",
    "rank": 1,
    "score": 85,
    "direction": "Bullish",
    "reason": "Maks 15 ord norsk om hvorfor denne er interessant"
  }
]

Regler:
- Maks 8 selskaper. Prioriter de mest kjente og handlede.
- time er "BMO" (Before Market Open) eller "AMC" (After Market Close)
- score er 0-100 (trading-potensial denne uken)
- direction er eksakt en av: "Bullish", "Bearish", "Avvent"
- Svar KUN med JSON-arrayen`;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API-nøkkel mangler' });

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const week = getISOWeek();
  const cached = await cache.get('earnings-ranker:' + week);
  if (cached) {
    console.log('[earnings-ranker] CACHE HIT:', week);
    return res.status(200).json(cached);
  }
  console.log('[earnings-ranker] CACHE MISS:', week, '— calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `Today is ${today}. Finn alle viktige earnings denne uken og ranger dem etter trading-potensial. Returner JSON-array.` }],
    });

    const finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!finalText) return res.status(500).json({ error: 'Ingen respons fra AI.' });

    const first = finalText.indexOf('[');
    const last = finalText.lastIndexOf(']');
    if (first === -1 || last === -1) {
      console.error('[earnings-ranker] Ingen JSON array');
      return res.status(500).json({ error: 'Parsing feilet' });
    }
    let parsed;
    try {
      parsed = JSON.parse(finalText.substring(first, last + 1));
    } catch (e) {
      console.error('[earnings-ranker] JSON.parse feilet:', e.message);
      return res.status(500).json({ error: 'JSON parse feilet' });
    }
    if (!Array.isArray(parsed)) return res.status(500).json({ error: 'Ugyldig format' });

    const valid = parsed.filter(item => item.ticker && item.earningsDate && item.direction);
    if (!valid.length) {
      console.error('[earnings-ranker] Ingen gyldige items');
      return res.status(500).json({ error: 'AI returnerte ingen gyldige earnings-kandidater.' });
    }

    cache.set('earnings-ranker:' + week, valid, endOfWeekTTL());
    return res.status(200).json(valid);
  } catch (error) {
    console.error('[earnings-ranker] feil:', error);
    const msg = error.status === 429 ? 'For mange forespørsler. Vent litt.' : 'Klarte ikke hente earnings-ranker.';
    return res.status(500).json({ error: msg });
  }
};
