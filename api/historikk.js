const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) { try { return JSON.parse(braceMatch[0]); } catch (_) {} }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker: rawTicker, months: rawMonths } = req.query;

  const ticker = (rawTicker || '').trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'Ugyldig ticker-symbol.' });
  }

  const months = parseInt(rawMonths) || 3;
  if (![3, 6, 12].includes(months)) {
    return res.status(400).json({ error: 'Ugyldig tidsperiode. Velg 3, 6 eller 12 måneder.' });
  }

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const cached = await cache.get(`historikk_${ticker}_${months}`);
  if (cached) {
    console.log(`[historikk] CACHE HIT: ${ticker} ${months}m`);
    return res.status(200).json(cached);
  }
  console.log(`[historikk] CACHE MISS: ${ticker} ${months}m — calling Claude`);

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler.' });
  }
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return res.status(500).json({ error: 'Alpaca API-nøkler mangler i miljøvariabler.' });
  }

  // Calculate start date
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  const startISO = start.toISOString().slice(0, 10);

  // Fetch news from Alpaca
  let articles = [];
  try {
    const alpacaUrl = `https://data.alpaca.markets/v1beta1/news?symbols=${encodeURIComponent(ticker)}&start=${startISO}&limit=20&sort=desc`;
    const alpacaRes = await fetch(alpacaUrl, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET,
      }
    });

    if (!alpacaRes.ok) {
      const errText = await alpacaRes.text();
      console.error('Alpaca feil:', alpacaRes.status, errText);
      if (alpacaRes.status === 403 || alpacaRes.status === 401) {
        return res.status(502).json({ error: 'Alpaca API-nøkkel ugyldig eller mangler tilgang.' });
      }
      return res.status(502).json({ error: `Klarte ikke hente nyheter (${alpacaRes.status}).` });
    }

    const alpacaData = await alpacaRes.json();
    articles = alpacaData.news || [];
  } catch (e) {
    console.error('Alpaca fetch feil:', e);
    return res.status(502).json({ error: 'Klarte ikke koble til Alpaca API.' });
  }

  if (articles.length === 0) {
    return res.status(200).json({ ticker, catalysts: [], empty: true });
  }

  // Prepare article text for Claude — oldest first
  const articleText = articles
    .slice()
    .reverse()
    .map(a => `[${(a.created_at || '').slice(0, 10)}] ${a.headline}${a.summary ? ': ' + a.summary : ''}`)
    .join('\n');

  const systemPrompt = `You are a financial analyst. Given these news articles about ${ticker}, identify the 5-8 most important catalysts that likely caused major price movements. For each catalyst, provide: the date, a short headline (max 8 words), and 2-3 sentences explaining what happened and why it likely moved the stock. Also classify each catalyst sentiment as "positive", "negative", or "neutral" based on its likely impact on the stock price.

Return ONLY valid JSON, no preamble, no markdown. Exact structure:
{
  "ticker": "${ticker}",
  "catalysts": [
    {
      "date": "YYYY-MM-DD",
      "headline": "Short headline max 8 words",
      "explanation": "2-3 sentences explaining what happened and why it moved the stock.",
      "sentiment": "positive"
    }
  ]
}

Return catalysts in chronological order, oldest first. sentiment must be exactly one of: "positive", "negative", "neutral".`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here are ${articles.length} news articles for ${ticker} from the last ${months} months:\n\n${articleText}\n\nIdentify the 5-8 most important catalysts.`
        }
      ]
    });

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    const firstBrace = finalText.indexOf('{');
    const lastBrace = finalText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('[historikk] Ingen JSON funnet i råtekst');
      return res.status(500).json({ error: 'Parsing feilet' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[historikk] JSON.parse feilet:', e.message);
      return res.status(500).json({ error: 'JSON parse feilet' });
    }
    if (!parsed || !Array.isArray(parsed.catalysts)) {
      console.error('[historikk] Mangler catalysts-array. parsed:', JSON.stringify(parsed));
      return res.status(500).json({ error: 'AI returnerte ugyldig format. Prøv igjen.' });
    }

    cache.set(`historikk_${ticker}_${months}`, parsed, 24 * 3600);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Historikk API feil:', error);
    const message = error.status === 401
      ? 'Ugyldig Anthropic API-nøkkel.'
      : error.status === 429
        ? 'For mange forespørsler. Vent litt og prøv igjen.'
        : 'Klarte ikke analysere historikk. Prøv igjen.';
    return res.status(500).json({ error: message });
  }
};
