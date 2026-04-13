const Anthropic = require('@anthropic-ai/sdk');

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
- keydata: 4-6 nøkkeltall fra dagens marked (S&P 500, Nasdaq, VIX, 10-årsrente, oljepris, relevant valuta)
- sentiment-verdier er nøyaktig en av: "Bullish", "Bearish", "Mixed", "Avvent"
- summary-tekst: ingen *, ingen #, ingen liste-symboler — kun rene setninger
- score basert på helhetsvurdering av alle kategorier
- Svar KUN med JSON-objektet, ingenting annet`;

function extractJSON(text) {
  // Direct parse
  try { return JSON.parse(text.trim()); } catch (_) {}

  // Strip markdown code fence
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }

  // Find first {...} block
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch (_) {}
  }

  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API-nøkkel mangler. Sett ANTHROPIC_API_KEY i miljøvariabler.' });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: 'Søk etter dagens markedsnyheter og returner sentimentrapporten som JSON.'
      }
    ];

    let finalText = '';
    const MAX_ITERATIONS = 10;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
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
      console.error('JSON-parsing feilet. Råtekst:', finalText);
      return res.status(500).json({ error: 'AI returnerte ugyldig format. Prøv igjen.' });
    }

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
