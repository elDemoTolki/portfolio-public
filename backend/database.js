'use strict';

/**
 * Database layer using Node.js built-in sqlite module (Node >= 22.5.0).
 * No native compilation needed.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'db');
const DB_PATH = path.join(DB_DIR, 'portfolio.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  // Core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL DEFAULT 1,
      ticker TEXT NOT NULL,
      fecha_compra DATE NOT NULL,
      cantidad REAL NOT NULL,
      precio_compra REAL NOT NULL,
      moneda TEXT NOT NULL DEFAULT 'CLP',
      dividendos REAL DEFAULT 0,
      comision REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_cache (
      ticker TEXT PRIMARY KEY,
      precio REAL,
      currency TEXT DEFAULT 'CLP',
      last_update TEXT
    );

    CREATE TABLE IF NOT EXISTS portfolio_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL DEFAULT 1,
      fecha TEXT NOT NULL,
      valor_total REAL NOT NULL,
      valor_invertido REAL NOT NULL,
      ganancia REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_operaciones_ticker ON operaciones(ticker)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_operaciones_portfolio ON operaciones(portfolio_id)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_portfolio_history_fecha ON portfolio_history(fecha)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_portfolio_history_pid ON portfolio_history(portfolio_id)'); } catch (_) {}

  // Migrations: add columns if they don't exist yet
  try { db.exec('ALTER TABLE operaciones ADD COLUMN portfolio_id INTEGER NOT NULL DEFAULT 1'); } catch (_) {}
  try { db.exec('ALTER TABLE portfolio_history ADD COLUMN portfolio_id INTEGER NOT NULL DEFAULT 1'); } catch (_) {}
  try { db.exec("ALTER TABLE operaciones ADD COLUMN nota TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec('ALTER TABLE price_cache ADD COLUMN beta REAL'); } catch (_) {}
  try { db.exec("ALTER TABLE operaciones ADD COLUMN corredora TEXT DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE operaciones ADD COLUMN tipo TEXT DEFAULT 'COMPRA'"); } catch (_) {}

  // Ensure default portfolio exists
  db.exec(`INSERT OR IGNORE INTO portfolios (id, nombre, descripcion) VALUES (1, 'Principal', 'Portafolio principal')`);
}

// ─── Portfolio CRUD ───────────────────────────────────────────────────────────

function getAllPortfolios() {
  return getDb().prepare(`
    SELECT p.*, COUNT(o.id) as num_operaciones
    FROM portfolios p
    LEFT JOIN operaciones o ON o.portfolio_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at ASC
  `).all();
}

function getPortfolioById(id) {
  return getDb().prepare('SELECT * FROM portfolios WHERE id = ?').get(id);
}

function insertPortfolio(nombre, descripcion = '') {
  const result = getDb()
    .prepare('INSERT INTO portfolios (nombre, descripcion) VALUES (?, ?)')
    .run(nombre.trim(), descripcion.trim());
  return getDb().prepare('SELECT * FROM portfolios WHERE id = ?').get(result.lastInsertRowid);
}

function updatePortfolio(id, nombre, descripcion) {
  getDb().prepare('UPDATE portfolios SET nombre = ?, descripcion = ? WHERE id = ?')
    .run(nombre.trim(), descripcion.trim(), id);
  return getPortfolioById(id);
}

function deletePortfolio(id) {
  const existing = getPortfolioById(id);
  if (!existing) return null;
  getDb().prepare('DELETE FROM portfolio_history WHERE portfolio_id = ?').run(id);
  getDb().prepare('DELETE FROM operaciones WHERE portfolio_id = ?').run(id);
  getDb().prepare('DELETE FROM portfolios WHERE id = ?').run(id);
  return existing;
}

// ─── Operations CRUD ──────────────────────────────────────────────────────────

function getAllOperations(portfolioId = 1) {
  return getDb()
    .prepare('SELECT * FROM operaciones WHERE portfolio_id = ? ORDER BY ticker, fecha_compra')
    .all(portfolioId);
}

function getOperationById(id) {
  return getDb().prepare('SELECT * FROM operaciones WHERE id = ?').get(id);
}

function insertOperation(op) {
  const portfolioId = op.portfolio_id || 1;
  const stmt = getDb().prepare(`
    INSERT INTO operaciones (portfolio_id, ticker, fecha_compra, cantidad, precio_compra, moneda, dividendos, comision, nota, corredora, tipo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    portfolioId, op.ticker, op.fecha_compra, op.cantidad, op.precio_compra,
    op.moneda, op.dividendos, op.comision, op.nota || '', op.corredora || '',
    op.tipo || 'COMPRA'
  );
  return getDb().prepare('SELECT * FROM operaciones WHERE id = ?').get(result.lastInsertRowid);
}

function updateOperation(id, op) {
  getDb().prepare(`
    UPDATE operaciones
    SET ticker = ?, fecha_compra = ?, cantidad = ?, precio_compra = ?,
        moneda = ?, dividendos = ?, comision = ?, nota = ?, corredora = ?, tipo = ?
    WHERE id = ?
  `).run(
    op.ticker, op.fecha_compra, op.cantidad, op.precio_compra,
    op.moneda, op.dividendos, op.comision, op.nota || '', op.corredora || '',
    op.tipo || 'COMPRA', id
  );
  return getDb().prepare('SELECT * FROM operaciones WHERE id = ?').get(id);
}

function deleteOperation(id) {
  const existing = getOperationById(id);
  if (!existing) return null;
  getDb().prepare('DELETE FROM operaciones WHERE id = ?').run(id);
  return existing;
}

function getDistinctTickers(portfolioId = 1) {
  return getDb()
    .prepare('SELECT DISTINCT ticker FROM operaciones WHERE portfolio_id = ? ORDER BY ticker')
    .all(portfolioId)
    .map(r => r.ticker);
}

// ─── Price Cache ──────────────────────────────────────────────────────────────

function getCachedPrice(ticker) {
  return getDb().prepare('SELECT * FROM price_cache WHERE ticker = ?').get(ticker);
}

function upsertCachedPrice(ticker, precio, currency = 'CLP', beta = null) {
  getDb().prepare(`
    INSERT INTO price_cache (ticker, precio, currency, beta, last_update)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ticker) DO UPDATE SET
      precio = excluded.precio,
      currency = excluded.currency,
      beta = excluded.beta,
      last_update = excluded.last_update
  `).run(ticker, precio, currency, beta ?? null);
}

function getAllCachedPrices() {
  return getDb().prepare('SELECT * FROM price_cache').all();
}

// ─── Portfolio History ────────────────────────────────────────────────────────

function insertPortfolioHistory(record) {
  const portfolioId = record.portfolio_id || 1;
  getDb().prepare(`
    INSERT INTO portfolio_history (portfolio_id, fecha, valor_total, valor_invertido, ganancia)
    VALUES (?, ?, ?, ?, ?)
  `).run(portfolioId, record.fecha, record.valor_total, record.valor_invertido, record.ganancia);
}

function getPortfolioHistory(days = 365, portfolioId = 1) {
  return getDb().prepare(`
    SELECT fecha, valor_total, valor_invertido, ganancia
    FROM portfolio_history
    WHERE portfolio_id = ?
      AND fecha >= MAX(date('now', '-' || ? || ' days'), '2025-01-01')
    ORDER BY fecha ASC
  `).all(portfolioId, days);
}

function getLatestHistoryDate(portfolioId = 1) {
  return getDb()
    .prepare('SELECT MAX(fecha) as fecha FROM portfolio_history WHERE portfolio_id = ?')
    .get(portfolioId);
}

function clearPortfolioHistory(portfolioId = 1) {
  getDb().prepare('DELETE FROM portfolio_history WHERE portfolio_id = ?').run(portfolioId);
}

module.exports = {
  getDb,
  getAllPortfolios,
  getPortfolioById,
  insertPortfolio,
  updatePortfolio,
  deletePortfolio,
  getAllOperations,
  getOperationById,
  insertOperation,
  updateOperation,
  deleteOperation,
  getDistinctTickers,
  getCachedPrice,
  upsertCachedPrice,
  getAllCachedPrices,
  insertPortfolioHistory,
  getPortfolioHistory,
  getLatestHistoryDate,
  clearPortfolioHistory,
};
