const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

function extractJSON(text) {
  if (!text) return null;

  // 1. Direct parse
  try { return JSON.parse(text.trim()); } catch (_) {}

  // 2. Strip markdown code fence
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }

  // 3. Balanced-brace walk — handles text before/after JSON and avoids
  //    greedy regex over-matching when Claude adds trailing text with braces
  const start = text.indexOf('{');
  if (start !== -1) {
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (!inString) {
        if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch (_) {}
          break;
        }
      }
    }
  }

  // 4. Last resort: strip non-printable chars (BOM, zero-width spaces) and retry
  const cleaned = text.replace(/[^\x20-\x7E\n\r\t]/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}

  return null;
}

async function fetchAlpacaNews(ticker) {
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  const startISO = start.toISOString().slice(0, 10);
  const url = `https://data.alpaca.markets/v1beta1/news?symbols=${encodeURIComponent(ticker)}&start=${startISO}&limit=10&sort=desc`;
  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
      'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET,
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.news || [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker || !/^[A-Z0-9.]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: 'Mangler eller ugyldig ticker-parameter' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler.' });
  }
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return res.status(500).json({ error: 'Alpaca API-nøkler mangler.' });
  }

  const rl = rateCheck(req);
  if (rl) return res.status(429).json({ error: `Du har nådd grensen for analyser denne timen. Prøv igjen om ${rl.waitMinutes} minutter.` });

  const cached = await cache.get(`earnings_play_${ticker}`);
  if (cached) {
    console.log(`[earnings-play] CACHE HIT: ${ticker}`);
    return res.status(200).json(cached);
  }
  console.log(`[earnings-play] CACHE MISS: ${ticker} — calling Claude`);

  try {
    const articles = await fetchAlpacaNews(ticker).catch(() => []);
    const newsContext = articles.length > 0
      ? articles.slice().reverse()
          .map(a => `[${(a.created_at || '').slice(0, 10)}] ${a.headline}${a.summary ? ': ' + a.summary : ''}`)
          .join('\n')
      : 'Ingen nyheter funnet fra Alpaca.';

    const systemPrompt = `You are a financial data analyst. Use web search to find current financial data for ${ticker}, and use the provided news articles as additional context.

Return ONLY valid JSON matching this exact structure (no preamble, no markdown):
{
  "ticker": "${ticker}",
  "currentPrice": 174.50,
  "keyStats": {
    "shortFloat": 0.023,
    "forwardPE": 28.5,
    "insiderOwnership": 0.038,
    "floatShares": 15400000000
  },
  "epsHistory": [
    {"quarter": "2025-09-01", "actual": 1.64, "estimate": 1.60, "surprise": 0.04, "surprisePct": 0.025}
  ],
  "estimates": {
    "forwardEPS": 1.62,
    "forwardRevenue": 94500000000,
    "analystCount": 38,
    "epsTrendCurrent": 1.62,
    "epsTrend7d": 1.60,
    "epsTrend30d": 1.58,
    "earningsDate": "2026-05-01"
  },
  "revenueTrend": [
    {"date": "2025-09-30", "revenue": 94930000000, "netIncome": 14736000000}
  ],
  "analystSentiment": {
    "consensus": "buy",
    "targetPrice": 225.00,
    "currentPrice": 174.50,
    "recentChanges": [
      {"firm": "Goldman Sachs", "from": "Neutral", "to": "Buy", "date": "2026-04-01", "action": "upgrade"}
    ]
  },
  "impliedMove": null
}

Rules:
- Use null for any field you cannot find — never guess or hallucinate numbers
- shortFloat and insiderOwnership are decimals (0.05 = 5%)
- surprisePct is a decimal (0.025 = 2.5%)
- revenue and netIncome are in absolute dollars (not millions)
- epsHistory: up to 4 most recent quarters, most recent first
- revenueTrend: up to 6 most recent quarters, most recent first
- consensus must be exactly one of: "strongBuy", "buy", "hold", "underperform", "sell", or null
- impliedMove.percent: the implied move as a PERCENTAGE NUMBER e.g. 6.9 means ±6.9% (NOT a decimal like 0.069); otherwise null
- earningsDate: next upcoming earnings date in YYYY-MM-DD format
- Return ONLY the JSON object, nothing else`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      messages: [{
        role: 'user',
        content: `Build an earnings play analysis for ${ticker}. You have exactly 2 web searches — use them efficiently:\n- Search 1: "${ticker} stock EPS history quarterly actual vs estimate analyst consensus target price forward PE earnings date 2026"\n- Search 2: "${ticker} short float insider ownership"\n\nRecent news (last 3 months):\n${newsContext}\n\nReturn the complete JSON.`,
      }],
    });

    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    console.log(`[earnings-play] Claude raw response (${finalText.length} chars):`, finalText.slice(0, 500));
    console.error('[earnings-play] raw length:', finalText?.length);
    console.error('[earnings-play] raw start:', finalText?.substring(0, 200));

    const cleaned = finalText
      .replace(/^\s*json\s*/i, '')
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = extractJSON(cleaned);
    console.log('[earnings-play] parsed:', JSON.stringify(parsed));

    if (!parsed || typeof parsed !== 'object') {
      console.error('[earnings-play] extractJSON returnerte null. Råtekst:', finalText);
      return res.status(500).json({ error: 'AI returnerte ugyldig format. Prøv igjen.' });
    }

    if (!parsed.ticker) {
      console.error('[earnings-play] parsed.ticker mangler. parsed:', JSON.stringify(parsed));
      return res.status(500).json({ error: `AI-respons mangler ticker-felt. Mottatt: ${Object.keys(parsed).join(', ')}` });
    }

    // Null-sikre alle nestede felt før serialisering
    const safe = {
      ticker: parsed.ticker || ticker,
      currentPrice: parsed.currentPrice ?? null,
      keyStats: {
        shortFloat: parsed.keyStats?.shortFloat ?? null,
        forwardPE: parsed.keyStats?.forwardPE ?? null,
        insiderOwnership: parsed.keyStats?.insiderOwnership ?? null,
        floatShares: parsed.keyStats?.floatShares ?? null,
      },
      epsHistory: Array.isArray(parsed.epsHistory) ? parsed.epsHistory : [],
      estimates: {
        forwardEPS: parsed.estimates?.forwardEPS ?? null,
        forwardRevenue: parsed.estimates?.forwardRevenue ?? null,
        analystCount: parsed.estimates?.analystCount ?? null,
        epsTrendCurrent: parsed.estimates?.epsTrendCurrent ?? null,
        epsTrend7d: parsed.estimates?.epsTrend7d ?? null,
        epsTrend30d: parsed.estimates?.epsTrend30d ?? null,
        earningsDate: parsed.estimates?.earningsDate ?? null,
      },
      revenueTrend: Array.isArray(parsed.revenueTrend) ? parsed.revenueTrend : [],
      analystSentiment: {
        consensus: parsed.analystSentiment?.consensus ?? null,
        targetPrice: parsed.analystSentiment?.targetPrice ?? null,
        currentPrice: parsed.analystSentiment?.currentPrice ?? null,
        recentChanges: Array.isArray(parsed.analystSentiment?.recentChanges) ? parsed.analystSentiment.recentChanges : [],
      },
      impliedMove: parsed.impliedMove ?? null,
    };

    try {
      cache.set(`earnings_play_${ticker}`, safe, 12 * 3600);
    } catch (cacheErr) {
      console.error('[earnings-play] cache.set feilet:', cacheErr.message);
    }

    try {
      return res.status(200).json(safe);
    } catch (serializeErr) {
      console.error('[earnings-play] res.json serialisering feilet:', serializeErr.message, JSON.stringify(safe).slice(0, 500));
      return res.status(500).json({ error: 'Kunne ikke serialisere respons.' });
    }

  } catch (error) {
    console.error('Earnings-play API feil:', error.status, error.message, error);
    const message = error.status === 401
      ? 'Ugyldig API-nøkkel.'
      : error.status === 429
        ? 'For mange forespørsler. Vent litt og prøv igjen.'
        : 'Klarte ikke analysere earnings. Prøv igjen.';
    return res.status(500).json({ error: message });
  }
};
