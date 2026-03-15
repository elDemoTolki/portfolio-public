'use strict';

const NodeCache = require('node-cache');
const db = require('./database');
const yahoo = require('./yahooFinance');

// In-memory cache: 5 minute TTL, check every 60 seconds
const priceCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Get price for a single ticker.
 * Checks in-memory cache → DB cache → Yahoo Finance.
 * @param {string} ticker
 * @returns {{ ticker, precio, currency, name, change, changePercent, fromCache }}
 */
async function getPrice(ticker) {
  const symbol = yahoo.ensureSuffix(ticker);

  // 1. Check in-memory cache
  const memCached = priceCache.get(symbol);
  if (memCached) {
    return { ...memCached, fromCache: true };
  }

  // 2. Check DB cache (valid if < 5 minutes old)
  const dbCached = db.getCachedPrice(symbol);
  if (dbCached && dbCached.last_update) {
    const ageSeconds = (Date.now() - new Date(dbCached.last_update).getTime()) / 1000;
    if (ageSeconds < CACHE_TTL_SECONDS) {
      const data = {
        ticker: symbol,
        precio: dbCached.precio,
        currency: dbCached.currency || 'CLP',
        beta: dbCached.beta ?? null,
        fromCache: true,
      };
      priceCache.set(symbol, data);
      return data;
    }
  }

  // 3. Fetch from Yahoo Finance
  try {
    const fresh = await yahoo.fetchPrice(symbol);
    db.upsertCachedPrice(symbol, fresh.precio, fresh.currency, fresh.beta ?? null);
    priceCache.set(symbol, fresh);
    return { ...fresh, fromCache: false };
  } catch (err) {
    // If we have stale DB data, return it with a warning
    if (dbCached && dbCached.precio) {
      console.warn(`[PriceService] Using stale cache for ${symbol}: ${err.message}`);
      return {
        ticker: symbol,
        precio: dbCached.precio,
        currency: dbCached.currency || 'CLP',
        fromCache: true,
        stale: true,
      };
    }
    throw err;
  }
}

/**
 * Get prices for multiple tickers.
 * Returns a Map<string, number> of ticker -> price.
 */
async function getPrices(tickers) {
  const priceMap = new Map();
  const toFetch = [];

  // Check in-memory cache first
  for (const ticker of tickers) {
    const symbol = yahoo.ensureSuffix(ticker);
    const cached = priceCache.get(symbol);
    if (cached) {
      priceMap.set(ticker.toUpperCase(), cached.precio);
      priceMap.set(symbol, cached.precio);
    } else {
      toFetch.push(ticker);
    }
  }

  if (toFetch.length === 0) return priceMap;

  // Check DB cache for remaining
  const stillToFetch = [];
  for (const ticker of toFetch) {
    const symbol = yahoo.ensureSuffix(ticker);
    const dbCached = db.getCachedPrice(symbol);
    if (dbCached && dbCached.last_update) {
      const ageSeconds = (Date.now() - new Date(dbCached.last_update).getTime()) / 1000;
      if (ageSeconds < CACHE_TTL_SECONDS) {
        priceMap.set(ticker.toUpperCase(), dbCached.precio);
        priceMap.set(symbol, dbCached.precio);
        priceCache.set(symbol, { ticker: symbol, precio: dbCached.precio, currency: dbCached.currency, beta: dbCached.beta ?? null });
        continue;
      }
    }
    stillToFetch.push(ticker);
  }

  if (stillToFetch.length > 0) {
    const symbols = stillToFetch.map(yahoo.ensureSuffix);
    const { results } = await yahoo.fetchPrices(symbols);

    for (const [symbol, data] of Object.entries(results)) {
      db.upsertCachedPrice(symbol, data.precio, data.currency, data.beta ?? null);
      priceCache.set(symbol, data);
      // Map both with and without suffix
      const base = symbol.replace('.SN', '');
      priceMap.set(base, data.precio);
      priceMap.set(symbol, data.precio);
    }

    // For tickers that failed, try stale DB data
    for (const ticker of stillToFetch) {
      const symbol = yahoo.ensureSuffix(ticker);
      if (!priceMap.has(symbol)) {
        const stale = db.getCachedPrice(symbol);
        if (stale && stale.precio) {
          priceMap.set(ticker.toUpperCase(), stale.precio);
          priceMap.set(symbol, stale.precio);
        }
      }
    }
  }

  return priceMap;
}

/**
 * Force refresh all prices for tickers in portfolio.
 */
async function refreshAllPrices(tickers) {
  if (tickers.length === 0) return { updated: 0, errors: [] };

  const symbols = tickers.map(yahoo.ensureSuffix);
  const { results, errors } = await yahoo.fetchPrices(symbols);

  let updated = 0;
  for (const [symbol, data] of Object.entries(results)) {
    db.upsertCachedPrice(symbol, data.precio, data.currency, data.beta ?? null);
    priceCache.set(symbol, data);
    updated++;
  }

  return {
    updated,
    errors: Object.entries(errors).map(([t, msg]) => ({ ticker: t, error: msg })),
  };
}

/**
 * Get beta values for a list of tickers from in-memory cache.
 * Beta is populated after getPrices() fetches from Yahoo Finance.
 * Returns Map<ticker, number|null>
 */
function getBetas(tickers) {
  const betaMap = new Map();
  for (const ticker of tickers) {
    const symbol = yahoo.ensureSuffix(ticker);
    const cached = priceCache.get(symbol);
    if (cached && cached.beta !== undefined && cached.beta !== null) {
      betaMap.set(ticker.toUpperCase(), cached.beta);
      betaMap.set(symbol, cached.beta);
    }
  }
  return betaMap;
}

/**
 * Invalidate cache for a specific ticker.
 */
function invalidateCache(ticker) {
  const symbol = yahoo.ensureSuffix(ticker);
  priceCache.del(symbol);
}

module.exports = { getPrice, getPrices, getBetas, refreshAllPrices, invalidateCache };
