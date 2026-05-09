---
name: deploy
description: Pre-deploy checklist for PULSE before pushing to Vercel
user-invocable: true
---

Run a full pre-deploy verification of PULSE before any Vercel push.

## Step 1: Visual/HTML integrity
- Read all 9 HTML files in /public
- Confirm shared modules (live.js, bg.js) are referenced correctly in each file
- Check that no inline CSS violates design constraints:
  - No glassmorphism, gradient text, or side-stripe borders
  - Semantic colors: green=bullish, red=bearish, amber=neutral
  - GPU-accelerated animations only (transform + opacity)
- Flag any file that deviates

## Step 2: API endpoint inventory
- List all files in /api
- For each endpoint confirm:
  - Rate limit check is present (_ratelimit.js import)
  - Cache logic is present (_cache.js import) where expected
  - Response is structured JSON (no raw markdown output)
  - Error handling exists (try/catch with meaningful error response)

## Step 3: Environment variables
- Read vercel.json and any .env.example
- List every env var the codebase references
- Flag any that are missing from .env.example or likely missing in Vercel dashboard

## Step 4: Cache strategy audit
- Confirm TTL values match documented strategy:
  - sentiment.js: until midnight Oslo
  - ticker.js: 5 minutes
  - sektor.js: 1 hour
  - quotes.js: no cache
- Flag any mismatch

## Step 5: Final verdict
Output a clear PASS / FAIL with a list of issues found.
If PASS: confirm it is safe to run `vercel --prod`
If FAIL: list exact files and lines to fix before deploying
