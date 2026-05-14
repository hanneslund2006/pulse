# PULSE Design Brief — Terminal Data Precision

**Created:** 2026-05-13  
**Revised:** 2026-05-13 (post-critique)  
**Objective:** Elevate PULSE from generic SaaS to precision trading tool with semantically-grounded design

---

## Design Philosophy

**Target aesthetic:** Fast, minimal, data-first tool for 2-5 minute sessions. No editorial luxury, no productivity SaaS softness. Terminal-precision for active traders.

**Reference products (trading tools, not SaaS):**
- **TradingView** — Dark charting interface, green/red semantic dominance, fast data rendering
- **Koyfin** — Financial terminal, restrained palette, high information density
- **Thinkorswim** — Professional trading platform, function over form, instant feedback

**User context:** Trader opens PULSE at 07:00 Oslo time, scans sentiment (30s), checks radar candidates (90s), reviews sector strength (60s), closes tab. Design must optimize for scanning speed and signal clarity, not reading comfort or brand delight.

---

## Current Problems

1. **Navy blue background** (#0b1623) — SaaS-generic, too warm
2. **Standard blue accent** (#4A90D9) — interchangeable fintech blue, not semantically grounded
3. **Glassmorphism surfaces** — blur reduces clarity
4. **Cormorant Garamond serif** — editorial tone, wrong register
5. **Purple accent** (#8B83E8) — decorative, no semantic purpose
6. **Inconsistent Space Mono usage** — used on non-data elements, dilutes signal
7. **Grid + grain overlays** — visual noise, slows scanning
8. **Soft animations** (300ms+) — unnecessary delay for speed-oriented tool

---

## Bold Distinctive Choice

**High information density with teal-derived accent from bullish signal.**

Most fintech tools default to restrained blue (#60A5FA, #0070F3) with generous spacing. PULSE goes opposite:

1. **Tighter density** — 16px card padding (not 24px), tighter line-height (1.3 vs 1.6), more data per viewport
2. **Semantic accent derivation** — accent color is desaturated bullish green (#14B8A6 - teal-500), not arbitrary blue
3. **Instant feedback** — 0-100ms transitions only, no "smooth" 250ms animations that delay scanning
4. **Invisible typography** — Inter/system sans everywhere except data (Space Mono), no geometric display fonts

**Why this passes the category-reflex test:**
- "Trading tool" does NOT predict teal accent (most use blue or match bullish green exactly)
- "Fintech dashboard" does NOT predict high density + instant feedback (trend is generous spacing + smooth animations)
- Teal is semantically grounded (from bullish spectrum) but not the obvious choice (pure green #10B981)

---

## Category-Reflex Test

**Test:** Cover this brief → say "trading tool" or "fintech dashboard" → guess the color palette

**Expected wrong guesses:**
- Dark background + blue accent (#60A5FA or #0070F3)
- Dark background + green/red only (TradingView clone)
- Navy gradient + glassmorphism (generic SaaS)

**Actual palette:**
- Near-black background (#0A0A0C - cooler than #0D0D0F)
- Teal accent (#14B8A6 - teal-500, desaturated from bullish green)
- Emerald bullish (#10B981), red bearish (#EF4444), amber neutral (#F59E0B)

**Result:** PASS — teal accent is not guessable from category alone. Semantically grounded (bullish spectrum) but distinctive (not pure green, not arbitrary blue).

---

## Color Palette

### Background Layers (Near-Black, Cool Tint)

```css
--bg-primary:    #0A0A0C;  /* Near-black with cool tint (not #000, not navy #0b1623) */
--bg-surface-1:  #121214;  /* Subtle elevation */
--bg-surface-2:  #18181B;  /* Card backgrounds */
--bg-surface-3:  #1F1F23;  /* Elevated elements */
--bg-overlay:    #0A0A0Ccc; /* 80% opacity overlays */
```

**Rationale:** Koyfin uses near-black (#0B0B0E range). Thinkorswim uses #0E0E10. Near-black feels terminal-precision without being pure black (#000 - too stark) or navy (#0b1623 - too SaaS).

### Borders & Dividers (Minimal Contrast)

```css
--border-subtle:  #1F1F23;  /* Barely visible separators */
--border-default: #27272A;  /* Standard dividers */
--border-strong:  #3F3F46;  /* Emphasis borders */
--border-accent:  #14B8A680; /* Teal accent border (50% opacity) */
```

### Text Hierarchy (Cool Gray Scale, High Contrast)

```css
--text-primary:   #F4F4F5;  /* Headings, data values - near white */
--text-secondary: #A1A1AA;  /* Body text, labels - mid-gray */
--text-tertiary:  #71717A;  /* Deemphasized text */
--text-muted:     #52525B;  /* Disabled states */
--text-invert:    #0A0A0C;  /* Text on light backgrounds */
```

**Rationale:** TradingView uses #D1D4DC → #787B86 scale. High contrast for fast scanning. Cool grays (no warm tint).

### Accent Colors (Teal - Semantically Derived)

```css
/* Primary accent - teal (desaturated from bullish green) */
--accent-primary:   #14B8A6;  /* Teal-500 - bullish spectrum, not arbitrary blue */
--accent-hover:     #0D9488;  /* Teal-600 - deeper on hover */
--accent-active:    #0F766E;  /* Teal-700 - pressed state */

/* Accent variations */
--accent-subtle:    #14B8A61A; /* 10% opacity backgrounds */
--accent-border:    #14B8A640; /* 25% opacity borders */
```

**Rationale:** Accent derived from bullish signal (#10B981 emerald) but desaturated toward teal (#14B8A6). NOT arbitrary blue (#60A5FA). Semantically grounded: teal sits between bullish green and neutral cyan, signaling "analysis tool" (not buy/sell signal itself). Passes category-reflex test: most trading tools use blue OR pure green, not teal.

### Semantic Colors (Vivid, Instant Recognition)

```css
/* Trading signals - high saturation for instant recognition */
--bullish:          #10B981;  /* Emerald green */
--bullish-dim:      #10B98120; /* 12% opacity background */
--bullish-border:   #10B98140; /* 25% opacity border */

--bearish:          #EF4444;  /* Red */
--bearish-dim:      #EF444420;
--bearish-border:   #EF444440;

--neutral:          #F59E0B;  /* Amber */
--neutral-dim:      #F59E0B20;
--neutral-border:   #F59E0B40;
```

**Rationale:** TradingView uses #26A69A (teal-green) and #EF5350 (red). High saturation required for instant bullish/bearish recognition. Keep Tailwind emerald-500 (#10B981) and red-500 (#EF4444) — both clear without being neon.

### Status & Alert Colors

```css
--success:     #10B981;  /* Same as bullish */
--warning:     #F59E0B;  /* Same as neutral */
--error:       #EF4444;  /* Same as bearish */
--info:        #14B8A6;  /* Same as accent-primary */
```

**Remove:** Purple (#8B83E8) entirely.

### Chart Colors

```css
--chart-up:        #10B981;  /* Emerald green */
--chart-down:      #EF4444;  /* Red */
--chart-volume:    #14B8A6;  /* Teal accent */
--chart-grid:      #1F1F23;  /* Subtle grid lines */
--chart-axis:      #3F3F46;  /* Axis lines */
--chart-highlight: #F59E0B;  /* Amber highlights */
```

---

## Typography System

### Current Fonts Analysis

- **Cormorant Garamond** (serif) — Editorial, wrong register. REMOVE.
- **Space Mono** (monospace) — Good for data. Keep for tickers/prices ONLY.
- **DM Sans** (sans-serif) — Acceptable, but generic. Keep for now.
- **Syne** (geometric sans) — Adds personality where design should be invisible. REMOVE.

### Recommended Font Stack (Invisible Typography)

```css
--font-display:  'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-body:     'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-data:     'Space Mono', 'SF Mono', 'Consolas', monospace;
```

**Rationale:** 
- **Inter** (or system sans) — neutral, invisible, optimized for data. TradingView uses system sans. Koyfin uses Inter. NO geometric display fonts (Syne adds personality, contradicts "funksjonell").
- **Space Mono** ONLY for data — tickers, prices, percentages, timestamps.
- DM Sans replaced by Inter for consistency.

**Why Inter over Syne:**
- Syne is geometric and expressive → adds design personality
- Inter is neutral and invisible → typography serves data, not itself
- Trading tools prioritize function over form → typography should disappear

### Typography Specifications

**Display headings (page titles):**
```css
font-family: var(--font-display);  /* Inter */
font-weight: 600;  /* Medium, not bold — less visual weight */
font-size: clamp(32px, 5vw, 48px);  /* Smaller than SaaS hero (not 72px+) */
line-height: 1.2;  /* Tight for density */
letter-spacing: -0.01em;
color: var(--text-primary);
```

**Section headings:**
```css
font-family: var(--font-display);  /* Inter */
font-weight: 600;
font-size: clamp(18px, 2.5vw, 24px);
line-height: 1.3;
letter-spacing: 0;
color: var(--text-primary);
```

**Data values (tickers, prices, percentages):**
```css
font-family: var(--font-data);  /* Space Mono */
font-weight: 700;
font-size: 14px;
line-height: 1.3;  /* Tight for density */
letter-spacing: 0;
color: var(--text-primary);
font-variant-numeric: tabular-nums;  /* Align numbers */
```

**Data labels:**
```css
font-family: var(--font-body);  /* Inter, NOT Space Mono */
font-weight: 500;
font-size: 10px;
line-height: 1.4;
letter-spacing: 0.06em;
text-transform: uppercase;
color: var(--text-tertiary);
```

**Body text:**
```css
font-family: var(--font-body);  /* Inter */
font-weight: 400;
font-size: 13px;
line-height: 1.5;  /* Comfortable but not generous */
color: var(--text-secondary);
```

**Critical:** Space Mono ONLY on tickers, prices, percentages, timestamps. Everything else uses Inter (neutral sans).

---

## Design System

### Border Radius (Minimal)

```css
--radius-sm:  1px;  /* Badges, small elements */
--radius-md:  2px;  /* Cards, inputs, buttons */
--radius-lg:  3px;  /* Modals, large containers */
```

**Rationale:** Koyfin uses 2-3px. TradingView uses minimal rounding. NOT sharp corners (0px - too harsh), NOT generous rounding (6-8px - too soft). Subtle rounding (1-3px) feels precise without being stark.

### Elevation (Minimal Shadows)

```css
--shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.4);
--shadow-md:  0 2px 4px -1px rgba(0, 0, 0, 0.5);
--shadow-lg:  0 4px 8px -2px rgba(0, 0, 0, 0.6);

/* Focus glow (instant feedback) */
--glow-accent: 0 0 0 2px rgba(20, 184, 166, 0.15);  /* Teal */
--glow-success: 0 0 0 2px rgba(16, 185, 129, 0.15);
--glow-error: 0 0 0 2px rgba(239, 68, 68, 0.15);
```

**Remove:** All `backdrop-filter` (glassmorphism). Use solid backgrounds.

### Spacing Scale (Tight Density)

```css
--space-xs:  4px;
--space-sm:  8px;
--space-md:  12px;  /* Tighter than standard 16px */
--space-lg:  16px;  /* Card padding (not 24px) */
--space-xl:  24px;
--space-2xl: 32px;
--space-3xl: 48px;
```

**Rationale:** Higher density than Vercel/Linear. More data per viewport. Card padding 16px (not 24px). Tighter line-height (1.3 vs 1.6). Optimized for 2-5 minute scanning sessions.

### Animation (Instant Feedback)

**Timing functions:**
```css
--ease-instant: linear;  /* No easing, instant feedback */
--ease-snap:    cubic-bezier(0, 0, 1, 1);  /* Snap to end state */
```

**Durations:**
```css
--duration-instant: 0ms;    /* Instant state changes */
--duration-fast:    75ms;   /* Micro-interactions (hover, focus) */
--duration-normal:  100ms;  /* Standard transitions (reduced from 250ms) */
```

**Application:**
```css
.card {
  transition: border-color var(--duration-fast) var(--ease-instant);
}

.button:hover {
  /* Instant background change, no delay */
  transition: background var(--duration-instant);
}

.modal {
  /* Minimal fade-in, no slide animation */
  animation: fadeIn var(--duration-normal) var(--ease-instant);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Rationale:** Trading tools prioritize speed. TradingView uses instant state changes. Koyfin uses minimal transitions. Reduced from 150-250ms to 0-100ms. NO slide animations, NO spring easing, NO choreographed stagger.

**Remove:**
- Slide/translateY animations (adds delay)
- Smooth easing curves (cubic-bezier luxury)
- Staggered animations (choreography)

**Keep:**
- Instant hover feedback (0-75ms)
- Simple fade-in for modals (100ms max)
- Focus glow (instant, no transition)

---

## Component Redesign Examples

### Hero Section

**Current (generic SaaS):**
```css
.hero-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(72px, 12vw, 104px);
  color: #ECEEF4;
}
```

**New (terminal precision):**
```css
.hero-title {
  font-family: var(--font-display);  /* Inter */
  font-size: clamp(32px, 5vw, 48px);  /* Smaller, less hero-metric */
  font-weight: 600;
  color: var(--text-primary);  /* #F4F4F5 */
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.hero-kicker {
  font-family: var(--font-body);  /* Inter, NOT Space Mono */
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-primary);  /* Teal #14B8A6 */
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

### Data Card

**Current (glassmorphism, generous spacing):**
```css
.card {
  background: rgba(13, 30, 56, 0.65);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 32px;
}
```

**New (solid, tight density):**
```css
.card {
  background: var(--bg-surface-2);  /* #18181B solid */
  border: 1px solid var(--border-default);  /* #27272A */
  border-radius: var(--radius-md);  /* 2px */
  padding: var(--space-lg);  /* 16px (not 24px) */
  box-shadow: var(--shadow-sm);
  transition: border-color var(--duration-fast) linear;
}

.card:hover {
  border-color: var(--border-accent);  /* Teal 50% opacity */
}

.card-label {
  font-family: var(--font-body);  /* Inter */
  font-size: 10px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: var(--space-sm);  /* 8px */
}

.card-value {
  font-family: var(--font-data);  /* Space Mono */
  font-size: 28px;  /* Reduced from 32px for density */
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
```

### Sentiment Badge

**Current:**
```css
.badge-bullish {
  background: rgba(29,184,126,0.10);
  border: 1px solid rgba(29,184,126,0.25);
  color: #1DB87E;
  border-radius: 6px;
  padding: 6px 12px;
}
```

**New (tighter, instant feedback):**
```css
.badge-bullish {
  background: var(--bullish-dim);  /* #10B98120 */
  border: 1px solid var(--bullish-border);  /* #10B98140 */
  color: var(--bullish);  /* #10B981 */
  border-radius: var(--radius-sm);  /* 1px */
  padding: 3px 8px;  /* Tighter */
  font-family: var(--font-data);  /* Space Mono */
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: none;  /* Instant, no transition */
}
```

### Button (Primary)

**New (instant feedback):**
```css
.button-primary {
  background: var(--accent-primary);  /* Teal #14B8A6 */
  color: var(--text-invert);  /* #0A0A0C */
  border: 1px solid transparent;
  border-radius: var(--radius-sm);  /* 1px */
  padding: var(--space-sm) var(--space-lg);  /* 8px 16px */
  font-family: var(--font-display);  /* Inter */
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--duration-instant);  /* Instant */
}

.button-primary:hover {
  background: var(--accent-hover);  /* Teal-600 #0D9488 */
}

.button-primary:active {
  background: var(--accent-active);  /* Teal-700 #0F766E */
}

.button-primary:focus-visible {
  outline: none;
  box-shadow: var(--glow-accent);
}
```

### Data Table Row

**New (high density):**
```css
.table-row {
  border-bottom: 1px solid var(--border-subtle);  /* #1F1F23 */
  padding: var(--space-sm) 0;  /* 8px (not 16px) */
  transition: background var(--duration-fast) linear;
}

.table-row:hover {
  background: var(--bg-surface-1);  /* #121214 */
}

.table-cell-ticker {
  font-family: var(--font-data);  /* Space Mono */
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.table-cell-label {
  font-family: var(--font-body);  /* Inter */
  font-size: 12px;
  color: var(--text-secondary);
}

.table-cell-value {
  font-family: var(--font-data);  /* Space Mono */
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
```

---

## Implementation Priority

### Phase 1: Foundation (Colors + Typography)
1. Replace all rgba colors with solid hex values
2. Swap navy (#0b1623) for near-black (#0A0A0C)
3. Replace Cormorant Garamond with Inter for all headings
4. Remove Syne references (if present)
5. Restrict Space Mono to data only (tickers, prices, percentages)
6. Update accent from #4A90D9 to #14B8A6 (teal)
7. Update semantic colors (maintain emerald #10B981, red #EF4444, amber #F59E0B)

### Phase 2: Structure (Density + Spacing)
1. Reduce border-radius to 1-3px range
2. Reduce card padding from 24-32px to 16px
3. Update spacing to tighter scale (12px/16px instead of 16px/24px)
4. Remove grain texture and grid overlay
5. Add minimal shadows (var(--shadow-sm))

### Phase 3: Speed (Animation Reduction)
1. Replace all 250ms+ transitions with 0-100ms
2. Remove slide/translateY animations
3. Change easing to linear or instant
4. Keep only: instant hover feedback, simple fade-in for modals
5. Ensure focus states use glow (instant, no transition)

### Phase 4: Polish (Components)
1. Update badge styles (1px radius, tighter padding)
2. Ensure all data values use Space Mono + tabular-nums
3. Remove all decorative elements (glassmorphism, grain, grid)
4. Test all interactive states (hover, focus, active) for instant feedback

---

## Verification Checklist

Before declaring design complete:

**Colors:**
- [ ] Background is near-black (#0A0A0C), not pure black or navy
- [ ] Accent is teal (#14B8A6), not blue (#60A5FA) or neon cyan
- [ ] Semantic colors unchanged (emerald #10B981, red #EF4444, amber #F59E0B)
- [ ] Purple (#8B83E8) removed entirely

**Typography:**
- [ ] All headings use Inter (or system sans), not Cormorant or Syne
- [ ] Space Mono ONLY on tickers, prices, percentages, timestamps
- [ ] Font sizes reduced for density (hero ≤48px, not 72px+)
- [ ] Line-height tightened (1.2-1.3 for headings, 1.5 for body)

**Structure:**
- [ ] Border-radius is 1-3px, not 0px or 6-8px+
- [ ] Card padding is 16px, not 24-32px
- [ ] Spacing scale uses 12px/16px for standard gaps
- [ ] No backdrop-filter in CSS

**Speed:**
- [ ] Animations use 0-100ms durations, not 150-250ms+
- [ ] Transitions use linear or instant easing, not cubic-bezier luxury
- [ ] No slide/translateY animations
- [ ] Hover states change instantly (0-75ms max)

**Category-reflex test:**
- [ ] Teal accent (#14B8A6) is NOT guessable from "trading tool" category
- [ ] Palette differs from TradingView (no pure green accent), Koyfin (not blue), generic fintech (not navy gradient)
- [ ] Bold choice documented: high density + teal accent + instant feedback

---

## Anti-Pattern Enforcement

**BANNED in PULSE design:**

1. **Productivity SaaS aesthetics** (Vercel/Linear/Raycast) — wrong reference products
2. **Arbitrary blue accents** (#60A5FA, #0070F3) — not semantically grounded
3. **Geometric display fonts** (Syne, Archivo, Outfit) — adds personality, contradicts "funksjonell"
4. **Generous spacing** (24-32px card padding) — reduces information density
5. **Smooth animations** (250ms+ cubic-bezier) — delays scanning, wrong for speed tool
6. **Glassmorphism** (backdrop-filter) — reduces clarity
7. **Decorative colors** (purple #8B83E8) — no semantic purpose
8. **Space Mono on non-data** — dilutes signal function
9. **Large hero titles** (72px+) — SaaS hero-metric template
10. **Slide animations** (translateY) — choreographed delay

---

## Color Palette Summary (Copy-Paste Ready)

```css
:root {
  /* Backgrounds */
  --bg-primary:    #0A0A0C;
  --bg-surface-1:  #121214;
  --bg-surface-2:  #18181B;
  --bg-surface-3:  #1F1F23;
  --bg-overlay:    #0A0A0Ccc;

  /* Borders */
  --border-subtle:  #1F1F23;
  --border-default: #27272A;
  --border-strong:  #3F3F46;
  --border-accent:  #14B8A680;

  /* Text */
  --text-primary:   #F4F4F5;
  --text-secondary: #A1A1AA;
  --text-tertiary:  #71717A;
  --text-muted:     #52525B;
  --text-invert:    #0A0A0C;

  /* Accents (teal - semantically derived from bullish spectrum) */
  --accent-primary:   #14B8A6;
  --accent-hover:     #0D9488;
  --accent-active:    #0F766E;
  --accent-subtle:    #14B8A61A;
  --accent-border:    #14B8A640;

  /* Semantic (unchanged) */
  --bullish:          #10B981;
  --bullish-dim:      #10B98120;
  --bullish-border:   #10B98140;

  --bearish:          #EF4444;
  --bearish-dim:      #EF444420;
  --bearish-border:   #EF444440;

  --neutral:          #F59E0B;
  --neutral-dim:      #F59E0B20;
  --neutral-border:   #F59E0B40;

  /* Status */
  --success:     #10B981;
  --warning:     #F59E0B;
  --error:       #EF4444;
  --info:        #14B8A6;

  /* Charts */
  --chart-up:        #10B981;
  --chart-down:      #EF4444;
  --chart-volume:    #14B8A6;
  --chart-grid:      #1F1F23;
  --chart-axis:      #3F3F46;
  --chart-highlight: #F59E0B;

  /* Spacing (tighter density) */
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  12px;
  --space-lg:  16px;
  --space-xl:  24px;
  --space-2xl: 32px;
  --space-3xl: 48px;

  /* Border Radius (minimal) */
  --radius-sm:  1px;
  --radius-md:  2px;
  --radius-lg:  3px;

  /* Shadows (minimal) */
  --shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --shadow-md:  0 2px 4px -1px rgba(0, 0, 0, 0.5);
  --shadow-lg:  0 4px 8px -2px rgba(0, 0, 0, 0.6);

  /* Glows (instant feedback) */
  --glow-accent:  0 0 0 2px rgba(20, 184, 166, 0.15);
  --glow-success: 0 0 0 2px rgba(16, 185, 129, 0.15);
  --glow-error:   0 0 0 2px rgba(239, 68, 68, 0.15);

  /* Animation (instant/minimal) */
  --ease-instant: linear;
  --ease-snap:    cubic-bezier(0, 0, 1, 1);

  --duration-instant: 0ms;
  --duration-fast:    75ms;
  --duration-normal:  100ms;

  /* Typography */
  --font-display: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-body:    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-data:    'Space Mono', 'SF Mono', 'Consolas', monospace;
}
```

---

## Semantic Grounding Documentation

**Why teal (#14B8A6) as accent?**

1. **Semantic derivation:** Teal sits between bullish green (#10B981) and neutral cyan. It signals "analysis tool" (objective, data-focused) rather than "buy signal" (pure green) or "generic interactive" (arbitrary blue).

2. **Distinctiveness:** Most trading tools use:
   - TradingView: Pure green (#26A69A close to bullish)
   - Koyfin/Bloomberg: Blue (#0070F3 range)
   - Generic fintech: Navy gradient or blue-400 (#60A5FA)
   
   Teal is semantically grounded but not category-obvious.

3. **Relationship to semantic palette:**
   - Bullish green (#10B981) = strong positive signal
   - Teal accent (#14B8A6) = neutral analysis tool (desaturated from bullish)
   - Prevents confusion: accent is NOT a trading signal, it's interface chrome

4. **WCAG compliance:** #14B8A6 on #0A0A0C background = 8.2:1 contrast ratio (AAA for text ≤18px).

**Alternative rejected:**
- Blue #60A5FA: Category-guessable, not semantically grounded
- Pure green #10B981: Conflicts with bullish signal (would create ambiguity)
- Cyan #06B6D4: Too bright, less semantic connection to trading signals

---

**End of Design Brief**
