const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const { validateTicker } = require('./_validate');
const { fetchWithTimeout } = require('./_fetch');
const cache = require('./_cache');

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) { try { return JSON.parse(braceMatch[0]); } catch (_) {} }
  return null;
}

function isRelevantArticle(headline, summary) {
  const text = `${headline} ${summary || ''}`.toLowerCase();
  const keywords = ['earnings', 'guidance', 'analyst', 'acquisition', 'merger',
                    'lawsuit', 'fda', 'sec', 'upgrade', 'downgrade', 'target',
                    'revenue', 'profit', 'loss', 'beat', 'miss'];
  return keywords.some(kw => text.includes(kw));
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker: rawTicker, months: rawMonths } = req.query;

  let ticker;
  try {
    ticker = validateTicker(rawTicker);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const months = parseInt(rawMonths) || 3;
  if (![1, 3, 6, 12].includes(months)) {
    return res.status(400).json({ error: 'Invalid time period. Choose 1, 3, 6 or 12 months.' });
  }

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.` });

  // Analytics tracking (must never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:historikk:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* analytics must never crash endpoint */ }

  const cached = await cache.get(`historikk_${ticker}_${months}`);
  if (cached) {
    console.log(`[historikk] CACHE HIT: ${ticker} ${months}m`);
    return res.status(200).json(cached);
  }
  console.log('[historikk] Start');
  console.log(`[historikk] CACHE MISS: ${ticker} ${months}m — calling Claude`);

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing.' });
  }
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return res.status(500).json({ error: 'Alpaca API keys missing in environment variables.' });
  }

  // Calculate start date
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  const startISO = start.toISOString().slice(0, 10);

  // Fetch news from Alpaca
  let articles = [];
  try {
    const limit = months > 3 ? 50 : 10;
    const alpacaUrl = `https://data.alpaca.markets/v1beta1/news?symbols=${encodeURIComponent(ticker)}&start=${startISO}&limit=${limit}&sort=desc`;
    const alpacaRes = await fetchWithTimeout(alpacaUrl, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET,
      }
    }, 30000);

    if (!alpacaRes.ok) {
      const errText = await alpacaRes.text();
      console.error('Alpaca error:', alpacaRes.status, errText);
      if (alpacaRes.status === 403 || alpacaRes.status === 401) {
        return res.status(502).json({ error: 'Alpaca API key invalid or missing access.' });
      }
      return res.status(502).json({ error: `Failed to fetch news (${alpacaRes.status}).` });
    }

    const alpacaData = await alpacaRes.json();
    articles = alpacaData.news || [];
  } catch (e) {
    console.error('Alpaca fetch error:', e);
    return res.status(502).json({ error: 'Failed to connect to Alpaca API.' });
  }

  if (articles.length === 0) {
    return res.status(200).json({ ticker, catalysts: [], empty: true });
  }

  // Prepare article text for Claude — oldest first
  const filteredArticles = articles
    .slice()
    .reverse()
    .filter(a => isRelevantArticle(a.headline, a.summary));

  const articleText = filteredArticles
    .slice(0, 8)
    .map(a => {
      const date = (a.created_at || '').slice(0, 10);
      const headline = a.headline.split(' ').slice(0, 15).join(' ');
      const summary = a.summary || '';
      return `[${date}] ${headline}${summary ? ': ' + summary : ''}`;
    })
    .join('\n');

  console.log(`[historikk] Articles: ${articles.length} total, ${filteredArticles.length} relevant, ${Math.min(filteredArticles.length, 8)} sent to Claude (${articleText.length} chars)`);

  const systemPrompt = `Extract 5 most important stock-moving catalysts for ${ticker}. Return JSON only:
{"ticker":"${ticker}","catalysts":[{"date":"YYYY-MM-DD","headline":"max 8 words","explanation":"max 1 sentence, 20 words","sentiment":"positive"}]}

Rules:
- Chronological order (oldest first)
- sentiment: exactly "positive", "negative", or "neutral"
- Copy dates VERBATIM from [YYYY-MM-DD] prefix (never infer)
- All text (headline, explanation) in Norwegian bokmål
- Focus on price-moving events only

Be analytical and specific. No markdown, no preamble.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 450,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here are ${articles.length} news articles for ${ticker} from the last ${months} months:\n\n${articleText}\n\nIdentify the 5 most important catalysts.`
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
      console.error('[historikk] No JSON found in raw text');
      return res.status(500).json({ error: 'Parsing failed' });
    }
    const jsonString = finalText.substring(firstBrace, lastBrace + 1);
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[historikk] JSON.parse failed:', e.message);
      return res.status(500).json({ error: 'JSON parse failed' });
    }
    if (!parsed || !Array.isArray(parsed.catalysts)) {
      console.error('[historikk] Missing catalysts array. parsed:', JSON.stringify(parsed));
      return res.status(500).json({ error: 'AI returned invalid format. Try again.' });
    }

    cache.set(`historikk_${ticker}_${months}`, parsed, 24 * 3600);
    console.log('[historikk] Complete');
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Historikk API error:', error);
    const message = error.status === 401
      ? 'Invalid Anthropic API key.'
      : error.status === 429
        ? 'Too many requests. Wait a bit and try again.'
        : 'Failed to analyze history. Try again.';
    return res.status(500).json({ error: message });
  }
};
