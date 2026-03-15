'use strict';

/**
 * Beta calculation service.
 * Computes beta for each ticker relative to the IPSA index using
 * 1 year of daily historical returns. Results are cached for 24 hours.
 */

const NodeCache    = require('node-cache');
const yahoo        = require('./yahooFinance');
const calculations = require('./calculations');

// ECH = iShares MSCI Chile ETF (NYSE) — proxy for Chilean market, full historical data
const MARKET_TICKER = 'ECH';
const LOOKBACK_DAYS = 365;

// Cache for 24 hours; check every hour
const betaCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
const CACHE_KEY = 'portfolio_betas';

let _calculating = false;

/**
 * Returns cached beta map immediately.
 * If the cache is empty, triggers a background calculation.
 * @param {string[]} tickers
 * @returns {Map<string, number>}
 */
function getBetas(tickers) {
  const cached = betaCache.get(CACHE_KEY);
  if (cached) return cached;

  // Trigger background calculation (non-blocking)
  if (!_calculating) {
    _calculateAndCache(tickers).catch(err =>
      console.error('[Beta] Background calculation failed:', err.message)
    );
  }

  return new Map();
}

/**
 * Force recalculation and await the result.
 * @param {string[]} tickers
 * @returns {Promise<Map<string, number>>}
 */
async function recalculate(tickers) {
  betaCache.del(CACHE_KEY);
  return _calculateAndCache(tickers);
}

async function _calculateAndCache(tickers) {
  if (_calculating) return betaCache.get(CACHE_KEY) || new Map();
  _calculating = true;

  try {
    console.log('[Beta] Calculating betas vs IPSA for:', tickers.join(', '));

    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    const startStr = startDate.toISOString().split('T')[0];

    // Fetch IPSA historical prices
    let marketHistory;
    try {
      marketHistory = await yahoo.fetchHistoricalPrices(MARKET_TICKER, startStr, { raw: true });
    } catch (err) {
      console.error('[Beta] Could not fetch IPSA data:', err.message);
      return new Map();
    }

    if (marketHistory.length < 30) {
      console.warn('[Beta] Not enough IPSA data points:', marketHistory.length);
      return new Map();
    }

    const marketMap   = new Map(marketHistory.map(d => [d.date, d.price]));
    const sortedDates = [...marketMap.keys()].sort();

    // Compute market daily returns
    const marketReturns = _dailyReturns(sortedDates, marketMap);

    const betaMap = new Map();

    for (const ticker of tickers) {
      await new Promise(r => setTimeout(r, 300)); // avoid rate limiting
      try {
        const tickerHistory = await yahoo.fetchHistoricalPrices(ticker, startStr);
        const tickerMap     = new Map(tickerHistory.map(d => [d.date, d.price]));

        // Use only dates where both ticker and market have prices
        const commonDates = sortedDates.filter(d => tickerMap.has(d));
        if (commonDates.length < 30) {
          console.warn(`[Beta] Not enough common dates for ${ticker}: ${commonDates.length}`);
          continue;
        }

        const mReturns = _dailyReturns(commonDates, marketMap);
        const sReturns = _dailyReturns(commonDates, tickerMap);

        const beta = calculations.calculateBeta(sReturns, mReturns);
        if (beta !== null && isFinite(beta)) {
          const base = ticker.toUpperCase().replace('.SN', '');
          betaMap.set(base, beta);
          betaMap.set(`${base}.SN`, beta);
          console.log(`[Beta] ${base}: ${beta.toFixed(3)}`);
        }
      } catch (err) {
        console.warn(`[Beta] Could not compute beta for ${ticker}:`, err.message);
      }
    }

    betaCache.set(CACHE_KEY, betaMap);
    console.log(`[Beta] Done. ${betaMap.size / 2} tickers with beta.`);
    return betaMap;
  } finally {
    _calculating = false;
  }
}

/**
 * Compute daily returns array from an ordered list of dates and a price map.
 * Returns an array of length (dates.length - 1).
 */
function _dailyReturns(sortedDates, priceMap) {
  const returns = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = priceMap.get(sortedDates[i - 1]);
    const curr = priceMap.get(sortedDates[i]);
    if (prev && curr && prev > 0) {
      const r = curr / prev - 1;
      if (isFinite(r)) returns.push(r);
    }
  }
  return returns;
}

module.exports = { getBetas, recalculate };
