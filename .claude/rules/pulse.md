# PULSE Rules

## Deploy
- Never run `vercel --prod` without first running /deploy
- If /deploy returns FAIL, stop and fix before any push
- After any redesign or HTML change, /deploy is mandatory — not optional

## Code review
- Run /review before committing any changes to /api endpoints
- Run /review after any frontend change that touches more than one HTML file

## API endpoints
- All new endpoints must follow the request flow: rate limit → cache → Claude call → parse → cache → return
- Model is always claude-sonnet-4-5-20250514 — never change without explicit instruction
- max_tokens is always 4096 for AI endpoints
- web_search_grounding_beta must be included in all AI endpoints unless explicitly excluded

## Design
- No glassmorphism, gradient text, or side-stripe borders — ever
- New UI elements must use semantic colors: green=bullish, red=bearish, amber=neutral
- Animations: transform + opacity only — no layout-triggering properties

## Cache
- Do not change TTL values without updating CLAUDE.md
- quotes.js is always cache-free — never add caching here

## Environment
- Any new env var must be added to .env.example immediately
- Document new vars in CLAUDE.md under environment section
