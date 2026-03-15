'use strict';

const express = require('express');
const router = express.Router();
const portfolioService = require('./portfolioService');
const priceService = require('./priceService');
const betaService  = require('./betaService');
const db = require('./database');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function sendError(res, err) {
  const status = err.statusCode || 500;
  const body = { error: err.message || 'Internal server error' };
  if (err.validationErrors) body.details = err.validationErrors;
  res.status(status).json(body);
}

function parsePortfolioId(req) {
  const id = parseInt(req.query.portfolioId || req.body?.portfolioId || '1', 10);
  return isNaN(id) || id <= 0 ? 1 : id;
}

// ─── Portfolios Management ────────────────────────────────────────────────────

/**
 * GET /api/portfolios
 * List all portfolios.
 */
router.get('/portfolios', asyncHandler(async (req, res) => {
  const portfolios = db.getAllPortfolios();
  res.json({ success: true, data: portfolios });
}));

/**
 * POST /api/portfolios
 * Create a new portfolio.
 * Body: { nombre, descripcion? }
 */
router.post('/portfolios', asyncHandler(async (req, res) => {
  const { nombre, descripcion } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
    return res.status(400).json({ error: 'nombre is required' });
  }
  if (nombre.trim().length > 80) {
    return res.status(400).json({ error: 'nombre must be 80 characters or less' });
  }
  const portfolio = db.insertPortfolio(nombre, descripcion || '');
  res.status(201).json({ success: true, data: portfolio });
}));

/**
 * PUT /api/portfolios/:id
 * Rename a portfolio.
 * Body: { nombre, descripcion? }
 */
router.put('/portfolios/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid portfolio ID' });

  const existing = db.getPortfolioById(id);
  if (!existing) return res.status(404).json({ error: 'Portfolio not found' });

  const { nombre, descripcion } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
    return res.status(400).json({ error: 'nombre is required' });
  }
  const updated = db.updatePortfolio(id, nombre, descripcion || '');
  res.json({ success: true, data: updated });
}));

/**
 * DELETE /api/portfolios/:id
 * Delete a portfolio and all its operations.
 */
router.delete('/portfolios/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid portfolio ID' });
  if (id === 1) return res.status(400).json({ error: 'Cannot delete the default portfolio' });

  const deleted = db.deletePortfolio(id);
  if (!deleted) return res.status(404).json({ error: 'Portfolio not found' });

  res.json({ success: true, data: deleted, message: 'Portfolio deleted' });
}));

// ─── Portfolio Routes ─────────────────────────────────────────────────────────

/**
 * GET /api/portfolio?portfolioId=1
 */
router.get('/portfolio', asyncHandler(async (req, res) => {
  const portfolioId = parsePortfolioId(req);
  const data = await portfolioService.getPortfolio(portfolioId);
  res.json({ success: true, data, timestamp: new Date().toISOString() });
}));

/**
 * POST /api/portfolio
 * Body: { portfolioId, ticker, fecha_compra, cantidad, precio_compra, moneda, dividendos, comision }
 */
router.post('/portfolio', asyncHandler(async (req, res) => {
  const portfolioId = parsePortfolioId(req);
  const operation = await portfolioService.addOperation(req.body, portfolioId);
  res.status(201).json({ success: true, data: operation, message: 'Operation created successfully' });
}));

/**
 * PUT /api/portfolio/:id
 */
router.put('/portfolio/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid operation ID' });
  const operation = await portfolioService.updateOperation(id, req.body);
  res.json({ success: true, data: operation, message: 'Operation updated successfully' });
}));

/**
 * DELETE /api/portfolio/:id
 */
router.delete('/portfolio/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid operation ID' });
  const deleted = await portfolioService.deleteOperation(id);
  res.json({ success: true, data: deleted, message: 'Operation deleted successfully' });
}));

// ─── Price Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/price?ticker=SQM-B.SN
 */
router.get('/price', asyncHandler(async (req, res) => {
  const { ticker } = req.query;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'ticker query parameter is required' });
  }
  const trimmed = ticker.trim();
  if (!/^[A-Za-z0-9\-\.]{1,30}$/.test(trimmed)) {
    return res.status(400).json({ error: 'Invalid ticker format' });
  }
  const data = await priceService.getPrice(trimmed);
  res.json({ success: true, data, timestamp: new Date().toISOString() });
}));

/**
 * GET /api/update-prices?portfolioId=1
 */
router.get('/update-prices', asyncHandler(async (req, res) => {
  const portfolioId = parsePortfolioId(req);
  const tickers = db.getDistinctTickers(portfolioId);
  if (tickers.length === 0) {
    return res.json({ success: true, message: 'No tickers in portfolio', updated: 0 });
  }
  const result = await priceService.refreshAllPrices(tickers);
  res.json({ success: true, message: `Updated ${result.updated} prices`, ...result, timestamp: new Date().toISOString() });
}));

// ─── History Routes ───────────────────────────────────────────────────────────

/**
 * GET /api/history?portfolioId=1&days=365
 */
router.get('/history', asyncHandler(async (req, res) => {
  const portfolioId = parsePortfolioId(req);
  const days = Math.min(parseInt(req.query.days || '365', 10), 365);
  const history = await portfolioService.getPortfolioHistory(isNaN(days) ? 365 : days, portfolioId);
  res.json({ success: true, data: history });
}));

/**
 * GET /api/history/rebuild?portfolioId=1
 */
router.get('/history/rebuild', asyncHandler(async (req, res) => {
  const portfolioId = parsePortfolioId(req);
  const history = await portfolioService.buildPortfolioHistory(portfolioId);
  res.json({ success: true, message: `Rebuilt history with ${history.length} data points`, data: history });
}));

/**
 * GET /api/beta/recalculate?portfolioId=1
 */
router.get('/beta/recalculate', asyncHandler(async (req, res) => {
  const portfolioId = parsePortfolioId(req);
  const tickers = db.getDistinctTickers(portfolioId);
  if (tickers.length === 0) {
    return res.json({ success: true, message: 'No tickers to calculate beta for' });
  }
  const betaMap = await betaService.recalculate(tickers);
  const result = {};
  for (const [k, v] of betaMap) result[k] = v;
  res.json({ success: true, message: `Beta calculated for ${betaMap.size / 2} tickers`, data: result });
}));

// ─── Tickers Autocomplete ─────────────────────────────────────────────────────

router.get('/tickers', asyncHandler(async (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const filePath = path.join(__dirname, '..', 'config', 'tickers_chile.json');
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const tickers = JSON.parse(content);
    const q = (req.query.q || '').toUpperCase();
    const filtered = q
      ? tickers.filter(t => t.ticker.includes(q) || t.name.toUpperCase().includes(q))
      : tickers;
    res.json({ success: true, data: filtered.slice(0, 20) });
  } catch {
    res.json({ success: true, data: [] });
  }
}));

// ─── Error Handler ────────────────────────────────────────────────────────────

router.use((err, req, res, _next) => {
  console.error(`[Routes] Error on ${req.method} ${req.path}:`, err.message);
  sendError(res, err);
});

module.exports = router;
