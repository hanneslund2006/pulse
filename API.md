# PULSE API Documentation

## Overview
PULSE provides 12 serverless API endpoints for market sentiment analysis, insider trading data, earnings analysis, and trading tools.

**Base URL:** `https://pulse-theta-wheat.vercel.app`

**Rate Limiting:** 25 requests/hour per IP (all endpoints except quotes)

**Caching:** Redis-backed with in-memory fallback

---

## Endpoints

### 1. Market Sentiment
**GET** `/api/sentiment`

Returns daily market overview with sentiment analysis across 4 categories.

**Response:**
```json
{
  "makro": { "signal": "BULLISH", "summary": "..." },
  "tech": { "signal": "BEARISH", "summary": "..." },
  "energi": { "signal": "NEUTRAL", "summary": "..." },
  "enkeltaksjer": { "signal": "BULLISH", "summary": "..." }
}
```

**Cache:** 6 hours  
**Model:** Sonnet 4.5 (55-word system prompt)

---

### 2. Ticker Analysis
**GET** `/api/ticker?ticker=AAPL`

5-layer sentiment analysis for individual stock.

**Parameters:**
- `ticker` (required): Stock symbol (1-6 chars, uppercase)

**Response:**
```json
{
  "ticker": "AAPL",
  "layers": {
    "trend": { "verdict": "BULLISH", "rationale": "..." },
    "fundamentals": { "verdict": "NEUTRAL", "rationale": "..." },
    "news": { "verdict": "BEARISH", "rationale": "..." },
    "technicals": { "verdict": "BULLISH", "rationale": "..." },
    "options": { "verdict": "NEUTRAL", "rationale": "..." }
  }
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

**Required env var:** `SEC_USER_AGENT` (SEC blocks requests without User-Agent)

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

**Cache:** 24 hours (global, not per-ticker)  
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

**Cache:** 24 hours  
**Model:** Haiku 4.5

---

### 6. Sector Analysis
**GET** `/api/sektor?sektor=tech` or `/api/sektor?ticker=AAPL`

Sector sentiment or ticker's sector context.

**Parameters:**
- `sektor` (optional): "TECH", "ENERGI", "FINANS", "HELSE"
- `ticker` (optional): Stock symbol

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

**Model:** Sonnet 4.5

---

### 7. Radar
**GET** `/api/radar`

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

**Cache:** 6 hours  
**Model:** Sonnet 4.5

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

**Cache:** 1 hour (volatile data)  
**Model:** Sonnet 4.5

---

### 9. Historical Analysis
**GET** `/api/historikk?ticker=AAPL&months=1`

AI-generated timeline of price catalysts.

**Parameters:**
- `ticker` (required): Stock symbol
- `months` (optional): 1 or 3 (default: 1)

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
**Model:** Sonnet 4.5  
**Pre-filtering:** 15 keywords (earnings, analyst, revenue, etc.)  
**Token optimization:** 60% reduction via article filtering

---

### 10. Quotes
**GET** `/api/quotes`

Real-time index quotes (SPX, NDX, DXY, BTC, 10Y).

**Response:**
```json
{
  "SPX": { "price": 5234.56, "change": "+1.2%" },
  "NDX": { "price": 18234.12, "change": "+0.8%" },
  "DXY": { "price": 101.23, "change": "-0.3%" },
  "BTC": { "price": 63421.00, "change": "+2.1%" },
  "10Y": { "yield": 4.32, "change": "+0.05" }
}
```

**Cache:** 60 seconds  
**Model:** None (yahoo-finance2 library)  
**Rate limit:** None (high-frequency endpoint)

---

### 11. Analytics Dashboard
**GET** `/api/analytics-dashboard`

Internal analytics (requires auth).

**Headers:**
- `x-analytics-key`: Must match `ANALYTICS_SECRET` env var

**Response:**
```json
{
  "sentiment": { "2026-05-11": 42 },
  "ticker": { "2026-05-11": 156 },
  "insider": { "2026-05-11": 23 }
}
```

**Cache:** None (real-time)  
**Security:** 401 if auth header missing/wrong

---

### 12. Cache Clear
**GET** `/api/cache-clear?ticker=AAPL`

Manually clear cache for a ticker (all endpoints).

**Parameters:**
- `ticker` (required): Stock symbol

**Response:**
```json
{
  "ok": true,
  "deleted": [
    "earnings:AAPL:2026-05-11",
    "insider_AAPL",
    "sec_cik_AAPL"
  ]
}
```

**Keys cleared:**
- `earnings:${ticker}:${today}`
- `insider_${ticker}`
- `sec_cik_${ticker}`

---

## Environment Variables

### Required
- `ANTHROPIC_API_KEY` — Claude API key (all AI endpoints)
- `SEC_USER_AGENT` — SEC EDGAR User-Agent (insider endpoint)

### Optional
- `KV_REST_API_URL` — Upstash Redis URL (falls back to in-memory)
- `KV_REST_API_TOKEN` — Upstash Redis token
- `ALPACA_API_KEY` — Alpaca API (historikk endpoint)
- `ALPACA_API_SECRET` — Alpaca secret
- `ANALYTICS_SECRET` — Auth key for analytics dashboard

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
| sentiment | Sonnet 4.5 | Multi-category synthesis |
| ticker | Sonnet 4.5 | 5-layer analysis |
| insider | None | XML parsing only |
| earnings | Haiku 4.5 | Simple formatting |
| earnings-play | Haiku 4.5 | JSON transformation |
| sektor | Sonnet 4.5 | Sector synthesis |
| radar | Sonnet 4.5 | Trade setup analysis |
| gappers | Sonnet 4.5 | Gap analysis |
| historikk | Sonnet 4.5 | Timeline generation |
| quotes | None | Direct API |

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
