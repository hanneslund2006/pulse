# PULSE Feature Backlog

## Implementert
- [x] Feature 1: Teknisk lag i ticker (SMA/EMA/trend)
- [x] Feature 2: Gappers SMA-filter
- [x] Feature 3: R/R-kalkulator

## Gjenstående (prioritert rekkefølge)

### #4 — Setup-score 0–100
Kombiner teknisk data + AI-lag til vektet score 0-100. Under 60 = ikke trade.
Krever Feature 1 implementert. Ett lite Haiku-kall for scoring.
Filer: api/ticker.js

### #5 — Watchlist med live quotes
Persistent watchlist med auto-refresh hvert 60s via quotes.js.
Filer: api/quotes.js, frontend

### #6 — Morgenbrief
Én-klikk daglig rapport: aggreger sentiment + radar + gappers + earnings.
Filer: Nytt /api/brief endepunkt

### #7 — Earnings play-ranker
Automatisk ukentlig ranker basert på EPS beat-rate × implied move × teknisk posisjon.
Filer: api/earnings.js, api/earnings-play.js, nytt /api/earnings-ranker

### #8 — Insider buy-feed (ekte data)
Erstatt Haiku-scraping av insider med OpenInsider RSS-feed per ticker. Null Anthropic-kostnad, mer pålitelig data.
Filer: api/ticker.js

### #9 — Sektor-rotasjon 1M/3M
Legg til 1-måneds og 3-måneds endring i eksisterende sektor.js. Samme Yahoo Finance-kall, utvidet tidsperiode.
Filer: api/sektor.js

### #10 — Pris-alert system
Alert når ticker treffer et nivå. Krever Upstash QStash for polling + browser Service Worker for push.
Filer: Nytt /api/alerts endepunkt, frontend Service Worker
