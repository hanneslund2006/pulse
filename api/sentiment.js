const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

const SYSTEM_PROMPT = `Du er en finansmarkedsanalytiker. Søk etter dagens ferske markedsnyheter og -data.

Returner KUN gyldig JSON. Ingen preamble. Ingen markdown. Ingen forklaringer. Kun JSON-objektet.

Eksakt struktur:
{
  "verdict": "string (maks 15 ord norsk, konkret markedsoppsummering)",
  "score": number (0-100, helhetlig sentimentscore: 0=ekstremt bearish, 50=nøytral, 100=ekstremt bullish),
  "keydata": [
    {"label": "string", "value": "string"}
  ],
  "categories": [
    {
      "name": "MAKRO",
      "sentiment": "Bullish",
      "summary": "string (2-3 setninger ren tekst, ingen markdown, ingen asterisker)"
    },
    {
      "name": "ENERGI",
      "sentiment": "Bearish",
      "summary": "string (2-3 setninger ren tekst)"
    },
    {
      "name": "FINANS",
      "sentiment": "Mixed",
      "summary": "string (2-3 setninger ren tekst)"
    },
    {
      "name": "TECH",
      "sentiment": "Avvent",
      "summary": "string (2-3 setninger ren tekst)"
    }
  ]
}

Regler:
- keydata: returner nøyaktig disse 4 nøkkeltallene i denne rekkefølgen: S&P 500, Nasdaq Futures, VIX, 10-årsrente US
- sentiment-verdier er nøyaktig en av: "Bullish", "Bearish", "Mixed", "Avvent"
- summary-tekst: ingen *, ingen #, ingen liste-symboler — kun rene setninger
- Each category 'summary' field must be MAXIMUM 2 sentences and 40 words total. Cut ruthlessly. One sentence on what happened, one on market implication. Never exceed 40 words.
- score basert på helhetsvurdering av alle kategorier
- Svar KUN med JSON-objektet, ingenting annet`;


module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API-nøkkel mangler. Sett ANTHROPIC_API_KEY i miljøvariabler.' });
  }

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const cached = await cache.get('sentiment');
  if (cached) {
    console.log('[sentiment] CACHE HIT');
    return res.status(200).json(cached);
  }
  console.log('[sentiment] CACHE MISS — calling Claude');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: 'Søk etter dagens markedsnyheter og returner sentimentrapporten som JSON.'
      }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages
    });

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!finalText) {
      return res.status(500).json({ error: 'Fikk ikke svar fra AI. Prøv igjen.' });
    }

    const firstBrace = finalText.indexOf('{');
    const lastBrace = finalText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[sentiment] Ingen JSON funnet');
      return res.status(500).json({ error: 'Parsing feilet' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[sentiment] JSON.parse feilet:', e.message);
      return res.status(500).json({ error: 'JSON parse feilet' });
    }

    cache.set('sentiment', parsed, cache.nextMidnightTTL());
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Anthropic API feil:', error);

    const message = error.status === 401
      ? 'Ugyldig API-nøkkel.'
      : error.status === 429
        ? 'For mange forespørsler. Vent litt og prøv igjen.'
        : 'Klarte ikke hente sentiment. Prøv igjen.';

    return res.status(500).json({ error: message });
  }
};
