/**
 * live.js — Shared module for all PULSE pages
 * Handles: scrolling price ticker bar + market status indicator
 * Exports: window.PULSE_QUOTES (resolved quotes array for other scripts to use)
 */
(function () {
  'use strict';

  const DEFAULT_SYMS = ['^GSPC', '^NDX', '^DJI', '^VIX', 'DX-Y.NYB', 'GC=F', 'BTC-USD'];

  // ── Inject shared CSS ────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* Ticker rail */
    .t-rail {
      position: fixed; top: 0; left: 0; right: 0; z-index: 200;
      height: 32px; background: #090909;
      border-bottom: 0.5px solid #1e1e28;
      display: flex; align-items: center; overflow: hidden;
    }
    .t-scroll { flex: 1; overflow: hidden; min-width: 0; }
    .t-track {
      display: flex; white-space: nowrap; width: max-content;
      animation: t-scroll 60s linear infinite;
    }
    .t-scroll:hover .t-track { animation-play-state: paused; }
    @keyframes t-scroll {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }
    .t-item {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 0 16px; border-right: 0.5px solid #1a1a22;
      font-family: 'Space Mono', monospace;
      font-size: 10px; letter-spacing: 0.05em; height: 32px;
    }
    .ti-sym  { color: #555; }
    .ti-val  { color: #e0e0e0; }
    .ti-up   { color: #1D9E75; }
    .ti-dn   { color: #E24B4A; }
    .ti-vix  { color: #BA7517; }

    /* Market status (right side of rail) */
    .t-status {
      flex-shrink: 0; display: flex; align-items: center; gap: 7px;
      padding: 0 14px; border-left: 0.5px solid #1e1e28;
      font-family: 'Space Mono', monospace;
      font-size: 9px; letter-spacing: 0.12em; white-space: nowrap;
    }
    .ts-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: currentColor; flex-shrink: 0;
    }
    .ts-time { opacity: 0.45; margin-left: 2px; }
    .ts-open  { color: #1D9E75; }
    .ts-amber { color: #BA7517; }
    .ts-muted { color: #444; }
    .ts-open .ts-dot { animation: ts-pulse 2s ease-in-out infinite; }
    @keyframes ts-pulse { 0%,100%{opacity:1;} 50%{opacity:0.15;} }
  `;
  document.head.appendChild(style);

  // ── Build ticker rail DOM ────────────────────────────────
  const PLACEHOLDER = [
    'SPX','NDX','DJIA','VIX','DXY','GOLD','BTC'
  ].map(s =>
    `<span class="t-item"><span class="ti-sym">${s}</span><span class="ti-val">—</span></span>`
  ).join('');

  const rail = document.createElement('div');
  rail.className = 't-rail';
  rail.id = 't-rail';
  rail.innerHTML = `
    <div class="t-scroll">
      <div class="t-track" id="t-track">${PLACEHOLDER}</div>
    </div>
    <div class="t-status ts-muted" id="t-status">
      <div class="ts-dot"></div>
      <span id="ts-lbl">—</span>
      <span class="ts-time" id="ts-time"></span>
    </div>
  `;
  document.body.insertBefore(rail, document.body.firstChild);

  // Push body content down by 32px
  const curPt = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  document.body.style.paddingTop = (curPt + 32) + 'px';

  // ── Market status ────────────────────────────────────────
  function getStatus() {
    const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day  = et.getDay();
    const mins = et.getHours() * 60 + et.getMinutes();
    const t    = String(et.getHours()).padStart(2,'0') + ':' + String(et.getMinutes()).padStart(2,'0');
    if (day === 0 || day === 6)        return { lbl: 'STENGT',      cls: 'ts-muted', t };
    if (mins >= 240  && mins < 570)    return { lbl: 'FØR-MARKED',  cls: 'ts-amber', t };
    if (mins >= 570  && mins < 960)    return { lbl: 'ÅPEN',        cls: 'ts-open',  t };
    if (mins >= 960  && mins < 1200)   return { lbl: 'ETTER BØRS',  cls: 'ts-amber', t };
    return { lbl: 'STENGT', cls: 'ts-muted', t };
  }

  function updateStatus() {
    const s  = getStatus();
    const el = document.getElementById('t-status');
    if (!el) return;
    el.className = 't-status ' + s.cls;
    document.getElementById('ts-lbl').textContent  = s.lbl;
    document.getElementById('ts-time').textContent = s.t + ' ET';
  }

  updateStatus();
  setInterval(updateStatus, 60_000);

  // ── Fetch quotes + populate ticker ───────────────────────
  function fmtPrice(p, sym) {
    if (sym === '^VIX' || sym === '^TNX') return p.toFixed(2);
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1000)  return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return p.toFixed(2);
  }

  function buildItems(quotes) {
    return quotes.map(q => {
      const isVix = q.symbol === '^VIX';
      const up = q.changePercent > 0, dn = q.changePercent < 0;
      const chgCls = isVix ? 'ti-vix' : up ? 'ti-up' : dn ? 'ti-dn' : 'ti-val';
      const sign   = up ? '+' : '';
      return `<span class="t-item">
        <span class="ti-sym">${q.displaySymbol}</span>
        <span class="ti-val">${fmtPrice(q.price, q.symbol)}</span>
        <span class="${chgCls}">${sign}${q.changePercent.toFixed(2)}%</span>
      </span>`;
    }).join('');
  }

  async function loadTicker() {
    try {
      const wl   = (() => { try { return JSON.parse(localStorage.getItem('pulse_watchlist') || '[]'); } catch { return []; } })();
      const syms = [...DEFAULT_SYMS, ...wl.filter(s => !DEFAULT_SYMS.includes(s))];
      const res  = await fetch('/api/quotes?symbols=' + encodeURIComponent(syms.join(',')));
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return;

      // Expose quotes for other scripts
      window.PULSE_QUOTES = data;
      if (window.__onQuotesReady) window.__onQuotesReady(data);

      const track = document.getElementById('t-track');
      if (!track) return;
      const html = buildItems(data);
      track.innerHTML = html + html; // duplicate for seamless loop
      const dur = Math.max(data.length * 4, 24);
      track.style.animationDuration = dur + 's';
    } catch (_) { /* fail silently — placeholder stays */ }
  }

  loadTicker();
})();
