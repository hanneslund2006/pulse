# PULSE — Handoff

## Dato
29. mai 2026

## Gjeldende HEAD
2c4dd6b

## Session Work (2026-05-29) — Sektorer + Screener Unified Page

### Changes
- **`public/sektorer.html` (NEW)** — Merged sektor.html + screener.html into one unified page. Top section: 11 SPDR sector panels (expandable, AI analysis). Bottom section: screener with free-text thesis textarea. `handoffToScreener()` function wired to "SCREEN STOCKS IN [NAME] →" CTA in each sector panel — scrolls page to screener section and pre-fills textarea with sector name.
- **`public/sektor.html`** — Replaced with meta-refresh redirect to sektorer.html. Keeps old bookmarks/links working.
- **`public/screener.html`** — Deleted. No remaining references anywhere in the codebase.
- **`public/index.html`** — Workflow pair (STEP 01 sektor + STEP 02 screener) replaced with single "Sectors + Screener" card linking to sektorer.html.
- **All 7 other pages** — Keyboard shortcut C updated from screener.html to sektorer.html.

### Naming conflicts resolved in sektorer.html
- Fetch state: `sektorFetching` / `screenerFetching` (separate flags, no collision)
- Button IDs: `sector-fetch-btn` / `screener-fetch-btn`
- Output containers: `sector-output` / `screener-output`
- Error toast scope: separate `showSectorError()` / `showScreenerError()` helpers

### Commits (7 pushed)
All pushed to origin/main. Vercel auto-deploy triggered. HEAD: 2c4dd6b.

### Deploy
Deploy guard passed all 5 layers. No new API functions — still 12/12 Vercel Hobby limit.

### Verify
1. Open sektorer.html — fetch sectors, click a sector panel, verify "SCREEN STOCKS IN [NAME] →" CTA scrolls to screener and pre-fills textarea
2. Open sektor.html — should redirect to sektorer.html
3. Press C on market.html — should navigate to sektorer.html

## Neste sesjon starter med
- Validate sektorer.html handoff flow end-to-end in browser (all 11 sectors)
- Consider adding "STEP 03: LOG YOUR TRADE" CTA to complete the morning workflow loop (logg.html)
- CLAUDE.md "Current State" block still references ddc3066 and old sektor/screener split — update if CLAUDE.md edit is in scope

---

## Session Work (2026-05-29) — Sektor + Screener Workflow Integration

### Changes
- **`public/index.html`** — Added "MORNING WORKFLOW" section to landing page. Two co-located CTAs: STEP 01 links to sektor.html, STEP 02 links to screener.html. Presents the two-step workflow explicitly to new and returning users.
- **`public/sektor.html`** — Expanded sector panels now include "SCREEN STOCKS IN [SECTOR] →" CTA. Links to `screener.html?sector=SectorName` with exact sector name as URL param.
- **`public/screener.html`** — Reads `?sector=` URL param on load. Pre-fills the textarea with "strong stocks in the [Sector] sector" so user lands with a ready-to-run query.
- **`API.md`** — Fixed stale gappers TTL (4h → 30min). Matches the intentional `1800s` in `gappers.js`.
- **`CLAUDE.md`** — Updated "Current State" block: date 2026-05-29, HEAD ddc3066, summary of workflow work.

### Commits
- `ddc3066` feat: wire Sektor and Screener as two-step morning workflow
- `0f6be04` docs: fix stale gappers TTL in API.md (30min, not 4h)
- `9ffc9b7` docs: update CLAUDE.md current state for workflow integration

### Deploy
Deploy guard passed all 5 layers. Pushed to origin/main. Vercel auto-deploy triggered.
No new API functions — still 12/12 Vercel Hobby limit.

### Uncommitted .claude/ work (from prior sessions — not this session)
The following are tracked as untracked/modified in git but intentionally left uncommitted (project-level tooling, not source code):
- `.claude/commands/deploy.md` (modified)
- `.claude/rules/pulse.md` (modified)
- `.claude/agents/` (new)
- `.claude/commands/check-ttl.md` (new)
- `.claude/commands/pre-ship.md` (new)
- `.claude/hooks/` (new)
- `.claude/settings.json` (new)
- `.claude/skills/new-endpoint/` (new)
- `.mcp.json` (new)
- `scripts/` (new)

---

## Session Work (2026-05-28) — Automation Layer

### New skills
- **`.claude/skills/new-endpoint/SKILL.md` (NEW)** — User-only skill (`/new-endpoint`). 9-step procedure for adding a new `api/*.js` endpoint correctly: function count check, Redis key naming convention, TTL selection table, `{data, error, cached}` contract, model selection (Haiku vs Sonnet), `vercel.json` entry, CLAUDE.md documentation, and final verification commands.

### New agents
- **`.claude/agents/pulse-frontend-qa.md` (NEW)** — Subagent that reads all 10 HTML files in `public/` and flags deviations from the PRODUCT.md design contract. Checks typography (Cormorant/Space Mono/DM Sans usage), color semantics (green=bullish, red=bearish, amber=neutral), banned patterns (backdrop-filter, gradient text, glassmorphism), animation rules (transform+opacity only), missing nav/footer/shortcut-overlay, Norwegian copy, and missing Vercel Analytics scripts. Returns BLOCK/WARN/NOTE findings per page.

### New hooks
- **`.claude/hooks/api-contract-guard.js` (NEW)** — PostToolUse: non-blocking advisory after any Edit/Write on `api/*.js`. Detects `res.json()` calls missing `error` or `cached` fields. Does not block (exit 0) — surfaces findings to stderr.
- **`.claude/hooks/function-count-guard.js` (NEW)** — PostToolUse: counts non-`_`-prefixed `.js` files in `api/` after any write. Blocks (exit 1) if count exceeds 12 (Vercel Hobby limit). Warns at exactly 12. Currently at 12/12.
- **`.claude/settings.json` updated** — Added both hooks to PostToolUse `Edit|Write` matcher alongside existing `web-search-guard.js`.

### MCP servers
- **`.mcp.json` (NEW)** — Upstash Redis MCP (`@upstash/mcp-server`) registered at project scope via `claude mcp add --scope project`. Env vars reference `${KV_REST_API_URL}` and `${KV_REST_API_TOKEN}` from existing Vercel env config. Activate with `claude mcp list` to verify. Lets you inspect Redis keys, TTLs, and cache hit-rate directly from conversation.

---

## Session Work (2026-05-28) — Pre-ship Gate + Vercel Audit Hook

- **`.claude/hooks/vercel-audit-guard.js` (NEW)** — PreToolUse hook: intercepts any Bash command containing "vercel", runs `npm audit --audit-level=high` from project root, blocks deploy (exit 1) if high/critical CVEs found. Fails open on timeout/network errors so network issues never block deploy.
- **`.claude/settings.json` updated** — Added `PreToolUse` block wiring `vercel-audit-guard.js` to all Bash tool calls (matcher: Bash, timeout: 35s). Preserved existing `permissions.defaultMode: bypassPermissions`, `PostToolUse: web-search-guard.js`, and `Stop: stop-console-log-check.js`.
- **`.claude/commands/pre-ship.md` (NEW)** — `/pre-ship` command: spawns `gsd-code-reviewer` + `security-auditor` in parallel against `api/`, merges findings into a GO/NO-GO table, blocks on any BLOCKER or 3+ WARNINGs, and requires `.claude/_system/plans/rollback-plan.md` to exist before confirming GO.
- **`.claude/commands/deploy.md` updated** — Added mandatory prerequisite block at top: `/pre-ship` must return `PRE-SHIP PASSED` before `/deploy` proceeds, whenever `api/` files have been added or modified. `public/`-only changes skip the prerequisite.

## Session Work (2026-05-28) — Security Audit Fixes

- **pulse/.claude/settings.json created** — PostToolUse: web-search-guard.js (warns if Anthropic endpoint has no web_search tool); Stop: stop-console-log-check.js (scans api/ for console.log on session end)
- **pulse/.claude/hooks/web-search-guard.js** — non-blocking warning when AI endpoint lacks web_search
- **pulse/.claude/hooks/stop-console-log-check.js** — writes findings to _system/plans/console-log-warnings.md
- **pulse.md model rule updated** — claude-sonnet-4-5-20250514 → claude-sonnet-4-6; removed "max_tokens always 4096" → "see CLAUDE.md for per-endpoint values"
- CLAUDE.md model strings (claude-sonnet-4-5-20250929) not changed — those are the authoritative per-endpoint values; pulse.md now defers to CLAUDE.md

## AgentShield-skanning (2026-05-27)

`npx ecc-agentshield scan` kjørt mot `.claude/`. Resultat: **Grade A (99/100)** — 0 critical, 0 high, 0 medium, 6 low.

Alle low-funn er ECC 2.0 skill-metadata (observation hooks, versjon, rollback) for de 3 kommandoene check-ttl, deploy og review. Disse er ikke aktive runtime-risikoer og krever ingen umiddelbar aksjon. Kan adresseres når/hvis ECC 2.0 self-improvement blir aktuelt.

Rapporter lagret i `.claude/_system/plans/agentshield-pulse-rapport.md`.

---

## Teknisk kontekst
- Stack: Vanilla JS, Node.js serverless, Vercel, Upstash Redis
- Start alltid: cd C:\Users\Hannes\projects\pulse && claude
- Modell: /model claude-sonnet-4-5 hvis 1M context-feil dukker opp
- Ikke compact før jobben er ferdig

## Kostnadsmål
- **Etter optimalisering:** ~$0.03-0.05/dag (50-60% reduksjon vs baseline)
- **Månedlig:** $1-2
- **Target nådd:** Ja
