# PULSE Utviklingsveikart

## Fase 1 — Teknisk grunnlag (nå)
Null API-kostnad · Lav kompleksitet · Høy trading-verdi

- Setup-score 0–100 (7-lags alignment, Haiku)
- Watchlist med live quotes (quotes.js, localStorage)
- Insider buy-feed (OpenInsider RSS, null AI-kostnad)
- Sektor 1M/3M trend (sektor.js, null AI)
- Sektor klikk-inn (Haiku, 1 kall per sektor)
- PULSE skill (arkitektur og fallgruver dokumentert)

## Fase 1b — Kvalitetssikring (før Fase 2)
Må være på plass før PULSE er salgbart

- Feilhåndtering: graceful degradation på alle endepunkter
  (fallback-melding ved API-feil, ikke rå 500-feil til bruker)
- Output-kvalitet: prompt-revisjon per endepunkt —
  kortere, mer handlingsrettet, trader-språk
- Mobiloptimalisering: test og fiks layout på 390px skjerm
- Loading-states: spinner/skeleton på alle AI-kall
- Rate limit UX: tydelig melding når grensen er nådd
- Juridisk disclaimer: "Ikke finansiell rådgivning" synlig i UI
  på alle sider som gir AI-generert analyse

## Fase 2 — AI-drevet innsikt og datakvalitet
Medium kompleksitet · Medium API-kostnad

- Morgenbrief (1-klikk daglig rapport)
- Earnings play-ranker (ukentlig auto-ranking)
- Multi-modell analyse (OpenRouter, bull/bear/nøytral)
- Radar-logg: lagre daglige radar-forslag med dato,
  sammenlign mot faktisk kursutvikling etter 5/10 dager
  (enkel tabell i Logg-siden — grunnlag for å validere
  om radar faktisk gir alpha)
- Datakvalitetssjekk: legg til konfidensindikator på
  ticker-analyse — "Lav/Medium/Høy" basert på antall
  datakilder som bekrefter samme retning

## Fase 3 — Personalisering og skalering
Høy kompleksitet · Kun når PULSE er stabilt 4+ uker

- Brukerprofil: sektor-preferanser, risikoprofil,
  tidshorisont lagret i localStorage
- Personalisert radar: filtrer kandidater basert på
  brukerprofil — ikke generisk for alle
- Pris-alert system (QStash + Service Worker)
- Brukerautentisering (kun ved salg/deling)
- claude-mem (sesjonminne på tvers)

## Fase 4 — Salg og distribusjon
Kun når alle kriterier under er oppfylt

- Dokumentert oppsettguide (API-nøkler, Vercel, Upstash)
- Onboarding-flow for nye brukere
- Prisstrategi: engangskjøp template vs månedlig SaaS
- Landingsside med demo

## Salgbarhetskriterier
Alle må være oppfylt før PULSE selges:

- Alle 7 sider fungerer feilfritt på desktop og mobil
- Ingen rå feilmeldinger eksponert til bruker
- Loading-states på alle AI-kall
- Juridisk disclaimer synlig i UI
- Radar-logg med minimum 20 handelsdagers data
- Testet i egen trading-hverdag i minimum 4 uker
- Datakvalitet validert — radar gir faktisk alpha
- Personalisering på plass

## Kostnadsmål
- Normal handelsdag (med cache): under $0.05
- Utviklingssesjon: $0.10–0.20 akseptabelt
- Månedlig tak: $3–5 i drift
- OpenRouter: kun Fase 2 multi-modell
- Skaleringsmål ved salg: under $0.10 per bruker per dag
