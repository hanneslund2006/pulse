const fs = require('fs');
const path = require('path');
const RL_DIR = '/tmp/pulse-rl';
const WINDOW_MS = 60 * 60 * 1000;
const MAX_CALLS = 10;

function ensureDir() {
  if (!fs.existsSync(RL_DIR)) fs.mkdirSync(RL_DIR, { recursive: true });
}

function getIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function safeKey(ip) {
  return ip.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Returns null if allowed, { waitMinutes } if rate limited
function check(req) {
  ensureDir();
  const ip = getIP(req);
  const file = path.join(RL_DIR, safeKey(ip) + '.json');
  const now = Date.now();

  let state = { count: 0, windowStart: now };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (now - parsed.windowStart <= WINDOW_MS) {
      state = parsed;
    }
  } catch (_) {}

  if (state.count >= MAX_CALLS) {
    const waitMs = WINDOW_MS - (now - state.windowStart);
    return { waitMinutes: Math.ceil(waitMs / 60000) };
  }

  state.count++;
  try { fs.writeFileSync(file, JSON.stringify(state)); } catch (_) {}
  return null;
}

module.exports = { check };
