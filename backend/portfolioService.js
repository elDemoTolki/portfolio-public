'use strict';

const path = require('path');
const fs   = require('fs');
const db = require('./database');
const priceService = require('./priceService');
const betaService  = require('./betaService');
const calculations = require('./calculations');
const yahoo = require('./yahooFinance');

// Build a Map<ticker, categoria> from the local tickers config
function buildCategoriaMap() {
  try {
    const filePath = path.join(__dirname, '..', 'config', 'tickers_chile.json');
    const tickers  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const map = new Map();
    for (const t of tickers) {
      map.set(t.ticker.toUpperCase(), t.categoria || '');
      map.set(t.ticker.replace('.SN', '').toUpperCase(), t.categoria || '');
    }
    return map;
  } catch {
    return new Map();
  }
}

const TICKER_REGEX = /^[A-Za-z0-9\-\.]{1,20}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CURRENCIES = ['CLP', 'USD', 'EUR'];

function validateOperation(data) {
  const errors = [];

  if (!data.ticker || !TICKER_REGEX.test(String(data.ticker).trim())) {
    errors.push('ticker: must be 1-20 alphanumeric characters (hyphens and dots allowed)');
  }

  if (!data.fecha_compra || !DATE_REGEX.test(String(data.fecha_compra))) {
    errors.push('fecha_compra: must be a valid date in YYYY-MM-DD format');
  } else {
    const d = new Date(data.fecha_compra);
    if (isNaN(d.getTime())) {
      errors.push('fecha_compra: invalid date value');
    } else if (d > new Date()) {
      errors.push('fecha_compra: purchase date cannot be in the future');
    }
  }

  const cantidad = Number(data.cantidad);
  if (isNaN(cantidad) || cantidad <= 0) errors.push('cantidad: must be a positive number');

  const precio = Number(data.precio_compra);
  if (isNaN(precio) || precio <= 0) errors.push('precio_compra: must be a positive number');

  if (data.moneda && !VALID_CURRENCIES.includes(String(data.moneda).toUpperCase())) {
    errors.push(`moneda: must be one of ${VALID_CURRENCIES.join(', ')}`);
  }

  const dividendos = Number(data.dividendos);
  if (data.dividendos !== undefined && (isNaN(dividendos) || dividendos < 0)) {
    errors.push('dividendos: must be a non-negative number');
  }

  const comision = Number(data.comision);
  if (data.comision !== undefined && (isNaN(comision) || comision < 0)) {
    errors.push('comision: must be a non-negative number');
  }

  if (errors.length > 0) {
    const err = new Error('Validation failed: ' + errors.join('; '));
    err.statusCode = 400;
    err.validationErrors = errors;
    throw err;
  }
}

function sanitizeOperation(data, portfolioId = 1) {
  return {
    portfolio_id: portfolioId,
    ticker: String(data.ticker).trim().toUpperCase(),
    fecha_compra: String(data.fecha_compra).trim(),
    cantidad: Number(data.cantidad),
    precio_compra: Number(data.precio_compra),
    moneda: String(data.moneda || 'CLP').toUpperCase(),
    dividendos: Number(data.dividendos || 0),
    comision: Number(data.comision || 0),
    nota: String(data.nota || '').trim().slice(0, 500),
    corredora: String(data.corredora || '').trim().slice(0, 100),
    tipo: ['COMPRA', 'VENTA'].includes(String(data.tipo || '').toUpperCase())
      ? String(data.tipo).toUpperCase() : 'COMPRA',
  };
}

/**
 * Get full portfolio with consolidated positions and current prices.
 */
async function getPortfolio(portfolioId = 1) {
  const operations = db.getAllOperations(portfolioId);
  const tickers = [...new Set(operations.map(op => op.ticker))];

  let priceMap = new Map();
  if (tickers.length > 0) {
    try {
      priceMap = await priceService.getPrices(tickers);
    } catch (err) {
      console.error('[PortfolioService] Error fetching prices:', err.message);
    }
  }

  const betaMap      = betaService.getBetas(tickers);
  const categoriaMap = buildCategoriaMap();

  const { positions, metrics } = calculations.buildPortfolioSnapshot(operations, priceMap, betaMap, categoriaMap);

  const byTicker = calculations.groupByTicker(operations);
  for (const pos of positions) {
    pos.operations = (byTicker.get(pos.ticker) || []).map(op => ({
      id: op.id,
      ticker: op.ticker,
      fecha_compra: op.fecha_compra,
      cantidad: op.cantidad,
      precio_compra: op.precio_compra,
      moneda: op.moneda,
      dividendos: op.dividendos,
      comision: op.comision,
      nota: op.nota || '',
      corredora: op.corredora || '',
      tipo: op.tipo || 'COMPRA',
      valor_compra: op.cantidad * op.precio_compra,
    }));
  }

  // Save today's snapshot (once per day)
  try {
    const today = new Date().toISOString().split('T')[0];
    const latest = db.getLatestHistoryDate(portfolioId);
    if (!latest.fecha || latest.fecha !== today) {
      db.insertPortfolioHistory({
        portfolio_id: portfolioId,
        fecha: today,
        valor_total: metrics.totalCurrentValue,
        valor_invertido: metrics.totalInvested,
        ganancia: metrics.totalCapitalGain,
      });
    }
  } catch (e) {
    console.warn('[PortfolioService] Could not save history snapshot:', e.message);
  }

  return { positions, metrics, operations };
}

/**
 * Build full portfolio history from Yahoo Finance historical prices.
 */
async function buildPortfolioHistory(portfolioId = 1) {
  const operations = db.getAllOperations(portfolioId);
  if (operations.length === 0) return [];

  const MIN_HISTORY_DATE = '2025-01-01';
  const rawOldest = operations.reduce(
    (min, op) => (op.fecha_compra < min ? op.fecha_compra : min),
    operations[0].fecha_compra
  );
  const oldestDate = rawOldest < MIN_HISTORY_DATE ? MIN_HISTORY_DATE : rawOldest;

  const tickers = [...new Set(operations.map(op => op.ticker))];
  console.log(`[History] Portfolio ${portfolioId}: building from ${oldestDate} for: ${tickers.join(', ')}`);

  const historicalPrices = {};
  for (const ticker of tickers) {
    try {
      const prices = await yahoo.fetchHistoricalPrices(ticker, oldestDate);
      historicalPrices[ticker] = new Map(prices.map(p => [p.date, p.price]));
      console.log(`[History] ${ticker}: ${prices.length} trading days`);
    } catch (err) {
      console.warn(`[History] No historical prices for ${ticker}: ${err.message}`);
      historicalPrices[ticker] = new Map();
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const allDates = new Set();
  for (const priceMap of Object.values(historicalPrices)) {
    for (const date of priceMap.keys()) allDates.add(date);
  }
  const today = new Date().toISOString().split('T')[0];
  allDates.add(today);
  const sortedDates = [...allDates].filter(d => d >= oldestDate).sort();

  const filledPrices = {};
  for (const ticker of tickers) {
    const raw = historicalPrices[ticker];
    const filled = new Map();
    let lastPrice = null;
    for (const date of sortedDates) {
      if (raw.has(date)) lastPrice = raw.get(date);
      if (lastPrice !== null) filled.set(date, lastPrice);
    }
    filledPrices[ticker] = filled;
  }

  const history = [];
  for (const date of sortedDates) {
    const activeOps = operations.filter(op => op.fecha_compra <= date);
    if (activeOps.length === 0) continue;

    const byTicker = calculations.groupByTicker(activeOps);
    let valorInvertido = 0;
    let valorTotal = 0;

    for (const [ticker, ops] of byTicker) {
      const invested = ops.reduce(
        (sum, op) => sum + Number(op.cantidad) * Number(op.precio_compra) + Number(op.comision || 0),
        0
      );
      valorInvertido += invested;

      const price = filledPrices[ticker]?.get(date);
      if (price) {
        const qty = ops.reduce((sum, op) => sum + Number(op.cantidad), 0);
        valorTotal += qty * price;
      } else {
        valorTotal += invested;
      }
    }

    history.push({
      fecha: date,
      valor_total: valorTotal,
      valor_invertido: valorInvertido,
      ganancia: valorTotal - valorInvertido,
    });
  }

  try {
    db.clearPortfolioHistory(portfolioId);
    const dbInstance = db.getDb();
    const insertStmt = dbInstance.prepare(
      'INSERT OR REPLACE INTO portfolio_history (portfolio_id, fecha, valor_total, valor_invertido, ganancia) VALUES (?, ?, ?, ?, ?)'
    );
    for (const row of history) {
      insertStmt.run(portfolioId, row.fecha, row.valor_total, row.valor_invertido, row.ganancia);
    }
    console.log(`[History] Saved ${history.length} data points for portfolio ${portfolioId}`);
  } catch (e) {
    console.warn('[History] Could not persist history:', e.message);
  }

  return history;
}

/**
 * Get portfolio history. Builds from Yahoo Finance if DB is empty.
 */
async function getPortfolioHistory(days = 365, portfolioId = 1) {
  const existing = db.getPortfolioHistory(days, portfolioId);
  if (existing.length > 1) return existing;
  return buildPortfolioHistory(portfolioId);
}

async function addOperation(rawData, portfolioId = 1) {
  validateOperation(rawData);
  const data = sanitizeOperation(rawData, portfolioId);
  priceService.invalidateCache(data.ticker);
  return db.insertOperation(data);
}

async function updateOperation(id, rawData) {
  const existing = db.getOperationById(id);
  if (!existing) {
    const err = new Error(`Operation with id ${id} not found`);
    err.statusCode = 404;
    throw err;
  }
  validateOperation(rawData);
  const data = sanitizeOperation(rawData, existing.portfolio_id);
  priceService.invalidateCache(data.ticker);
  return db.updateOperation(id, data);
}

async function deleteOperation(id) {
  const deleted = db.deleteOperation(id);
  if (!deleted) {
    const err = new Error(`Operation with id ${id} not found`);
    err.statusCode = 404;
    throw err;
  }
  return deleted;
}

module.exports = {
  getPortfolio,
  addOperation,
  updateOperation,
  deleteOperation,
  getPortfolioHistory,
  buildPortfolioHistory,
  validateOperation,
};
