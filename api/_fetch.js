// Wrapper for external API calls with mandatory timeout
// Prevents hanging requests that consume serverless resources
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - external API tok for lang tid');
    }
    throw error;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Retries once on transient failures: network/timeout errors and HTTP 429/5xx.
// Non-retryable statuses (e.g. 4xx other than 429) return immediately.
async function fetchWithRetry(url, options = {}, timeoutMs = 8000, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
      if (res.ok || attempt === retries) return res;
      if (res.status === 429 || res.status >= 500) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
      await sleep(400 * (attempt + 1));
    }
  }
  throw lastError;
}

// Wraps an Anthropic messages.create() call, retrying once on overload/transient
// errors (529 overloaded, 429 rate limit, 5xx, timeout). Auth/format errors throw immediately.
async function callClaudeWithRetry(createFn, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await createFn();
    } catch (err) {
      const status = err?.status;
      const retryable = status === 429 || status === 529 || status === 500 || status === 503
        || err?.name === 'AbortError'
        || /timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(err?.message || '');
      if (attempt === retries || !retryable) throw err;
      await sleep(500 * (attempt + 1));
    }
  }
}

module.exports = { fetchWithTimeout, fetchWithRetry, callClaudeWithRetry };
