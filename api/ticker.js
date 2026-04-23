const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

const SYSTEM_PROMPT = `Du er en aksjeanalytiker. Du får et ticker-symbol og søker etter fersk informasjon.

Returner KUN gyldig JSON. Ingen preamble. Ingen markdown. Kun JSON-objektet.

Søk etter disse 5 lagene for tickeren:
1. Nyheter:     Ferske overskrifter fra Yahoo Finance, Finviz, Google News
2. Earnings:    Kommende rapportdato og konsensusestimater
3. Insider:     Nylige innsidehandler (kjøp/salg) fra OpenInsider
4. Short Float: Short float % og short ratio fra Finviz
5. Sentiment:   CNN Fear & Greed + overordnet aksjestemning

Eksakt JSON-struktur:
{
  "ticker": "string",
  "company": "string (fullt selskapsnavn)",
  "found": true,
  "layers": [
    {"name": "Nyheter",     "sentiment": "Bullish", "summary": "string"},
    {"name": "Earnings",    "sentiment": "Nøytral", "summary": "string"},
    {"name": "Insider",     "sentiment": "Bearish", "summary": "string"},
    {"name": "Short Float", "sentiment": "Nøytral", "summary": "string"},
    {"name": "Sentiment",   "sentiment": "Bullish", "summary": "string"}
  ]
}

Hvis ticker ikke eksisterer eller ikke er en kjent aksje, returner:
{"ticker": "XYZ", "company": "", "found": false}

Regler:
- Each layer summary: MAXIMUM 2 sentences and 30 words. Cut ruthlessly.
- sentiment er nøyaktig en av: "Bullish", "Bearish", "Nøytral"
- Alltid nøyaktig 5 lag i layers-arrayet i rekkefølgen over
- Svar KUN med JSON-objektet, ingenting annet`;


module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API-nøkkel mangler.' });
  }

  const raw = (req.body?.ticker || '').trim().toUpperCase();
  if (!raw || !/^[A-Z0-9.]{1,6}$/.test(raw)) {
    return res.status(400).json({ error: 'Ugyldig ticker-symbol.' });
  }

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const cached = await cache.get(`ticker_${raw}`);
  if (cached) {
    console.log(`[ticker] CACHE HIT: ${raw}`);
    return res.status(200).json(cached);
  }
  console.log(`[ticker] CACHE MISS: ${raw} — calling Claude`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: `Søk etter informasjon om aksjen ${raw} og returner analysen som JSON.`
      }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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
      console.error('[ticker] Ingen JSON funnet');
      return res.status(500).json({ error: 'Parsing feilet' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[ticker] JSON.parse feilet:', e.message);
      return res.status(500).json({ error: 'JSON parse feilet' });
    }

    cache.set(`ticker_${raw}`, parsed, 6 * 3600);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Ticker API feil:', error);
    const message = error.status === 401
      ? 'Ugyldig API-nøkkel.'
      : error.status === 429
        ? 'For mange forespørsler. Vent litt og prøv igjen.'
        : 'Klarte ikke hente ticker-data. Prøv igjen.';
    return res.status(500).json({ error: message });
  }
};
