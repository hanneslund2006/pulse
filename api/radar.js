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

Maks 300 tokens. Svar KUN med JSON-arrayen.`;

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API-nøkkel mangler' });

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const cached = await cache.get('radar');
  if (cached) {
    console.log('[radar] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[radar] CACHE MISS — calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: 'Finn de beste swing trading-kandidatene akkurat nå basert på høy short float, positiv momentum og katalysator. Returner JSON-array.' }],
    });

    const finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!finalText) return res.status(500).json({ error: 'Ingen respons fra AI.' });

    const parsed = extractJSON(finalText);
    if (!parsed || !Array.isArray(parsed)) {
      return res.status(500).json({ error: 'AI returnerte ugyldig format.' });
    }

    cache.set('radar', parsed, cache.nextMidnightTTL());
    return res.status(200).json(parsed);

  } catch (error) {
    const msg = error.status === 429 ? 'For mange forespørsler. Vent litt.' : 'Klarte ikke kjøre radar.';
    return res.status(500).json({ error: msg });
  }
};
