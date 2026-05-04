# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PULSE is an AI-driven market sentiment tool for swing traders. Delivers structured market intelligence — sentiment scores, sector analysis, radar candidates, earnings setups, and stock analysis in seconds. Built for active traders who need fast, precise market reads before US market open (07:00 Oslo time).

**Users:** Active swing traders who know VIX, read prices not marketing, have 10 minutes to form market view. No onboarding, no jargon explanations, no SaaS greetings.

**Tech Stack:**
- Frontend: Vanilla HTML/CSS/JS (no framework)
- Backend: Vercel serverless functions (/api)
- AI: Anthropic Claude Sonnet 4.5 with web_search tool
- Data: yahoo-finance2 for market quotes
- Cache: Two-tier (in-memory + Upstash Redis)
- Rate limiting: File-based, 10 calls/hour/IP

## Development Commands

```bash
# Local development server (Vercel dev)
npm run dev

# Deploy to production
npm run deploy

# Local dev without Vercel CLI (simple HTTP server)
npx http-server public -p 3000
```

**Environment variables (required for production):**
- `ANTHROPIC_API_KEY` — Claude API key
- `KV_REST_API_URL` — Upstash Redis URL
- `KV_REST_API_TOKEN` — Upstash Redis token

Local dev works without Redis (falls back to in-memory cache only).

## Architecture

### Frontend Structure (/public)

9 HTML pages, each self-contained with inline CSS and JS:
- `index.html` — Landing page with hero, "how it works" section, features overview
- `market.html` — Daily market sentiment with 0-100 score
- `ticker.html` — Single stock analysis (5-layer: news, earnings, insider, short, sentiment)
- `sektor.html` — Sector performance analysis
- `radar.html` — Auto-screener for high-momentum candidates
- `earnings-play.html` — Earnings setup analyzer
- `logg.html` — Trade logging
- `historikk.html` — Trade history
- `gappers.html` — Pre-market gap scanner

**Shared frontend modules:**
- `public/live.js` — Live market data ticker (top rail, auto-refreshing quotes)
- `public/bg.js` — Background grid animation

**Design constraints (enforced by PRODUCT.md):**
- Terminal-precision aesthetic — sharp, functional, trustworthy
- No glassmorphism, gradient text, or side-stripe borders
- Cormorant Garamond for display headings
- Space Mono for data (tickers, prices, percentages)
- DM Sans for body text
- Colors carry semantic meaning: green=bullish, red=bearish, amber=neutral
- Purposeful animation only (no decorative effects)

### Backend Structure (/api)

Vercel serverless functions. Each endpoint is a separate file:

**Main features:**
- `sentiment.js` — Daily market sentiment (score 0-100, category analysis)
- `ticker.js` — Single stock 5-layer analysis
- `ticker-multimodel.js` — Multi-model consensus (Opus + Sonnet)
- `earnings.js` — EPS history and expected volatility
- `earnings-play.js` — Earnings setup scoring
- `earnings-ranker.js` — Rank upcoming earnings by momentum
- `radar.js` — Auto-screener (high short float + fresh catalyst)
- `sektor.js` — Sector performance relative strength
- `quotes.js` — Yahoo Finance quote proxy
- `gappers.js` — Pre-market gap scanner
- `historikk.js` — Trade history retrieval
- `cache-clear.js` — Manual cache invalidation endpoint

**Shared utilities:**
- `_cache.js` — Two-tier caching (in-memory + Redis)
  - In-memory: Fast, works within warm lambda instance
  - Redis: Cross-instance sharing, requires env vars
  - Falls back to memory-only in local dev
  - TTL-based expiry, `nextMidnightTTL()` helper for daily data

- `_ratelimit.js` — IP-based rate limiting
  - 10 calls per hour per IP (configurable via MAX_CALLS)
  - File-based state in /tmp (serverless-compatible)
  - Sliding window algorithm

**AI Integration Pattern:**

All AI endpoints follow this structure:
```javascript
const Anthropic = require('@anthropic-ai/sdk');
const { check: rateCheck } = require('./_ratelimit');
const cache = require('./_cache');

module.exports = async (req, res) => {
  // 1. Rate limit check
  const limited = rateCheck(req);
  if (limited) return res.status(429).json({ error: 'Rate limit', ...limited });

  // 2. Cache check
  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  // 3. Call Anthropic with structured prompt
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,  // Structured JSON response format
    messages: [{ role: 'user', content: userQuery }],
    tools: [{ type: 'web_search_grounding_beta', search_url: 'auto' }]
  });

  // 4. Parse and cache result
  const result = JSON.parse(response.content[0].text);
  cache.set(cacheKey, result, ttlSeconds);
  res.json(result);
};
```

**Critical:** All AI prompts enforce strict JSON output with exact structure. No markdown, no preamble, no asterisks in text fields. Sentiment values are enum: "Bullish", "Bearish", "Mixed", "Avvent".

## Key Implementation Patterns

### Caching Strategy

- **Sentiment data:** Cache until midnight Oslo time (`nextMidnightTTL()`)
- **Ticker analysis:** Cache 5 minutes (data changes frequently)
- **Earnings data:** Cache 1 hour (relatively static during day)
- **Quotes:** No cache (always fresh)

### Error Handling

All API endpoints return structured errors:
```javascript
{ error: 'Human-readable message', details: 'Technical details' }
```

HTTP status codes:
- 429: Rate limited
- 400: Bad request (missing params)
- 500: Server error (AI failure, API timeout)

Frontend shows error toasts via `showErrorToast(message)` function in each HTML page.

### Live Data Updates

- Market strip (hero section): Updates every 30 seconds via `initMarketStrip()`
- Ticker rail (top nav): Scrolling animation, data from `/api/quotes`
- Content validation prevents partial data display (e.g., "BTC-" instead of "BTC $98,500")

## Design System Constraints

**Spacing scale (enforced):**
- Micro: 8px
- Small: 24px, 32px, 36px
- Medium: 40px, 48px, 56px, 64px
- Large: 80px, 100px

**Typography scale:**
- Hero title: `clamp(64px-96px)` Cormorant Garamond 700
- Section headings: `clamp(32px-44px)` Cormorant Garamond 700
- Data labels: 9-11px Space Mono
- Data values: 14px Space Mono bold
- Body text: 13-16px DM Sans

**Animation rules:**
- GPU-accelerated only (transform + opacity, NO layout properties)
- Easing: cubic-bezier(0.16,1,0.3,1) or ease-out variants
- Duration: 150-600ms
- Must support `prefers-reduced-motion: reduce`

**Absolute bans:**
- Side-stripe borders (`border-left` > 1px as accent)
- Gradient text (`background-clip: text`)
- Glassmorphism (except rare, purposeful use)
- Hero-metric template (big number + gradient)
- Identical card grids

## File Modification Rules

1. **HTML pages:** All CSS inline in `<style>` tag, all JS inline or in `<script>` tag
2. **No separate CSS files:** Design is embedded in each HTML page
3. **API endpoints:** Each is a standalone serverless function, no shared router
4. **HANDOFF.md:** Update after every significant session with date, commit hash, and changes
5. **PRODUCT.md:** Design principles and brand guidelines — don't modify without user approval

## Common Pitfalls

- **Don't cache quotes endpoint** — always fresh data needed
- **Don't skip rate limiting** — prevents API cost overruns
- **Don't use .env locally** — Vercel dev handles env vars via vercel.json
- **Don't modify card-viz animations** — complex SVG animations, fragile
- **Don't add backdrop-filter** — banned per design system
- **Don't use `--` for em dashes** — replace with commas, colons, semicolons, or periods

## Testing Locally

1. Start dev server: `npm run dev`
2. Visit `http://localhost:3000`
3. Test without Redis: Works with in-memory cache only
4. Test rate limiting: Make 10+ requests to same endpoint within an hour
5. Test AI responses: Check `/api/sentiment` returns valid JSON structure

## Current State (Last Updated)

- **Date:** 2026-05-04
- **HEAD:** 7993561 (docs: update HANDOFF.md)
- **Recent work:**
  - DOM restructure: LIVE pill moved into DXY tile (semantically correct)
  - Spacing fixes: 56px hero→hiw, 40px between steps, 48px hiw→features
  - Removed "Se alle verktøy" link from how-it-works section
  - "Slik fungerer det" 3-step section with animated visuals
- **Model:** Claude Sonnet 4.5 (standard context, not 1M)
- **Deployment:** Live at pulse-theta-wheat.vercel.app
