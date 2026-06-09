'use strict';

// Regression guard for the bug class fixed in this pass: a frontend fetch that
// targets a nonexistent /api/* endpoint, or uses a method the handler rejects.
// Static check only — no network, no deps. Run: node scripts/check-endpoint-contract.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Accepted method per endpoint, read from the handler's `req.method !== 'X'` guard.
// No guard → handler accepts any method (null = wildcard).
function loadEndpoints() {
  const map = new Map();
  for (const file of fs.readdirSync(API_DIR)) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    const name = file.replace(/\.js$/, '');
    const src = fs.readFileSync(path.join(API_DIR, file), 'utf8');
    const guard = src.match(/req\.method\s*!==\s*['"](\w+)['"]/);
    map.set(name, guard ? guard[1].toUpperCase() : null);
  }
  return map;
}

// Every fetch('/api/x', { method }) / fetchWithTimeout(...) call in the HTML pages.
function loadCallers() {
  const callRe = /(?:fetch|fetchWithTimeout)\(\s*[`'"]\/api\/([a-z0-9-]+)[^`'"]*[`'"]\s*(?:,\s*\{([\s\S]{0,200}?)\})?/g;
  const callers = [];
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    if (!file.endsWith('.html')) continue;
    const src = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
    let m;
    while ((m = callRe.exec(src))) {
      const opts = m[2] || '';
      const method = (opts.match(/method\s*:\s*['"](\w+)['"]/) || [, 'GET'])[1].toUpperCase();
      callers.push({ file, endpoint: m[1], method });
    }
  }
  return callers;
}

function main() {
  const endpoints = loadEndpoints();
  const callers = loadCallers();
  const failures = [];

  for (const c of callers) {
    if (!endpoints.has(c.endpoint)) {
      failures.push(`${c.file}: calls /api/${c.endpoint} (${c.method}) — no api/${c.endpoint}.js`);
      continue;
    }
    const accepted = endpoints.get(c.endpoint);
    if (accepted && accepted !== c.method) {
      failures.push(`${c.file}: /api/${c.endpoint} called with ${c.method} — handler accepts ${accepted}`);
    }
  }

  if (failures.length) {
    console.error(`FAIL: ${failures.length} endpoint contract violation(s):`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`OK: ${callers.length} frontend /api calls match ${endpoints.size} handlers.`);
}

main();
