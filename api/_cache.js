const fs = require('fs');
const path = require('path');
const CACHE_DIR = '/tmp/pulse-cache';
// MERK: /tmp er per lambda-instans på Vercel. Cache-treff skjer kun innenfor
// samme varme instans. Krever Vercel KV / Redis for kryssinstans-caching.

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function safeKey(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function get(key) {
  ensureDir();
  const file = path.join(CACHE_DIR, safeKey(key) + '.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() < expiresAt) return data;
    fs.unlinkSync(file);
  } catch (_) {}
  return null;
}

function set(key, data, ttlSeconds) {
  ensureDir();
  const file = path.join(CACHE_DIR, safeKey(key) + '.json');
  const expiresAt = Date.now() + ttlSeconds * 1000;
  try {
    fs.writeFileSync(file, JSON.stringify({ data, expiresAt }));
  } catch (_) {}
}

function nextMidnightTTL() {
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.floor((midnight - Date.now()) / 1000));
}

module.exports = { get, set, nextMidnightTTL };
