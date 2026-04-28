const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

const SYSTEM_PROMPT = `Du er en swingtrading-assistent. Søk etter US-aksjer som er gode swing trading-kandidater akkurat nå.

Se etter aksjer med høy short interest (over 15%), positiv prismomentum siste uke, og en positiv katalysator (nyheter, earnings beat, analyst upgrade). Prioriter aksjer over 200 SMA.

Vurder disse tickerne basert på short float, momentum og nyhetskatalysator. Velg 3-5 beste swing-kandidater.

Returner KUN gyldig JSON-array. Ingen preamble. Ingen markdown. Kun JSON-arrayen.

Eksakt format:
[
  {"ticker": "XXXX", "direction": "Bullish", "reason": "Kort begrunnelse maks 20 ord"},
  {"ticker": "YYYY", "direction": "Bearish", "reason": "Kort begrunnelse maks 20 ord"}
]

Svar KUN med JSON-arrayen.`;


module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API-nøkkel mangler' });

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const today = new Date().toISOString().slice(0, 10);
  const CACHE_KEY = 'radar:' + today;
  const cached = await cache.get(CACHE_KEY);
  if (cached) {
    console.log('[radar] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[radar] CACHE MISS — calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: 'Finn de beste swing trading-kandidatene akkurat nå basert på høy short float, positiv momentum og katalysator. Returner JSON-array.' }],
    });

    const finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!finalText) return res.status(500).json({ error: 'Ingen respons fra AI.' });

    const firstBrace = finalText.indexOf('[');
    const lastBrace = finalText.lastIndexOf(']');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[radar] Ingen JSON funnet');
      return res.status(500).json({ error: 'Parsing feilet' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[radar] JSON.parse feilet:', e.message);
      return res.status(500).json({ error: 'JSON parse feilet' });
    }
    if (!Array.isArray(parsed)) {
      console.error('[radar] Ikke gyldig array');
      return res.status(500).json({ error: 'AI returnerte ugyldig format.' });
    }

    const valid = parsed.filter(item => item.ticker && item.direction && item.reason);
    if (!valid.length) {
      console.error('[radar] Ingen gyldige items i array');
      return res.status(500).json({ error: 'AI returnerte ingen gyldige kandidater.' });
    }

    cache.set(CACHE_KEY, valid, cache.nextMidnightTTL());
    return res.status(200).json(valid);

  } catch (error) {
    console.error('[radar] API feil:', error);
    const msg = error.status === 429 ? 'For mange forespørsler. Vent litt.' : 'Klarte ikke kjøre radar.';
    return res.status(500).json({ error: msg });
  }
};
