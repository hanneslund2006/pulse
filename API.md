# PULSE API Documentation

## Overview
PULSE provides 12 serverless API endpoints for market sentiment analysis, insider trading data, earnings analysis, and trading tools.

**Base URL:** `https://pulse-theta-wheat.vercel.app`

**Rate Limiting:** 25 requests/hour per IP (all endpoints except quotes)

**Caching:** Redis-backed with in-memory fallback

**Response format:** Each endpoint returns its own raw JSON object (shapes below). Failures return `{ "error": "message" }` with the relevant status code. PULSE does not use the `{ data, error, cached }` envelope.

---

## Endpoints

### 1. Market Sentiment
**POST** `/api/sentiment`

Returns daily market overview with sentiment analysis across 4 categories.

**Response:**
```json
{
  "verdict": "string (max 15 words)",
  "score": 0,
  "keydata": [{ "label": "S&P 500", "value": "..." }],
  "categories": [
    { "name": "MACRO", "sentiment": "Bullish", "summary": "..." },
    { "name": "ENERGY", "sentiment": "Bearish", "summary": "..." },
    { "name": "FINANCIALS", "sentiment": "Mixed", "summary": "..." },
    { "name": "TECH", "sentiment": "Neutral", "summary": "..." }
  ]
}
```

**Cache:** Until midnight UTC (nextMidnightTTL)  
**Model:** Sonnet 4.5 (55-word system prompt)

---

### 2. Ticker Analysis
**POST** `/api/ticker`

5-layer sentiment analysis for individual stock.

**Body (JSON):**
- `ticker` (required): Stock symbol (1-6 chars, uppercase)

**Response:**
```json
{
  "ticker": "AAPL",
  "company": "Apple Inc.",
  "found": true,
  "layers": [
    { "name": "News", "sentiment": "Bullish", "summary": "..." },
    { "name": "Earnings", "sentiment": "Neutral", "summary": "..." },
    { "name": "Insider", "sentiment": "Bearish", "summary": "..." },
    { "name": "Short Float", "sentiment": "Neutral", "summary": "..." },
    { "name": "Sentiment", "sentiment": "Bullish", "summary": "..." }
  ]
}
```

**Cache:** 24 hours  
**Model:** Sonnet 4.5 (75-word system prompt)

---

### 3. Insider Trading
**GET** `/api/insider?ticker=AAPL`

SEC EDGAR Form 4 insider trading analysis.

**Parameters:**
- `ticker` (required): Stock symbol (1-6 chars, uppercase)

**Response:**
```json
{
  "ticker": "AAPL",
  "transactions": [
    {
      "filerName": "LEVINSON ARTHUR D",
      "transactionDate": "2026-05-06",
      "transactionType": "SELL",
      "shares": 149527,
      "pricePerShare": 284.57
    }
  ],
  "sentiment": "BEARISH",
  "summary": "3 insider sells vs 0 buys — insiders are reducing positions."
}
```

**Cache:**
- Result: 6 hours
- CIK lookup: 30 days

**Model:** None (XML parsing only)  
**Data source:** SEC EDGAR API  
**Transaction types:** P (BUY), S (SELL) only  
**Max transactions:** 10 (most recent)

**Optional env var:** `SEC_USER_AGENT` — SEC EDGAR User-Agent. Falls back to a hard-coded default (`PULSE/1.0 contact@example.com`) when unset.

---

### 4. Earnings Analysis
**GET** `/api/earnings`

Top 8 upcoming earnings with AI analysis.

**Response:**
```json
{
  "earnings": [
    {
      "ticker": "NVDA",
      "date": "2026-05-20",
      "estimate": "$5.20",
      "surprise": "Likely beat",
      "rationale": "..."
    }
  ]
}
```

**Cache:** 6 hours (global, not per-ticker)  
**Model:** Haiku 4.5 (web search + formatting)

---

### 5. Earnings Play
**GET** `/api/earnings-play?ticker=NVDA`

Pre-earnings trade setup analysis.

**Parameters:**
- `ticker` (required): Stock symbol

**Response:**
```json
{
  "ticker": "NVDA",
  "earningsDate": "2026-05-20",
  "playType": "CALL_SPREAD",
  "rationale": "...",
  "risk": "..."
}
```

**Cache:** 6 hours  
**Model:** Haiku 4.5

---

### 6. Sector Analysis
**GET** `/api/sektor` or `/api/sektor?ticker=AAPL`

Sector list (no params) or a single ticker's sector context.

**Parameters:**
- `ticker` (optional): Stock symbol — returns that ticker's sector context
- `navn` (optional): Display name override for the ticker (max 40 chars)

**Response:**
```json
{
  "sektor": "TECH",
  "sentiment": "BULLISH",
  "summary": "...",
  "catalysts": ["..."]
}
```

**Cache:**
- Sector-only: 6 hours
- Ticker-param: 24 hours

**Model:** Haiku 4.5 (`claude-haiku-4-5-20251001`)

---

### 7. Radar
**POST** `/api/radar`

Swing trade opportunities (5-15 day setups).

**Response:**
```json
{
  "opportunities": [
    {
      "ticker": "TSLA",
      "setup": "BREAKOUT",
      "entry": "$245-250",
      "target": "$280",
      "stop": "$235",
      "rationale": "..."
    }
  ]
}
```

**Cache:** Until midnight UTC (nextMidnightTTL)  
**Model:** Haiku 4.5 (`claude-haiku-4-5-20251001`)

---

### 8. Gappers
**GET** `/api/gappers`

Pre-market gap analysis with trade setups.

**Response:**
```json
{
  "gappers": [
    {
      "ticker": "AAPL",
      "gap": "+3.2%",
      "catalyst": "Earnings beat",
      "play": "Wait for pullback to $280"
    }
  ]
}
```

**Cache:** 30 minutes (intentional — pre-market data freshness)
**Model:** Haiku 4.5 (`claude-haiku-4-5-20251001`)

---

### 9. Historical Analysis
**GET** `/api/historikk?ticker=AAPL&months=3`

AI-generated timeline of price catalysts.

**Parameters:**
- `ticker` (required): Stock symbol
- `months` (optional): 1, 3, 6, or 12 (default: 3)

**Response:**
```json
{
  "ticker": "AAPL",
  "catalysts": [
    {
      "date": "2026-04-15",
      "headline": "Record iPhone sales",
      "sentiment": "positive",
      "explanation": "...",
      "sources": [1, 2]
    }
  ],
  "sources": [
    { "id": 1, "title": "...", "url": "..." }
  ]
}
```

**Cache:** 24 hours  
**Model:** Haiku 4.5 (`claude-haiku-4-5-20251001`)
**Pre-filtering:** 15 keywords (earnings, analyst, revenue, etc.)  
**Token optimization:** 60% reduction via article filtering

---

### 10. Quotes
**GET** `/api/quotes?symbols=SPX,NDX,DXY,BTC,10Y`

Real-time quotes for the requested symbols (Yahoo Finance proxy).

**Parameters:**
- `symbols` (required): Comma-separated symbol list (1-20). Returns 400 if absent or empty.

**Response:**
```json
{
  "SPX": { "price": 5234.56, "change": "+1.2%" },
  "NDX": { "price": 18234.12, "change": "+0.8%" }
}
```

**Cache:** None (always fresh)  
**Model:** None (yahoo-finance2 library)  
**Rate limit:** None (high-frequency endpoint)

---

### 11. Screener
**GET** `/api/screener?case=safe+stocks+in+uncertain+times`

Free-text investment case screener. Returns 3-7 matching US stocks with rationale.

**Parameters:**
- `case` (required): Investment thesis in plain text (max 200 characters)

**Response:**
```json
{
  "stocks": [
    {
      "ticker": "JNJ",
      "company": "Johnson & Johnson",
      "why_it_fits": "Defensive healthcare with stable dividend yield"
    }
  ]
}
```

**Cache:** 5 minutes (case-specific, low reuse)  
**Model:** Haiku 4.5 (web search)

---

### 12. News Screener
**GET** `/api/news-screener`

Surfaces tradeable stock ideas from current market headlines (3-phase: headline ingest → theme extraction → web-search discovery).

**Parameters:** None.

**Response:**
```json
{
  "generated_at": "2026-06-09T06:00:00.000Z",
  "themes": ["AI capex", "..."],
  "momentum": [
    { "ticker": "NVDA", "sentiment": "Bullish", "rationale": "..." }
  ],
  "undervalued": [
    { "ticker": "...", "sentiment": "Bullish", "rationale": "..." }
  ]
}
```

**Cache:** 1 hour (hourly key, serves stale on failure)
**Model:** Haiku 4.5 (`claude-haiku-4-5-20251001`, web search)

---

## Environment Variables

### Required
- `ANTHROPIC_API_KEY` — Claude API key (all AI endpoints)

### Optional
- `SEC_USER_AGENT` — SEC EDGAR User-Agent (insider endpoint). Falls back to a hard-coded default when unset.
- `KV_REST_API_URL` — Upstash Redis URL (falls back to in-memory)
- `KV_REST_API_TOKEN` — Upstash Redis token
- `ALPACA_API_KEY` — Alpaca API (historikk endpoint)
- `ALPACA_API_SECRET` — Alpaca secret

---

## Rate Limiting

**Limit:** 25 requests/hour per IP

**Applies to:** All endpoints except `/api/quotes`

**Response (429):**
```json
{
  "error": "You have reached the limit for analyses this hour. Try again in 17 minutes."
}
```

**Implementation:** Upstash Redis TTL with in-memory fallback

---

## Error Handling

**400 - Bad Request:**
```json
{ "error": "Invalid ticker symbol" }
```

**404 - Not Found:**
```json
{ "error": "Ticker not found in SEC database." }
```

**429 - Rate Limited:**
```json
{ "error": "You have reached the limit for analyses this hour. Try again in X minutes." }
```

**500 - Server Error:**
```json
{ "error": "Failed to fetch data. Try again." }
```

**Security:** Error messages are generic (no stack traces or internal details)

---

## Function Limits

**Vercel Hobby:** Max 12 serverless functions

**Current count:** 12/12 (at limit)

**To add new endpoint:** Must remove existing function first

---

## Cost Optimization

**Current:** ~$0.03-0.05/day (~$1-2/month)

**Optimizations:**
- Haiku 4.5 for simple tasks (earnings, earnings-play)
- 24h cache for stable data (ticker, earnings, sektor)
- Compressed system prompts (50-70% reduction)
- Article pre-filtering (historikk: 60% token reduction)
- Global daily cache (earnings: 4x cache hit improvement)

---

## Data Sources

- **Market data:** yahoo-finance2
- **News:** Anthropic web search
- **Insider trading:** SEC EDGAR API
- **Earnings data:** Alpaca API + web search
- **Historical data:** Alpaca News API

---

## Models Used

| Endpoint | Model | Rationale |
|----------|-------|-----------|
| sentiment | Sonnet 4.5 (`claude-sonnet-4-5-20250929`) | Multi-category synthesis |
| ticker | Sonnet 4.5 (`claude-sonnet-4-5-20250929`) | 5-layer analysis |
| insider | None | XML parsing only |
| earnings | Haiku 4.5 (`claude-haiku-4-5-20251001`) | Simple formatting |
| earnings-play | Haiku 4.5 (`claude-haiku-4-5-20251001`) | JSON transformation |
| sektor | Haiku 4.5 (`claude-haiku-4-5-20251001`) | Sector synthesis |
| radar | Haiku 4.5 (`claude-haiku-4-5-20251001`) | Trade setup analysis |
| gappers | Haiku 4.5 (`claude-haiku-4-5-20251001`) | Gap analysis |
| historikk | Haiku 4.5 (`claude-haiku-4-5-20251001`) | Timeline generation |
| quotes | None | Direct API |
| screener | Haiku 4.5 (`claude-haiku-4-5-20251001`) | Free-text case + web search |
| news-screener | Haiku 4.5 (`claude-haiku-4-5-20251001`) | Headline-driven discovery |

---

## Deployment

**Platform:** Vercel Serverless Functions

**Timeouts:**
- Most endpoints: 60s
- quotes: 10s
- sektor: 20s
- insider: 30s

**Auto-deploy:** Push to `main` branch triggers deployment

**Logs:** https://vercel.com/hanneslund2006/pulse/logs
