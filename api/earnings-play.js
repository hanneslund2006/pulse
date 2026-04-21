const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
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

  const cached = cache.get(`earnings_play_${ticker}`);
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

    const systemPrompt = `You are a financial data analyst. Use web search to find current financial data for ${ticker}. Return ONLY valid JSON (no text, no markdown):
{"ticker":"${ticker}","currentPrice":null,"keyStats":{"shortFloat":null,"forwardPE":null,"insiderOwnership":null,"floatShares":null},"epsHistory":[{"quarter":"YYYY-MM-DD","actual":null,"estimate":null,"surprise":null,"surprisePct":null}],"estimates":{"forwardEPS":null,"forwardRevenue":null,"analystCount":null,"epsTrendCurrent":null,"epsTrend7d":null,"epsTrend30d":null,"earningsDate":null},"revenueTrend":[{"date":"YYYY-MM-DD","revenue":null,"netIncome":null}],"analystSentiment":{"consensus":null,"targetPrice":null,"currentPrice":null,"recentChanges":[{"firm":null,"from":null,"to":null,"date":null,"action":null}]},"impliedMove":null}
Rules: null=unknown(never guess). shortFloat/insiderOwnership/surprisePct=decimals(0.05=5%). revenue/netIncome=absolute dollars(not millions). epsHistory=4 quarters newest-first. revenueTrend=6 quarters newest-first. consensus="strongBuy"|"buy"|"hold"|"underperform"|"sell"|null. impliedMove={"percent":6.9}for±6.9%(not 0.069)or null. earningsDate=YYYY-MM-DD.`;

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

    const parsed = extractJSON(finalText);
    if (!parsed || !parsed.ticker) {
      console.error('Earnings-play JSON-feil. Råtekst:', finalText);
      return res.status(500).json({ error: 'AI returnerte ugyldig format. Prøv igjen.' });
    }

    cache.set(`earnings_play_${ticker}`, parsed, 12 * 3600);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Earnings-play API feil:', error);
    const message = error.status === 401
      ? 'Ugyldig API-nøkkel.'
      : error.status === 429
        ? 'For mange forespørsler. Vent litt og prøv igjen.'
        : 'Klarte ikke analysere earnings. Prøv igjen.';
    return res.status(500).json({ error: message });
  }
};
