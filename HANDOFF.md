# PULSE — Handoff

**Dato:** 2026-04-28  
**Status:** Fase 2 — 100% komplett (multi-modell venter på OPENROUTER_API_KEY)

---

## Siste sesjon — 2026-04-28

### Fase 1B — sentiment.js fikset
- **Rotårsak:** `betas: ['web-search-2025-03-05']` er ikke et gyldig parameter i `messages.create()` i SDK 0.40. Web search er nå en first-class tool uten beta-header.
- **Fix:** Fjernet `betas`-parameteret og `max_uses: 3` fra tool-definisjonen.
- Verifisert: `POST /api/sentiment` → **200 OK** med gyldig JSON.
- Samme fix gjort i `api/radar.js` (hadde `max_uses: 3`).
- Commit: `ef25924`

### Fase 2 — AI-drevet innsikt (komplett)
Commit: `56c67f7`

**1. Morgenbrief (market.html)**
- Auto-fetcher rapport på load — ingen klikk nødvendig hvis ingen cache
- CTA-kortet vises fortsatt (fetchReport trigges automatisk)

**2. Radar-logg (radar.html)**
- Lagrer daglige radar-picks i `pulse_radar_log` localStorage med dato og pris
- Viser historikk under resultater: dato + picks + % endring fra radar-pris
- Grønn ✓ markerer picks som gikk riktig vei

**3. Earnings play-ranker**
- `api/earnings-ranker.js`: ukentlig auto-ranking via Haiku + web_search. Cache til søndag.
- `public/earnings-play.html`: rename fra earnings.html + ranker-seksjon øverst. Klikk på kandidat for å pre-fille ticker.

**4. Multi-modell analyse**
- `api/ticker-multimodel.js`: OpenRouter endpoint (GPT-4o Mini + Gemini Flash). Krever `OPENROUTER_API_KEY` i Vercel env.
- `ticker.html`: "ANDRE MODELLER"-seksjon vises automatisk etter analyse. Skjules gracefully ved 503 (nøkkel ikke satt).
- **Handling nødvendig:** Legg til `OPENROUTER_API_KEY` i Vercel → Settings → Environment Variables.

---

## Siste sesjon — 2026-04-28 (tidligere)

**Forside konsolidert (9 → 7 kort):**
- Fjernet: Earnings-kortet og Gappers-kortet fra forsiden
- Beholdt: Historikk som eget dedikert kort
- `earnings-play.html` href rettet (var feil lenke)
- Radar-kortets beskrivelse oppdatert
- Commit: `beec13f feat: konsolider forsiden til 7 kort`

---

## Fase 1 — Teknisk grunnlag

Alle Fase 1-bugs er lukket.

### Bug-rapport (siste sesjon)

**Bug 1 — Live-verifisering**
- `sentiment.js` POST → **500** med "Klarte ikke hente sentiment". Årsak: Anthropic `web-search-2025-03-05`-beta returnerer ukjent feil for dette API-oppsettet (ikke 401/429). Trenger debugging i Vercel-logger. Dette er **ikke** en kode-bug — selve endepunktet er riktig implementert. Sett som åpen observasjon for Fase 1B.
- `earnings-play.js` GET → **200 OK** på begge kall. Andre kall returnerte CACHE HIT (identisk respons). Fungerer korrekt.

**Bug 2 — cache-clear.js nøkkel**
- `api/cache-clear.js` bruker allerede `earnings:${ticker}:${today}` — konsistent med `earnings-play.js`. Den gamle nøkkelen `earnings_play2_${ticker}` er ikke tilstede. **Ingen endring nødvendig.**

**Bug 3 — Historikk årstall-bug**
- **Rotårsak:** Claude Haiku hallusinerte 2025-datoer fordi system-prompten manglet `today`-kontekst og ikke eksplisitt krevde verbatim-kopiering av datoene fra Alpaca-artiklene.
- **Fix:** Lagt til `Today is ${new Date().toISOString().slice(0,10)}` og `CRITICAL: copy dates VERBATIM from the [YYYY-MM-DD] prefix in each article` i system-prompten i `api/historikk.js` (linje 95).
- Commit: `4d377a7` — pushet til main, Vercel deploy trigget.
- **Frontend `formatDate()` er korrekt** — ingen timezone-feil.

---

## Neste steg — Fase 1B (QA Gate)

Blocker-krav før PULSE er salgbart:

- [ ] Debug `sentiment.js` 500 — sjekk Vercel-logger for faktisk Anthropic-feil
- [ ] Graceful degradation — aldri rå 500-feil til bruker
- [ ] Output-kvalitet — prompt-revisjon per endepunkt
- [ ] Mobiloptimalisering — test på 390px
- [ ] Loading-states — spinner/skeleton på alle AI-kall
- [ ] Rate limit UX — tydelig melding
- [ ] Juridisk disclaimer — synlig på alle AI-analyse-sider

---

## Stack

| Komponent | Teknologi |
|---|---|
| Frontend | Vanilla HTML/CSS/JS, Vercel |
| API | Node.js serverless (Vercel functions) |
| AI | Anthropic API (Haiku 4.5 + Sonnet 4.6) |
| Cache | Upstash Redis |
| Nyheter | Alpaca Markets REST API |
| Finansdata | yahoo-finance2 |
| Repo | github.com/hanneslund2006/pulse |
| Live | pulse-theta-wheat.vercel.app |
