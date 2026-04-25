<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PULSE Roadmap</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');

  :root {
    --bg: #080c10;
    --surface: #0d1318;
    --border: #1a2430;
    --accent: #00d4ff;
    --accent2: #ff6b35;
    --accent3: #39ff14;
    --text: #e8edf2;
    --muted: #4a5a6a;
    --phase1: #00d4ff;
    --phase1b: #7b68ee;
    --phase2: #ff6b35;
    --phase3: #f7b731;
    --phase4: #39ff14;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Syne', sans-serif;
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Grid background */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  .container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 60px 32px;
    position: relative;
    z-index: 1;
  }

  header {
    display: flex;
    align-items: flex-end;
    gap: 24px;
    margin-bottom: 64px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 32px;
  }

  .logo {
    font-family: 'Space Mono', monospace;
    font-size: 52px;
    font-weight: 700;
    letter-spacing: -2px;
    background: linear-gradient(135deg, var(--accent), #0088ff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1;
  }

  .header-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 4px;
  }

  .header-label {
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 3px;
    text-transform: uppercase;
  }

  .header-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }

  /* Cost bar */
  .cost-strip {
    display: flex;
    gap: 16px;
    margin-bottom: 48px;
    flex-wrap: wrap;
  }

  .cost-chip {
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--muted);
    letter-spacing: 1px;
  }

  .cost-chip span {
    color: var(--accent3);
    font-weight: 700;
  }

  /* Phase layout */
  .phases {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 48px;
  }

  .phase {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 3px;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .phase:hover {
    border-color: var(--phase-color, var(--accent));
  }

  .phase-header {
    display: grid;
    grid-template-columns: 48px 1fr auto;
    align-items: center;
    gap: 16px;
    padding: 20px 24px;
    cursor: pointer;
    user-select: none;
  }

  .phase-num {
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--phase-color, var(--accent));
    opacity: 0.8;
  }

  .phase-title-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .phase-title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }

  .phase-sub {
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 1px;
  }

  .phase-tags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tag {
    font-family: 'Space Mono', monospace;
    font-size: 9px;
    padding: 3px 8px;
    border-radius: 1px;
    letter-spacing: 1px;
    border: 1px solid;
    opacity: 0.7;
  }

  .tag-low { border-color: var(--accent3); color: var(--accent3); }
  .tag-med { border-color: var(--accent2); color: var(--accent2); }
  .tag-high { border-color: #f7b731; color: #f7b731; }
  .tag-now { background: var(--phase-color, var(--accent)); color: var(--bg); border-color: transparent; opacity: 1; font-weight: 700; }

  .phase-body {
    padding: 0 24px 0 88px;
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.35s ease, padding 0.2s;
  }

  .phase.open .phase-body {
    max-height: 600px;
    padding: 0 24px 24px 88px;
  }

  .chevron {
    font-family: 'Space Mono', monospace;
    font-size: 12px;
    color: var(--muted);
    transition: transform 0.25s;
    grid-column: 3;
  }

  .phase.open .chevron {
    transform: rotate(180deg);
    color: var(--phase-color, var(--accent));
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid var(--border);
    padding-top: 20px;
  }

  .item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .item-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--phase-color, var(--accent));
    margin-top: 7px;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .item-text {
    font-size: 13px;
    line-height: 1.6;
    color: #8899aa;
  }

  .item-text strong {
    color: var(--text);
    font-weight: 600;
  }

  /* Criteria section */
  .criteria-block {
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent3);
    background: var(--surface);
    border-radius: 3px;
    padding: 28px 32px;
    margin-bottom: 24px;
  }

  .criteria-title {
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    letter-spacing: 3px;
    color: var(--accent3);
    margin-bottom: 20px;
    text-transform: uppercase;
  }

  .criteria-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .criterion {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .check {
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--border);
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
    border-radius: 1px;
  }

  .criterion-text {
    font-size: 12px;
    color: #7a8a9a;
    line-height: 1.5;
  }

  /* Progress tracker */
  .progress-track {
    display: flex;
    align-items: center;
    gap: 0;
    margin-bottom: 48px;
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .prog-phase {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .prog-node {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    flex-shrink: 0;
    position: relative;
  }

  .prog-node.active {
    border-color: var(--phase1);
    color: var(--phase1);
    box-shadow: 0 0 16px rgba(0,212,255,0.25);
  }

  .prog-node.active::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 1px solid rgba(0,212,255,0.2);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(1.3); }
  }

  .prog-line {
    height: 2px;
    width: 80px;
    background: var(--border);
    flex-shrink: 0;
  }

  .prog-label {
    position: absolute;
    top: 44px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Space Mono', monospace;
    font-size: 8px;
    color: var(--muted);
    white-space: nowrap;
    letter-spacing: 1px;
  }

  .prog-phase {
    position: relative;
    padding-bottom: 32px;
  }

  footer {
    border-top: 1px solid var(--border);
    padding-top: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .footer-note {
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 1px;
  }

  .footer-status {
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    color: var(--accent3);
    letter-spacing: 2px;
  }

  /* Phase color vars */
  .phase[data-phase="1"] { --phase-color: #00d4ff; }
  .phase[data-phase="1b"] { --phase-color: #7b68ee; }
  .phase[data-phase="2"] { --phase-color: #ff6b35; }
  .phase[data-phase="3"] { --phase-color: #f7b731; }
  .phase[data-phase="4"] { --phase-color: #39ff14; }

  @media (max-width: 600px) {
    .criteria-grid { grid-template-columns: 1fr; }
    .phase-header { grid-template-columns: 36px 1fr auto; }
    .phase-body { padding-left: 60px; }
    .prog-line { width: 40px; }
  }
</style>
</head>
<body>
<div class="container">

  <header>
    <div class="logo">PULSE</div>
    <div class="header-meta">
      <div class="header-label">Utviklingsveikart</div>
      <div class="header-title">Fra MVP til salgbart tradingverktøy</div>
    </div>
  </header>

  <!-- Progress -->
  <div class="progress-track">
    <div class="prog-phase">
      <div class="prog-node active">1
        <div class="prog-label">AKTIV</div>
      </div>
    </div>
    <div class="prog-line"></div>
    <div class="prog-phase">
      <div class="prog-node" style="border-color:#7b68ee44;color:#7b68ee44;">1B
        <div class="prog-label">QA</div>
      </div>
    </div>
    <div class="prog-line"></div>
    <div class="prog-phase">
      <div class="prog-node">2
        <div class="prog-label">AI</div>
      </div>
    </div>
    <div class="prog-line"></div>
    <div class="prog-phase">
      <div class="prog-node">3
        <div class="prog-label">SCALE</div>
      </div>
    </div>
    <div class="prog-line"></div>
    <div class="prog-phase">
      <div class="prog-node" style="border-color:#39ff1444;color:#39ff1444;">4
        <div class="prog-label">SALG</div>
      </div>
    </div>
  </div>

  <!-- Cost strip -->
  <div class="cost-strip">
    <div class="cost-chip">Normal dag: <span>&lt;$0.05</span></div>
    <div class="cost-chip">Dev-sesjon: <span>$0.10–0.20</span></div>
    <div class="cost-chip">Mnd-tak: <span>$3–5</span></div>
    <div class="cost-chip">Per bruker ved salg: <span>&lt;$0.10/dag</span></div>
  </div>

  <!-- Phases -->
  <div class="phases">

    <div class="phase open" data-phase="1">
      <div class="phase-header" onclick="toggle(this)">
        <div class="phase-num">F-01</div>
        <div class="phase-title-row">
          <div class="phase-title">Teknisk grunnlag</div>
          <div class="phase-sub">Null API-kostnad · Høy trading-verdi</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="phase-tags">
            <div class="tag tag-now">AKTIV NA</div>
            <div class="tag tag-low">LAV KOSTNAD</div>
          </div>
          <div class="chevron">v</div>
        </div>
      </div>
      <div class="phase-body">
        <div class="items">
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Setup-score 0–100</strong> — 7-lags alignment via Haiku, gir trader umiddelbar klarhet på oppsett-kvalitet</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Watchlist m/ live quotes</strong> — quotes.js med localStorage, null AI-kostnad</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Insider buy-feed</strong> — OpenInsider RSS, ingen API-kostnad, direkte alpha-signal</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Sektor 1M/3M trend</strong> — sektor.js, statisk beregning, null AI</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Sektor klikk-inn</strong> — 1 Haiku-kall per sektor ved klikk, ikke ved load</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>PULSE skill</strong> — arkitektur og fallgruver dokumentert for fremtidige sesjoner</div></div>
        </div>
      </div>
    </div>

    <div class="phase" data-phase="1b">
      <div class="phase-header" onclick="toggle(this)">
        <div class="phase-num">F-1B</div>
        <div class="phase-title-row">
          <div class="phase-title">Kvalitetssikring</div>
          <div class="phase-sub">Gate: MÅ passeres før PULSE er salgbart</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="phase-tags">
            <div class="tag tag-low">BLOCKER</div>
          </div>
          <div class="chevron">v</div>
        </div>
      </div>
      <div class="phase-body">
        <div class="items">
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Feilhåndtering</strong> — graceful degradation, aldri rå 500-feil til bruker</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Output-kvalitet</strong> — prompt-revisjon per endepunkt, kortere og handlingsrettet trader-språk</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Mobiloptimalisering</strong> — test og fiks på 390px. Ingen unntak</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Loading-states</strong> — spinner/skeleton på alle AI-kall, alltid</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Rate limit UX</strong> — tydelig melding, ikke stille krasj</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Juridisk disclaimer</strong> — "Ikke finansiell rådgivning" synlig på alle AI-analyse-sider</div></div>
        </div>
      </div>
    </div>

    <div class="phase" data-phase="2">
      <div class="phase-header" onclick="toggle(this)">
        <div class="phase-num">F-02</div>
        <div class="phase-title-row">
          <div class="phase-title">AI-drevet innsikt</div>
          <div class="phase-sub">Medium kompleksitet · Medium API-kostnad</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="phase-tags">
            <div class="tag tag-med">MEDIUM</div>
          </div>
          <div class="chevron">v</div>
        </div>
      </div>
      <div class="phase-body">
        <div class="items">
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Morgenbrief</strong> — 1-klikk daglig rapport, klar til markedsåpning</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Earnings play-ranker</strong> — ukentlig auto-ranking av kandidater rundt earnings</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Multi-modell analyse</strong> — OpenRouter, bull/bear/nøytral fra flere modeller</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Radar-logg</strong> — lagre daglige forslag med dato, sammenlign mot faktisk kurs etter 5/10 dager. Grunnlag for alpha-validering</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Konfidensindikator</strong> — Lav/Medium/Høy basert på antall datakilder som bekrefter retning</div></div>
        </div>
      </div>
    </div>

    <div class="phase" data-phase="3">
      <div class="phase-header" onclick="toggle(this)">
        <div class="phase-num">F-03</div>
        <div class="phase-title-row">
          <div class="phase-title">Personalisering og skalering</div>
          <div class="phase-sub">Kun etter 4+ uker stabil drift</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="phase-tags">
            <div class="tag tag-high">HØY KOMPLEKSITET</div>
          </div>
          <div class="chevron">v</div>
        </div>
      </div>
      <div class="phase-body">
        <div class="items">
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Brukerprofil</strong> — sektor-preferanser, risikoprofil, tidshorisont i localStorage</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Personalisert radar</strong> — filtrer kandidater mot brukerprofil, ikke generisk output</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Pris-alert system</strong> — QStash + Service Worker</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Brukerautentisering</strong> — kun ved salg eller deling til andre</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>claude-mem</strong> — sesjonminne på tvers, aktiver nar tid brukes pa re-forklaring av kontekst</div></div>
        </div>
      </div>
    </div>

    <div class="phase" data-phase="4">
      <div class="phase-header" onclick="toggle(this)">
        <div class="phase-num">F-04</div>
        <div class="phase-title-row">
          <div class="phase-title">Salg og distribusjon</div>
          <div class="phase-sub">Kun nar alle salgbarhetskriterier er oppfylt</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="phase-tags">
            <div class="tag" style="border-color:#39ff14;color:#39ff14;">ENDGAME</div>
          </div>
          <div class="chevron">v</div>
        </div>
      </div>
      <div class="phase-body">
        <div class="items">
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Oppsettguide</strong> — dokumentert for nye brukere: API-nøkler, Vercel, Upstash</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Onboarding-flow</strong> — ny bruker er oppe og kjorer uten støtte fra deg</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Prisstrategi</strong> — engangskjøp template vs månedlig SaaS. Besluttes ut fra markedstest</div></div>
          <div class="item"><div class="item-dot"></div><div class="item-text"><strong>Landingsside m/ demo</strong> — konverterende, viser verdi umiddelbart</div></div>
        </div>
      </div>
    </div>

  </div>

  <!-- Salgbarhetskriterier -->
  <div class="criteria-block">
    <div class="criteria-title">Salgbarhetskriterier — alle ma vaere oppfylt</div>
    <div class="criteria-grid">
      <div class="criterion"><div class="check">_</div><div class="criterion-text">Alle 7 sider fungerer feilfritt pa desktop og mobil</div></div>
      <div class="criterion"><div class="check">_</div><div class="criterion-text">Ingen ra feilmeldinger eksponert til bruker</div></div>
      <div class="criterion"><div class="check">_</div><div class="criterion-text">Loading-states pa alle AI-kall</div></div>
      <div class="criterion"><div class="check">_</div><div class="criterion-text">Juridisk disclaimer synlig i UI</div></div>
      <div class="criterion"><div class="check">_</div><div class="criterion-text">Radar-logg med min. 20 handelsdagers data</div></div>
      <div class="criterion"><div class="check">_</div><div class="criterion-text">Testet i egen trading-hverdag i min. 4 uker</div></div>
      <div class="criterion"><div class="check">_</div><div class="criterion-text">Datakvalitet validert — radar gir faktisk alpha</div></div>
      <div class="criterion"><div class="check">_</div><div class="criterion-text">Personalisering pa plass (Fase 3 komplett)</div></div>
    </div>
  </div>

  <footer>
    <div class="footer-note">PULSE · Hannes Lund · 2025</div>
    <div class="footer-status">STATUS: FASE 1 AKTIV</div>
  </footer>

</div>

<script>
  function toggle(header) {
    const phase = header.closest('.phase');
    phase.classList.toggle('open');
  }
</script>
</body>
</html>
