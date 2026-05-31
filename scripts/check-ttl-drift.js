'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');

// Safe arithmetic evaluator — digits, spaces, * + - / ( ) only
function evalArith(expr) {
  if (!/^[\d\s\*\+\-\/\(\)]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('"use strict"; return (' + expr + ')')();
    return (typeof result === 'number' && isFinite(result)) ? Math.round(result) : null;
  } catch (_) {
    return null;
  }
}

function parseTTLExpr(expr) {
  const s = expr.trim().replace(/[;,].*$/, '').trim();
  if (s.includes('nextMidnightTTL')) return 'midnight';
  return evalArith(s);
}

// Extract cache.set() TTL arguments from source, line by line
function extractCodeTTLs(source) {
  const ttls = [];
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // setWithStale writes the same main-result TTL (plus a separate long-lived fallback copy);
    // treat it like set(). setStaleOnly is the 7-day fallback only and is intentionally ignored.
    const isMainSet = trimmed.includes('cache.set(') || trimmed.includes('cache.setWithStale(');
    if (!isMainSet || trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    const lineNum = i + 1;
    if (line.includes('nextMidnightTTL')) {
      ttls.push({ raw: 'cache.nextMidnightTTL()', ttl: 'midnight', line: lineNum });
      return;
    }
    // Match third arg: cache.set(KEY, VALUE, TTL) or cache.setWithStale(KEY, VALUE, TTL)
    const m = line.match(/cache\.set(?:WithStale)?\s*\([^,]+,[^,]+,\s*([^)]+)\)/);
    if (m) {
      const raw = m[1].trim();
      const ttl = parseTTLExpr(raw);
      if (ttl !== null && ttl !== undefined) ttls.push({ raw, ttl, line: lineNum });
    }
  });
  return ttls;
}

// Parse "Caching Strategy" section from CLAUDE.md
// Returns { label: ttl } where ttl is number | 'midnight' | 'none'
function parseCanonical(content) {
  const result = {};
  const sectionM = content.match(/###+\s*Caching Strategy\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n## |$)/);
  if (!sectionM) return result;

  const bulletRe = /^\s*[-*]\s+\*\*(.+?)\*\*[:\s]+(.*)/gm;
  let bm;
  while ((bm = bulletRe.exec(sectionM[1])) !== null) {
    const label = bm[1].toLowerCase().trim();
    const desc = bm[2];
    let ttl;
    if (/no cache|always fresh/i.test(desc)) {
      ttl = 'none';
    } else if (/midnight|nextMidnightTTL/i.test(desc)) {
      ttl = 'midnight';
    } else {
      const secM = desc.match(/\((\d+)s\)/);
      if (secM) ttl = parseInt(secM[1], 10);
    }
    if (ttl !== undefined) result[label] = ttl;
  }
  return result;
}

// Look up documented TTL for a given endpoint basename (e.g. 'screener', 'earnings-play')
function lookupCanonical(basename, canonical) {
  if (basename === 'analytics-dashboard') return undefined; // not in Caching Strategy section
  const lc = basename.toLowerCase();
  const noDash = lc.replace(/-/g, ' ');
  for (const [label, ttl] of Object.entries(canonical)) {
    if (label === lc || label === noDash) return ttl;
    if (label.includes(lc) || label.includes(noDash)) return ttl;
    const words = noDash.split(' ').filter(w => w.length > 3);
    if (words.length > 0 && words.every(w => label.includes(w))) return ttl;
  }
  return undefined;
}

function ttlStr(ttl) {
  if (ttl === 'midnight') return 'midnight';
  if (ttl === 'none') return 'no cache';
  if (typeof ttl === 'number') return `${ttl}s`;
  return String(ttl);
}

function usesClaudeAPI(source) {
  return source.includes('@anthropic-ai/sdk') || source.includes('Anthropic({');
}

function main() {
  const claudeContent = fs.readFileSync(CLAUDE_MD, 'utf8');
  const canonical = parseCanonical(claudeContent);

  const files = fs.readdirSync(API_DIR)
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))
    .sort();

  let mismatches = 0;
  let costSpikes = 0;
  const lines = ['\nPULSE TTL drift check\n'];

  for (const file of files) {
    const filepath = path.join(API_DIR, file);
    const source = fs.readFileSync(filepath, 'utf8');
    const basename = path.basename(file, '.js');
    const usesClaude = usesClaudeAPI(source);
    const allTTLs = extractCodeTTLs(source);
    const docTTL = lookupCanonical(basename, canonical);

    // Filter out secondary caches (analytics counters, CIK lookup) that have very long TTLs
    // and don't match the documented main-result TTL
    const mainTTLs = allTTLs.filter(t => {
      if (typeof t.ttl === 'number' && t.ttl > 7 * 86400 && t.ttl !== docTTL) return false;
      return true;
    });

    let status;
    if (mainTTLs.length === 0) {
      status = (docTTL === 'none' || docTTL === undefined)
        ? 'no cache  OK'
        : `MISMATCH — documented: ${ttlStr(docTTL)}, actual: no cache`;
      if (docTTL !== 'none' && docTTL !== undefined) mismatches++;
    } else {
      const ttlValues = [...new Set(mainTTLs.map(t => t.ttl))];
      const ttlDisplay = ttlValues.map(ttlStr).join(' / ');
      if (docTTL === undefined) {
        status = `${ttlDisplay}  (undocumented)`;
      } else if (ttlValues.includes(docTTL)) {
        status = `${ttlDisplay}  (documented: ${ttlStr(docTTL)})  OK`;
      } else {
        status = `MISMATCH — documented: ${ttlStr(docTTL)}, actual: ${ttlDisplay}`;
        mismatches++;
      }
    }

    // COST SPIKE: any main cache TTL < 600 AND endpoint calls Claude
    const spikeEntry = mainTTLs.find(t => typeof t.ttl === 'number' && t.ttl < 600);
    const isSpike = usesClaude && !!spikeEntry;
    if (isSpike) costSpikes++;

    lines.push(`  ${file.padEnd(28)} ${status}`);
    if (isSpike) {
      lines.push(`  ${''.padEnd(28)} COST SPIKE: ${spikeEntry.ttl}s TTL + Claude on cache miss`);
    }
  }

  lines.push('');
  if (mismatches === 0 && costSpikes === 0) {
    lines.push('No drift detected.\n');
  } else {
    if (mismatches > 0) lines.push(`${mismatches} TTL mismatch(es) found.`);
    if (costSpikes > 0) lines.push(`${costSpikes} cost spike flag(s).`);
    lines.push('');
  }

  process.stdout.write(lines.join('\n'));
  process.exit(0); // always exit 0 — warn only
}

main();
