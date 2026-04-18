(function () {
  'use strict';

  // ─── CANVAS SETUP ────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  document.body.insertBefore(canvas, document.body.firstChild);

  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ─── HELPERS ─────────────────────────────────────────────
  function hexRgb(hex) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `${r},${g},${b}`;
  }
  const C = {
    green : hexRgb('#1D9E75'),
    red   : hexRgb('#E24B4A'),
    grid  : hexRgb('#1C1F2A'),
    muted : '72,80,100',
  };
  const rgba = (c, a) => `rgba(${c},${a})`;

  // ─── PRECOMPUTED DATA ────────────────────────────────────

  function genWalk(n, start, vol) {
    const pts = [start];
    for (let i = 1; i < n; i++) {
      pts.push(Math.max(0.05, Math.min(0.95,
        pts[i-1] + (Math.random() - 0.48) * vol)));
    }
    return pts;
  }

  const WALK_LEN = 280;
  const walks = [
    { pts: genWalk(WALK_LEN, 0.42, 0.018), baseY: 0.32, color: C.green, op: 0.07 },
    { pts: genWalk(WALK_LEN, 0.58, 0.013), baseY: 0.68, color: C.red,   op: 0.05 },
  ];

  function genCandles(n) {
    const out = [];
    let p = 0.5;
    for (let i = 0; i < n; i++) {
      const open = p;
      p = Math.max(0.1, Math.min(0.9, p + (Math.random() - 0.48) * 0.04));
      const close = p;
      out.push({
        open, close,
        high : Math.max(open, close) + Math.random() * 0.02,
        low  : Math.min(open, close) - Math.random() * 0.02,
        bull : close >= open,
      });
    }
    return out;
  }
  const candles = genCandles(55);
  const CW = 9, CG = 4, CTOTAL = CW + CG;

  const VOL_N = 90;
  const volBars = Array.from({ length: VOL_N }, () => ({
    h   : 0.15 + Math.random() * 0.85,
    bull: Math.random() > 0.44,
  }));

  const dots = Array.from({ length: 35 }, () => ({
    x  : Math.random(),
    y  : Math.random(),
    r  : 0.5 + Math.random() * 1.5,
    op : 0.04 + Math.random() * 0.04,
  }));

  const geoLines = [
    [[0.00,0.28],[0.07,0.24],[0.14,0.27],[0.21,0.21],[0.28,0.29],[0.33,0.25]],
    [[0.37,0.17],[0.44,0.22],[0.52,0.16],[0.60,0.20],[0.66,0.15]],
    [[0.54,0.74],[0.61,0.69],[0.69,0.75],[0.77,0.71],[0.85,0.77],[0.93,0.73],[1.00,0.76]],
    [[0.00,0.83],[0.06,0.79],[0.13,0.85],[0.20,0.81],[0.27,0.86]],
    [[0.70,0.36],[0.76,0.33],[0.82,0.39],[0.88,0.35],[0.95,0.41],[1.00,0.38]],
  ];

  const FIBS = [0.236, 0.382, 0.500, 0.618, 0.786];

  const LABEL_DEFS = [
    { t: 'SPX',       col: C.muted }, { t: 'NDX',       col: C.muted },
    { t: 'XAUUSD',   col: C.muted }, { t: 'BTC/USD',   col: C.muted },
    { t: 'VIX',      col: C.muted }, { t: 'NVDA',      col: C.muted },
    { t: 'DXY',      col: C.muted }, { t: 'WTI',       col: C.muted },
    { t: 'EUR/USD',  col: C.muted }, { t: 'TNX',       col: C.muted },
    { t: 'FED RATE', col: C.muted }, { t: 'CHINA PMI', col: C.muted },
    { t: 'OPEC+',    col: C.muted }, { t: 'CPI YOY',   col: C.muted },
    { t: '+2.34%',   col: C.muted }, { t: '-0.87%',    col: C.muted },
    { t: '+1.12%',   col: C.muted }, { t: '4.23%',     col: C.muted },
    { t: '-1.56%',   col: C.muted }, { t: 'PAYROLLS',  col: C.muted },
    { t: 'ECB',      col: C.muted }, { t: 'NATO',      col: C.muted },
    { t: '26.4B',    col: C.muted }, { t: 'TAIWAN STR',col: C.muted },
    { t: 'MSFT',     col: C.muted }, { t: 'TSLA',      col: C.muted },
  ];
  const labels = LABEL_DEFS.map(d => ({
    ...d,
    x  : 0.03 + Math.random() * 0.93,
    y  : 0.05 + Math.random() * 0.90,
    sz : 7 + Math.floor(Math.random() * 4),
    op : 0.03 + Math.random() * 0.03,
  }));

  // ─── DRAW LOOP ────────────────────────────────────────────
  function draw(ts) {
    ctx.clearRect(0, 0, W, H);

    const scroll  = ts * 0.016;
    const cScroll = ts * 0.006;

    // ── 1. Grid ──
    ctx.strokeStyle = rgba(C.grid, 0.28);
    ctx.lineWidth = 0.5;
    const GX = 96, GY = 72;
    for (let x = GX; x < W; x += GX) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = GY; y < H; y += GY) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // ── 2. Fibonacci dashed lines ──
    ctx.setLineDash([5, 10]);
    ctx.lineWidth = 0.5;
    FIBS.forEach(fib => {
      const y = fib * H;
      ctx.strokeStyle = rgba(C.muted, 0.08);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillStyle = rgba(C.muted, 0.04);
      ctx.font = "7px 'Space Mono', monospace";
      ctx.fillText(fib.toFixed(3), 6, y - 3);
    });
    ctx.setLineDash([]);

    // ── 3. Price curves (scrolling) ──
    walks.forEach(({ pts, baseY, color, op }) => {
      const segW = (W * 1.9) / pts.length;
      const ampH = H * 0.20;
      const base = baseY * H;
      const span = pts.length * segW;

      ctx.beginPath();
      pts.forEach((v, i) => {
        const x = ((i * segW - (scroll % span)) + span) % (span + W * 0.4) - W * 0.2;
        const y = base + (v - 0.5) * ampH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = rgba(color, op);
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // ── 4. Candlesticks (slow scroll) ──
    const totalCandleW = candles.length * CTOTAL;
    const candleAreaY  = H * 0.50;
    const candleAreaH  = H * 0.30;

    candles.forEach((c, i) => {
      const x = ((i * CTOTAL - (cScroll % totalCandleW)) + totalCandleW) % totalCandleW;
      if (x > W + CW) return;

      const oY = candleAreaY + c.open  * candleAreaH;
      const cY = candleAreaY + c.close * candleAreaH;
      const hY = candleAreaY + c.high  * candleAreaH;
      const lY = candleAreaY + c.low   * candleAreaH;
      const col = c.bull ? rgba(C.green, 0.06) : rgba(C.red, 0.06);

      ctx.strokeStyle = col;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + CW / 2, hY);
      ctx.lineTo(x + CW / 2, lY);
      ctx.stroke();

      ctx.fillStyle = col;
      ctx.fillRect(x, Math.min(oY, cY), CW, Math.max(Math.abs(cY - oY), 0.8));
    });

    // ── 5. Volume histogram ──
    const volBarW = W / VOL_N;
    const volMaxH = H * 0.065;
    volBars.forEach((bar, i) => {
      const bh = bar.h * volMaxH;
      ctx.fillStyle = bar.bull ? rgba(C.green, 0.04) : rgba(C.red, 0.04);
      ctx.fillRect(i * volBarW, H - bh, volBarW - 1, bh);
    });

    // ── 6. Geo contour lines ──
    ctx.strokeStyle = rgba(C.muted, 0.14);
    ctx.lineWidth = 0.8;
    geoLines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line[0][0] * W, line[0][1] * H);
      for (let i = 1; i < line.length - 1; i++) {
        const mx = ((line[i][0] + line[i + 1][0]) / 2) * W;
        const my = ((line[i][1] + line[i + 1][1]) / 2) * H;
        ctx.quadraticCurveTo(line[i][0] * W, line[i][1] * H, mx, my);
      }
      const last = line[line.length - 1];
      ctx.lineTo(last[0] * W, last[1] * H);
      ctx.stroke();
    });

    // ── 7. Floating data dots ──
    dots.forEach(d => {
      ctx.beginPath();
      ctx.arc(d.x * W, d.y * H, d.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(C.muted, d.op);
      ctx.fill();
    });

    // ── 8. Scattered text labels ──
    labels.forEach(lbl => {
      ctx.font = `${lbl.sz}px 'Space Mono', monospace`;
      ctx.fillStyle = rgba(lbl.col, lbl.op);
      ctx.fillText(lbl.t, lbl.x * W, lbl.y * H);
    });

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
