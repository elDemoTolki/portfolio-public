'use strict';

const axios = require('axios');

const YAHOO_BASE  = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const YAHOO_BASE2 = 'https://query2.finance.yahoo.com/v8/finance/chart/';
const YAHOO_QUOTE = 'https://query2.finance.yahoo.com/v7/finance/quote';

const REQUEST_TIMEOUT = 10000; // 10s

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetch current price for a single ticker from Yahoo Finance.
 * Chilean tickers must already have the .SN suffix.
 * @param {string} ticker - e.g. "SQM-B.SN"
 * @returns {{ ticker, precio, currency, name, change, changePercent, volume, marketCap }}
 */
async function fetchPrice(ticker) {
  const symbol = ensureSuffix(ticker);

  try {
    // Try v7 quote endpoint first (faster)
    const url = `${YAHOO_QUOTE}?symbols=${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,longName,shortName,currency,beta`;
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: REQUEST_TIMEOUT,
    });

    const result = response.data?.quoteResponse?.result;
    if (!result || result.length === 0) {
      throw new Error(`No quote data for ${symbol}`);
    }

    const quote = result[0];
    const price = quote.regularMarketPrice;

    if (price === undefined || price === null) {
      throw new Error(`No price for ${symbol}`);
    }

    return {
      ticker: symbol,
      precio: price,
      currency: quote.currency || 'CLP',
      name: quote.longName || quote.shortName || symbol,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      volume: quote.regularMarketVolume || 0,
      marketCap: quote.marketCap || 0,
      beta: quote.beta ?? null,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    // Fallback to chart endpoint
    return fetchPriceFromChart(symbol);
  }
}

/**
 * Fallback: fetch price from the chart endpoint.
 */
async function fetchPriceFromChart(symbol) {
  const url = `${YAHOO_BASE}${encodeURIComponent(symbol)}?range=1d&interval=1m`;
  const response = await axios.get(url, {
    headers: HEADERS,
    timeout: REQUEST_TIMEOUT,
  });

  const chart = response.data?.chart;
  if (!chart || chart.error) {
    throw new Error(chart?.error?.description || `Chart error for ${symbol}`);
  }

  const result = chart.result?.[0];
  if (!result) {
    throw new Error(`No chart result for ${symbol}`);
  }

  const meta = result.meta;
  const price = meta.regularMarketPrice || meta.previousClose;

  if (!price) {
    throw new Error(`No price in chart for ${symbol}`);
  }

  return {
    ticker: symbol,
    precio: price,
    currency: meta.currency || 'CLP',
    name: meta.longName || meta.shortName || symbol,
    change: 0,
    changePercent: 0,
    volume: meta.regularMarketVolume || 0,
    marketCap: 0,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetch prices for multiple tickers in batch.
 * Returns a map of ticker -> price data.
 */
async function fetchPrices(tickers) {
  const symbols = tickers.map(ensureSuffix);
  const results = {};
  const errors = {};

  // Batch request up to 10 tickers at a time to avoid rate limiting
  const BATCH_SIZE = 10;
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (symbol) => {
        try {
          const data = await fetchPrice(symbol);
          results[symbol] = data;
        } catch (err) {
          errors[symbol] = err.message;
          console.error(`[Yahoo] Error fetching ${symbol}:`, err.message);
        }
      })
    );

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < symbols.length) {
      await delay(500);
    }
  }

  return { results, errors };
}

/**
 * Ensure ticker has .SN suffix for Chilean stocks.
 * If already has a suffix (contains '.'), leave it as-is.
 */
function ensureSuffix(ticker) {
  const t = ticker.toUpperCase().trim();
  if (t.includes('.') || t.startsWith('^')) return t;
  return `${t}.SN`;
}

/**
 * Fetch daily historical closing prices for a ticker.
 * @param {string} ticker - e.g. "SQM-B.SN"
 * @param {string} startDate - ISO date string "YYYY-MM-DD"
 * @returns {Array<{ date: string, price: number }>}
 */
async function fetchHistoricalPrices(ticker, startDate, { raw = false } = {}) {
  const symbol = raw ? ticker.toUpperCase().trim() : ensureSuffix(ticker);
  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(Date.now() / 1000);

  const url = `${YAHOO_BASE2}${encodeURIComponent(symbol)}?period1=${startTs}&period2=${endTs}&interval=1d`;
  const response = await axios.get(url, {
    headers: HEADERS,
    timeout: 20000,
  });

  const chart = response.data?.chart;
  if (chart?.error) throw new Error(chart.error.description || `Chart error for ${symbol}`);

  const result = chart?.result?.[0];
  if (!result) throw new Error(`No historical data for ${symbol}`);

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      price: closes[i],
    }))
    .filter(d => d.price !== null && d.price !== undefined && !isNaN(d.price));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { fetchPrice, fetchPrices, fetchHistoricalPrices, ensureSuffix };
