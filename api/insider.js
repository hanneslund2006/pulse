const { check: rateCheck } = require('./_ratelimit');
const { validateTicker } = require('./_validate');
const { fetchWithTimeout } = require('./_fetch');
const cache = require('./_cache');
const { XMLParser } = require('fast-xml-parser');

// CHANGE 1: User-Agent from env (never hardcode email in source)
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'PULSE/1.0 contact@example.com';
// 7s per fetch: up to 3 sequential SEC fetches (CIK, submissions, Form4 XML) fit the
// 30s function maxDuration with headroom. A 30s timeout left zero buffer → platform kills.
const SEC_TIMEOUT = 7000;
const PARSE_TIMEOUT = 8000; // 8s cap for the XML parse loop

module.exports = async (req, res) => {
  // 1. Method validation
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Ticker validation
  let ticker;
  try {
    ticker = validateTicker(req.query.ticker);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // 3. Rate limiting
  const rl = await rateCheck(req);
  if (rl) {
    return res.status(429).json({
      error: `You have reached the limit for analyses this hour. Try again in ${rl.waitMinutes} minutes.`
    });
  }

  // 4. Analytics tracking (defensive - never crash endpoint)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const analyticsKey = `analytics:insider:${today}`;
    const currentCount = await cache.get(analyticsKey) || 0;
    cache.set(analyticsKey, currentCount + 1, 30 * 24 * 3600);
  } catch (e) { /* silent fail */ }

  // 5. Cache check (6h TTL)
  const cacheKey = `insider_${ticker}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log(`[insider] CACHE HIT: ${ticker}`);
    return res.status(200).json(cached);
  }
  console.log(`[insider] CACHE MISS: ${ticker}`);

  // 6. Main processing
  try {
    // CHANGE 2: Cache CIK lookup separately (30 day TTL)
    const cikCacheKey = `sec_cik_${ticker}`;
    let cik = await cache.get(cikCacheKey);

    if (!cik) {
      cik = await tickerToCIK(ticker);
      if (!cik) {
        return res.status(404).json({ error: 'Ticker not found in SEC database.' });
      }
      cache.set(cikCacheKey, cik, 30 * 24 * 3600); // 30 days
    }

    const form4Filings = await fetchForm4Filings(cik);
    if (!form4Filings || form4Filings.length === 0) {
      const emptyResult = {
        ticker,
        transactions: [],
        sentiment: 'NEUTRAL',
        summary: 'No recent insider trading activity found.'
      };
      cache.set(cacheKey, emptyResult, 6 * 3600);
      return res.status(200).json(emptyResult);
    }

    // CHANGE 3: Parse max 4 Form 4s (not 10) with 8s timeout
    const transactions = await parseForm4XMLs(ticker, cik, form4Filings.slice(0, 4));
    const validated = transactions.filter(validateTransaction).slice(0, 10);

    if (validated.length === 0) {
      const emptyResult = {
        ticker,
        transactions: [],
        sentiment: 'NEUTRAL',
        summary: 'No parseable insider transactions found.'
      };
      cache.set(cacheKey, emptyResult, 6 * 3600);
      return res.status(200).json(emptyResult);
    }

    const sentiment = calculateSentiment(validated);
    const result = {
      ticker,
      transactions: validated,
      sentiment,
      summary: generateSummary(validated, sentiment)
    };

    cache.setWithStale(cacheKey, result, 6 * 3600);
    return res.status(200).json(result);

  } catch (error) {
    console.error('[insider] Error:', error.message);

    // Serve last-good insider data rather than blanking the panel when SEC is slow/down.
    const stale = await cache.getStale(cacheKey);
    if (stale) return res.status(200).json({ ...stale, stale: true });

    // Generic error messages only
    const message = error.message.includes('timeout')
      ? 'SEC EDGAR request timed out. Try again.'
      : error.message.includes('403')
      ? 'SEC EDGAR access denied. Try again later.'
      : 'Failed to fetch insider data. Try again.';

    return res.status(500).json({ error: message });
  }
};

/**
 * Convert ticker symbol to SEC CIK number
 * Uses SEC's company tickers JSON endpoint
 * @param {string} ticker - Stock ticker (e.g., "AAPL")
 * @returns {Promise<string|null>} CIK number with leading zeros (e.g., "0000320193")
 */
async function tickerToCIK(ticker) {
  try {
    const url = 'https://www.sec.gov/files/company_tickers.json';
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': SEC_USER_AGENT }
    }, SEC_TIMEOUT);

    if (!response.ok) {
      throw new Error(`SEC API returned ${response.status}`);
    }

    const data = await response.json();

    // Format: { "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }
    for (const key in data) {
      const entry = data[key];
      if (entry.ticker === ticker) {
        // CIK must be 10 digits with leading zeros
        return String(entry.cik_str).padStart(10, '0');
      }
    }

    return null; // Ticker not found
  } catch (error) {
    console.error('[insider] tickerToCIK error:', error.message);
    throw error;
  }
}

/**
 * Fetch Form 4 filings list for a CIK
 * Returns latest filings with accession numbers for XML parsing
 * @param {string} cik - 10-digit CIK with leading zeros
 * @returns {Promise<Array>} Array of filing objects with accessionNumber and filingDate
 */
async function fetchForm4Filings(cik) {
  try {
    // SEC submissions JSON endpoint (no rate limit issues with 6h cache)
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': SEC_USER_AGENT }
    }, SEC_TIMEOUT);

    if (!response.ok) {
      throw new Error(`SEC submissions API returned ${response.status}`);
    }

    const data = await response.json();
    const filings = data.filings?.recent;

    if (!filings || !filings.form || !filings.accessionNumber) {
      return [];
    }

    // Filter Form 4 filings (columnar format)
    const form4Filings = [];
    for (let i = 0; i < filings.form.length; i++) {
      if (filings.form[i] === '4') {
        form4Filings.push({
          accessionNumber: filings.accessionNumber[i],
          filingDate: filings.filingDate[i],
          primaryDocument: filings.primaryDocument[i] || 'wf-form4.xml'
        });
      }
    }

    // Sort by date descending (most recent first)
    form4Filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate));

    return form4Filings;
  } catch (error) {
    console.error('[insider] fetchForm4Filings error:', error.message);
    throw error;
  }
}

/**
 * Parse Form 4 XML files to extract transaction details
 * Uses fast-xml-parser (48KB library, already acceptable size)
 * @param {string} ticker - Stock ticker for logging
 * @param {string} cik - 10-digit CIK with leading zeros
 * @param {Array} filings - Array of filing objects with accessionNumber
 * @returns {Promise<Array>} Array of transaction objects
 */
async function parseForm4XMLs(ticker, cik, filings) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  // CHANGE 3: Wrap entire parsing operation in 8s timeout (Vercel Hobby function limit is 10s)
  const parsePromise = (async () => {
    const allTransactions = [];

    for (const filing of filings) {
      try {
        // Correct URL pattern: CIK (no leading zeros in URL) + accessionNumber (no dashes) + primaryDocument
        const cikPlain = parseInt(cik, 10); // Remove leading zeros for URL
        const accessionNoDashes = filing.accessionNumber.replace(/-/g, '');
        // Strip directory prefix (e.g., "xslF345X06/file.xml" -> "file.xml")
        const xmlFilename = filing.primaryDocument.split('/').pop();
        const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cikPlain}/${accessionNoDashes}/${xmlFilename}`;

        const response = await fetchWithTimeout(xmlUrl, {
          headers: { 'User-Agent': SEC_USER_AGENT }
        }, SEC_TIMEOUT);

        console.log(`[insider] Fetched ${xmlUrl} - status: ${response.status}`);

        if (!response.ok) {
          console.warn(`[insider] Failed to fetch Form 4 XML: ${response.status}`);
          continue; // Skip this filing, try next
        }

        const xmlText = await response.text();

        // Extract XML portion (Form 4 files may include headers)
        const xmlStart = xmlText.indexOf('<?xml');
        const xmlContent = xmlStart >= 0 ? xmlText.substring(xmlStart) : xmlText;

        const parsed = parser.parse(xmlContent);
        console.log(`[insider] Parsed XML keys:`, Object.keys(parsed));
        const transactions = extractTransactionsFromXML(parsed, filing.filingDate);

        allTransactions.push(...transactions);
      } catch (error) {
        console.warn('[insider] Error parsing Form 4:', filing.accessionNumber, error.message);
        continue; // Continue with remaining filings
      }
    }

    return allTransactions;
  })();

  // Race against 8s timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('XML parsing timeout - exceeded 8 seconds')), PARSE_TIMEOUT);
  });

  try {
    return await Promise.race([parsePromise, timeoutPromise]);
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.warn('[insider] PARSE_TIMEOUT hit for ticker:', ticker);
      return []; // Return empty on timeout rather than crashing
    }
    throw error;
  }
}

/**
 * Extract transaction details from parsed Form 4 XML
 * @param {Object} xml - Parsed XML object
 * @param {string} filingDate - ISO date string
 * @returns {Array} Transaction objects
 */
function extractTransactionsFromXML(xml, filingDate) {
  try {
    const doc = xml.ownershipDocument;
    console.log(`[insider] ownershipDocument exists:`, !!doc, doc ? `keys: ${Object.keys(doc).slice(0, 5).join(', ')}` : '');
    if (!doc) return [];

    const reportingOwner = doc.reportingOwner;
    const filerName = reportingOwner?.reportingOwnerId?.rptOwnerName || 'Unknown';

    // Non-derivative transactions (stocks)
    const nonDerivTable = doc.nonDerivativeTable?.nonDerivativeTransaction;
    console.log(`[insider] nonDerivTable exists:`, !!nonDerivTable, `type:`, Array.isArray(nonDerivTable) ? 'array' : typeof nonDerivTable);
    if (!nonDerivTable) return [];

    // Handle both single transaction (object) and multiple (array)
    const transactionList = Array.isArray(nonDerivTable) ? nonDerivTable : [nonDerivTable];

    const transactions = [];
    for (const txn of transactionList) {
      if (!txn) continue;

      const transactionDate = txn.transactionDate?.value || filingDate;
      const transactionCode = txn.transactionCoding?.transactionCode || '';
      console.log(`[insider] Transaction code:`, transactionCode, `date:`, transactionDate);

      // P = Purchase, S = Sale, skip others
      let transactionType = null;
      if (transactionCode === 'P') transactionType = 'BUY';
      else if (transactionCode === 'S') transactionType = 'SELL';
      else continue; // Skip non-buy/sell (gifts, exercises, etc.)

      const shares = parseFloat(txn.transactionAmounts?.transactionShares?.value || 0);
      const pricePerShare = parseFloat(txn.transactionAmounts?.transactionPricePerShare?.value || 0);

      if (shares > 0 && pricePerShare > 0) {
        transactions.push({
          filerName,
          transactionDate,
          transactionType,
          shares: Math.round(shares),
          pricePerShare: parseFloat(pricePerShare.toFixed(2))
        });
      }
    }

    return transactions;
  } catch (error) {
    console.warn('[insider] extractTransactionsFromXML error:', error.message);
    return [];
  }
}

/**
 * Validate transaction data before returning to client
 * Prevents corrupted/incomplete data from reaching frontend
 * @param {Object} transaction - Transaction object
 * @returns {boolean} True if valid
 */
function validateTransaction(transaction) {
  if (!transaction || typeof transaction !== 'object') return false;

  // Required fields
  if (typeof transaction.filerName !== 'string' || transaction.filerName.length === 0) {
    return false;
  }

  if (typeof transaction.transactionDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(transaction.transactionDate)) {
    return false;
  }

  if (!['BUY', 'SELL'].includes(transaction.transactionType)) {
    return false;
  }

  if (typeof transaction.shares !== 'number' || transaction.shares <= 0) {
    return false;
  }

  if (typeof transaction.pricePerShare !== 'number' || transaction.pricePerShare <= 0) {
    return false;
  }

  return true;
}

/**
 * Calculate sentiment based on buy/sell ratio
 * @param {Array} transactions - Validated transaction array
 * @returns {string} 'BULLISH', 'BEARISH', or 'NEUTRAL'
 */
function calculateSentiment(transactions) {
  const buyCount = transactions.filter(t => t.transactionType === 'BUY').length;
  const sellCount = transactions.filter(t => t.transactionType === 'SELL').length;

  if (buyCount > sellCount) return 'BULLISH';
  if (sellCount > buyCount) return 'BEARISH';
  return 'NEUTRAL';
}

/**
 * Generate human-readable summary
 * @param {Array} transactions - Transaction array
 * @param {string} sentiment - Sentiment label
 * @returns {string} Summary text
 */
function generateSummary(transactions, sentiment) {
  const buyCount = transactions.filter(t => t.transactionType === 'BUY').length;
  const sellCount = transactions.filter(t => t.transactionType === 'SELL').length;

  if (sentiment === 'BULLISH') {
    return `${buyCount} insider buy${buyCount !== 1 ? 's' : ''} vs ${sellCount} sell${sellCount !== 1 ? 's' : ''} — insiders are accumulating.`;
  } else if (sentiment === 'BEARISH') {
    return `${sellCount} insider sell${sellCount !== 1 ? 's' : ''} vs ${buyCount} buy${buyCount !== 1 ? 's' : ''} — insiders are reducing positions.`;
  } else {
    return `${buyCount} buy${buyCount !== 1 ? 's' : ''} and ${sellCount} sell${sellCount !== 1 ? 's' : ''} — balanced insider activity.`;
  }
}
