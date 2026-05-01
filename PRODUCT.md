# Product

## Register

product

## Users

Aktiv swing-trader som åpner PULSE kl 07:00 i Oslo før US-markedet åpner. Vet hva VIX er. Leser priser, ikke markedsføring. Har 10 minutter på å danne seg et bilde av dagen — PULSE er et av verktøyene i den rutinen. Ingen onboarding, ingen forklaring av begreper, ingen SaaS-hilsener.

## Product Purpose

PULSE leverer strukturert markedsintelligens til swingtraders — sentiment, sektorstyrke, radar-kandidater, earnings-setup og aksjeanalyse på sekunder. Verktøy, ikke produkt. Informasjonen er alltid hovedpersonen; layout tjener tallene, ikke omvendt.

## Brand Personality

Terminal-presisjon. Rolig autoritet. Ingen support-vennlighet.

Tre ord: **skarp, funksjonell, tillitsvekkende**

Stemme: direkte og dataorientert. Ingen hilsener, ingen klisjeer, ingen unødvendige ord. Tallene snakker — grensesnittet er rammeverket rundt dem.

## Anti-references

- **Bloomberg Terminal** — for mye støy, blå/oransje-logikk, ikoner overalt
- **Generisk fintech SaaS** — navy-gradient bakgrunn, glassmorphism-kort, hero-metrics, "Analyser →"-knapper med gradient
- **Robinhood / Trading212** — konsumer-mykt, avrundet, varmt. Feil brukergruppe, feil tone
- **Startup-dashboard** — Space Mono brukt på alt, purple-on-dark som aksentfarge, identiske kortgrid med ikon + tittel + tekst

## Design Principles

1. **Data er protagonisten** — layout eksisterer for å presentere tall, ikke for å se designet ut. Farger, typografi og spacing skal gjøre data lettere å skanne, ikke mer imponerende.

2. **Farge bærer semantikk** — grønn = bullish/positiv, rød = bearish/negativ, amber = nøytral/advarsel. Ingen dekorativ fargebruk. Lilla er ikke en primærfarge; brukes kun der det ikke finnes semantisk alternativ.

3. **Monospace er et signal, ikke et valg** — Space Mono kun på: tickers, priser, datoer, prosenter, badge-tekst. DM Sans på alt annet. Bruker man Space Mono på seksjonstekst og knapper mister den sin funksjon som data-markør.

4. **Distinkt over sikker** — unngå finance → navy-refleksen. Designvalg skal ikke kunne gjentas fra produktkategorien alene. Spør "Kan noen gjette paletten fra kategorinavnet?" — svaret skal være nei.

5. **Hvert element tjener seg inn** — dekorative elementer (glassmorphism-blur, side-stripe-borders, glow-effekter, tomme pseudo-elementer) fjernes med mindre de bærer informasjon. Ingen `backdrop-filter` som standard, ingen `border-left` som kortaksent.

## Accessibility & Inclusion

WCAG AA minstekrav. Fargesemantikk må ikke være eneste signal — bruk alltid tekst-label i tillegg til farge (f.eks. "BULLISH" som tekst, ikke kun grønn farge). Støtt prefers-reduced-motion der animasjoner finnes.
