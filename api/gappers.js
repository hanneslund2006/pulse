const Anthropic = require('@anthropic-ai/sdk');

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

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API-nøkkel mangler' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [{ role: 'user', content: 'Finn de 5 største pre-market gap movers på US-børsene i dag. Returner JSON-array.' }];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages,
    });

    const finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!finalText) return res.status(500).json({ error: 'Ingen respons fra AI.' });

    const parsed = extractJSON(finalText);
    if (!parsed || !Array.isArray(parsed)) {
      return res.status(500).json({ error: 'AI returnerte ugyldig format.' });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    const msg = error.status === 429 ? 'For mange forespørsler. Vent litt.' : 'Klarte ikke hente gappers.';
    return res.status(500).json({ error: msg });
  }
};
