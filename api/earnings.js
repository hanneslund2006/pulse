const Anthropic = require('@anthropic-ai/sdk');

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(mon), end: fmt(fri) };
}

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API-nøkkel mangler.' });
  }

  // Parse watchlist from query param
  const watchlistParam = req.query.watchlist || '';
  const watchlist = watchlistParam
    ? watchlistParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : [];

  const { start, end } = getWeekRange();
  const watchlistHint = watchlist.length
    ? `Prioriter disse selskapene hvis de rapporterer: ${watchlist.join(', ')}. Hvis ingen av dem rapporterer denne uken, returner de 5 mest markedsrelevante selskapene som rapporterer.`
    : 'Returner de 5 mest markedsrelevante selskapene som rapporterer denne uken (store cap, høy handelsvolum).';

  const SYSTEM = `Du er en finansanalytiker. Søk etter earnings-rapporter for inneværende uke (${start} til ${end}).

Returner KUN et gyldig JSON-array. Ingen preamble, ingen markdown, kun array-objektet.

Eksakt struktur:
[
  {
    "ticker": "AAPL",
    "company": "Apple Inc.",
    "date": "2026-04-17",
    "time": "etter børs",
    "epsEstimate": "1.62"
  }
]

Regler:
- "time" er nøyaktig én av: "før børs", "etter børs", "ukjent"
- "date" er ISO-format YYYY-MM-DD
- "epsEstimate" er konsensusestimat som string, f.eks. "1.62" eller "N/A"
- Maks 8 selskaper i arrayet
- Svar KUN med JSON-arrayet, ingenting annet`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: `Søk etter hvilke selskaper som rapporterer earnings denne uken (${start}–${end}). ${watchlistHint}`
      }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages,
    });

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!finalText) return res.status(500).json({ error: 'Ingen respons fra AI.' });

    console.error('[earnings] Claude råtekst:', finalText);
    const parsed = extractJSON(finalText);
    if (!Array.isArray(parsed)) {
      console.error('Earnings JSON-feil. Råtekst:', finalText);
      return res.status(500).json({ error: 'Ugyldig format fra AI.' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Earnings API feil:', err);
    const msg = err.status === 401 ? 'Ugyldig API-nøkkel.'
      : err.status === 429 ? 'For mange forespørsler. Vent litt.'
      : 'Klarte ikke hente earnings-data.';
    return res.status(500).json({ error: msg });
  }
};
