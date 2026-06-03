const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const { fetchWithRetry, callClaudeWithRetry } = require('./_fetch');
const cache = require('./_cache');
const { XMLParser } = require('fast-xml-parser');

const xmlParser = new XMLParser({ ignoreAttributes: false, trimValues: true });

async function fetchRSS(url, source) {
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'PULSE/1.0 newsfeed',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      }
    }, 8000, 1);
    if (!res.ok) return [];
    const text = await res.text();
    const parsed = xmlParser.parse(text);
    const items = parsed?.rss?.channel?.item || [];
    return (Array.isArray(items) ? items : [items])
      .map(item => ({ title: (item.title || '').replace(/<[^>]+>/g, '').trim(), source }))
      .filter(i => i.title.length > 10);
  } catch (e) {
    console.warn(`[news-screener] RSS ${source} failed: ${e.message}`);
    return [];
  }
}

async function fetchReddit(subreddit) {
  try {
    const res = await fetchWithRetry(
      `https://www.reddit.com/r/${subreddit}.json?limit=25`,
      { headers: { 'User-Agent': 'PULSE/1.0 contact@pulse.app' } },
      8000, 1
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data?.children || [])
      .map(c => ({ title: (c.data?.title || '').trim(), source: `r/${subreddit}` }))
      .filter(i => i.title.length > 10);
  } catch (e) {
    console.warn(`[news-screener] Reddit r/${subreddit} failed: ${e.message}`);
    return [];
  }
}

async function fetchAlpacaNews() {
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) return [];
  try {
    const res = await fetchWithRetry(
      'https://data.alpaca.markets/v1beta1/news?limit=30&sort=desc',
      {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
          'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET,
        }
      },
      10000, 1
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.news || [])
      .map(a => ({ title: (a.headline || '').trim(), source: 'Alpaca' }))
      .filter(i => i.title.length > 10);
  } catch (e) {
    console.warn(`[news-screener] Alpaca failed: ${e.message}`);
    return [];
  }
}

function dedupeAndFormat(allItems) {
  const seen = new Set();
  const unique = [];
  for (const item of allItems) {
    const key = item.title.slice(0, 40).toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique.slice(0, 60).map(i => `${i.source}: ${i.title}`).join('\n');
}

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (_) {}
  }
  return null;
}

const THEME_SYSTEM = `Return JSON only:
{
  "themes": [
    {
      "name": "string (2-4 words, e.g. NATO rearmament)",
      "description": "string (max 20 words — equity market implication)",
      "sectors": ["string (GICS sector name)"]
    }
  ]
}
Extract 4-6 distinct macro/geopolitical themes from the headlines with direct equity market implications.
Ignore single-stock earnings stories. Focus on cross-sector trends.
Be analytical and specific. No markdown, no preamble.`;

const STOCK_SYSTEM = `Return JSON only:
{
  "generated_at": "ISO date string",
  "themes": ["string"],
  "momentum": [
    {
      "rank": 1,
      "ticker": "string",
      "company": "string",
      "sector": "string",
      "primary_theme": "string",
      "reason": "string (max 20 words)",
      "sentiment": "Bullish"
    }
  ],
  "undervalued": [
    {
      "rank": 1,
      "ticker": "string",
      "company": "string",
      "sector": "string",
      "primary_theme": "string",
      "reason": "string (max 20 words)",
      "sentiment": "Bullish"
    }
  ]
}
Search for US mid/small cap stocks (market cap $300M-$10B) with exposure to the given themes.
Return two ranked lists of 5-8 US-listed stocks each:
- momentum: direct tailwind or near-term catalyst from themes (near-term price catalyst expected)
- undervalued: theme exposure not yet priced in (value opportunity)
Rules: US-listed only. Max 2 stocks overlap between lists. Rank by conviction. sentiment is always "Bullish". No markdown, no preamble.`;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });

  const rl = await rateCheck(req);
  if (rl) return res.status(429).json({ error: `Rate limit reached. Try again in ${rl.waitMinutes} minutes.` });

  const hourKey = `news-screener:${new Date().toISOString().slice(0, 13)}`;
  const cached = await cache.get(hourKey);
  if (cached) {
    console.log('[news-screener] CACHE HIT');
    return res.status(200).json(cached);
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:news-screener:${today}`;
    const count = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, count + 1, 30 * 24 * 3600);
  } catch (_) {}

  console.log('[news-screener] CACHE MISS — fetching news');

  const results = await Promise.allSettled([
    fetchRSS('https://feeds.reuters.com/reuters/businessNews', 'Reuters'),
    fetchRSS('https://feeds.bbci.co.uk/news/business/rss.xml', 'BBC Business'),
    fetchRSS('https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World'),
    fetchReddit('worldnews'),
    fetchReddit('economics'),
    fetchAlpacaNews(),
  ]);

  const allItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value.length > 0).length;

  if (successCount < 2) {
    const stale = await cache.getStale(hourKey);
    if (stale) return res.status(200).json({ ...stale, stale: true });
    return res.status(502).json({ error: 'Unable to fetch enough news sources. Try again later.' });
  }

  const headlineList = dedupeAndFormat(allItems);
  console.log(`[news-screener] ${allItems.length} items, ${successCount} sources — ${headlineList.split('\n').length} unique headlines`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Phase 2: extract themes (no web_search — headlines are the source)
  let themes;
  try {
    const themeResp = await callClaudeWithRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: THEME_SYSTEM,
      messages: [{ role: 'user', content: `Headlines from the past 6 hours:\n\n${headlineList}` }],
    }));
    const themeText = themeResp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const themeParsed = extractJSON(themeText);
    if (!themeParsed || !Array.isArray(themeParsed.themes) || themeParsed.themes.length === 0) {
      throw new Error('Invalid theme structure');
    }
    themes = themeParsed.themes;
    console.log(`[news-screener] ${themes.length} themes extracted`);
  } catch (e) {
    console.error('[news-screener] Theme extraction failed:', e.message);
    const stale = await cache.getStale(hourKey);
    if (stale) return res.status(200).json({ ...stale, stale: true });
    return res.status(500).json({ error: 'Failed to extract themes. Try again.' });
  }

  // Phase 3: stock discovery via web_search
  const themeBlock = themes.map(t => `- ${t.name}: ${t.description}`).join('\n');
  try {
    const stockResp = await callClaudeWithRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: STOCK_SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      messages: [{ role: 'user', content: `Current market themes:\n${themeBlock}\n\nFind US mid/small cap stocks ($300M-$10B market cap) with exposure to these themes.` }],
    }));
    const stockText = stockResp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const stockParsed = extractJSON(stockText);

    if (!stockParsed || !Array.isArray(stockParsed.momentum) || !Array.isArray(stockParsed.undervalued)) {
      throw new Error('Invalid stock response structure');
    }
    if (!stockParsed.momentum.length && !stockParsed.undervalued.length) {
      throw new Error('No stocks returned');
    }

    const result = {
      generated_at: stockParsed.generated_at || new Date().toISOString(),
      themes,
      momentum: stockParsed.momentum,
      undervalued: stockParsed.undervalued,
    };

    cache.setWithStale(hourKey, result, 3600);
    console.log('[news-screener] Complete');
    return res.status(200).json(result);

  } catch (error) {
    console.error('[news-screener] Stock discovery failed:', error.message);
    const stale = await cache.getStale(hourKey);
    if (stale) return res.status(200).json({ ...stale, stale: true });
    const msg = error.status === 429
      ? 'Too many requests. Try again later.'
      : 'Failed to find stocks. Try again.';
    return res.status(500).json({ error: msg });
  }
};
