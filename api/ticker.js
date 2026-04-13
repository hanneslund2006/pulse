const Anthropic = require('@anthropic-ai/sdk');

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

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) { try { return JSON.parse(braceMatch[0]); } catch (_) {} }
  return null;
}

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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: `Søk etter informasjon om aksjen ${raw} og returner analysen som JSON.`
      }
    ];

    let finalText = '';
    const MAX_ITERATIONS = 10;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages
      });

      if (response.stop_reason === 'end_turn') {
        finalText = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();
        break;
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });
        const toolResults = response.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: [] }));
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        }
      } else {
        // max_tokens eller annen uventet stop_reason
        if (response.stop_reason === 'max_tokens') {
          console.error('Ticker: max_tokens nådd — respons trunkert');
        }
        finalText = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();
        break;
      }
    }

    if (!finalText) {
      return res.status(500).json({ error: 'Fikk ikke svar fra AI. Prøv igjen.' });
    }

    const parsed = extractJSON(finalText);
    if (!parsed) {
      console.error('Ticker JSON-parsing feilet. Råtekst:', finalText);
      return res.status(200).json({
        ticker: raw,
        company: '',
        found: false,
        error: 'AI returnerte ugyldig format. Prøv igjen.'
      });
    }

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
