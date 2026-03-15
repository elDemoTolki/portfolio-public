'use strict';

/**
 * Core financial calculations for the portfolio tracker.
 */

const TODAY = () => new Date().toISOString().split('T')[0];

/**
 * Days between two ISO date strings (YYYY-MM-DD).
 */
function daysBetween(dateA, dateB) {
  return Math.floor((new Date(dateB) - new Date(dateA)) / 86400000);
}

/**
 * Beta = Cov(stock_returns, market_returns) / Var(market_returns)
 * Returns null if fewer than 30 data points.
 */
function calculateBeta(stockReturns, marketReturns) {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 30) return null;
  const meanM = marketReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanS = stockReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let cov = 0, varM = 0;
  for (let i = 0; i < n; i++) {
    cov  += (stockReturns[i] - meanS) * (marketReturns[i] - meanM);
    varM += (marketReturns[i] - meanM) ** 2;
  }
  if (varM === 0) return null;
  return cov / varM;
}

/**
 * XIRR — annualized IRR for irregular cash flows (Newton-Raphson).
 * @param {number[]} cashflows  - negative = outflow, positive = inflow
 * @param {number[]} dayOffsets - days from reference date (first purchase = 0)
 * @returns {number|null} annualized rate as percentage, or null if not solvable
 */
function calcXIRR(cashflows, dayOffsets) {
  if (cashflows.length < 2) return null;
  if (!cashflows.some(cf => cf > 0) || !cashflows.some(cf => cf < 0)) return null;

  const npv  = r => cashflows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, dayOffsets[i] / 365), 0);
  const dnpv = r => cashflows.reduce((s, cf, i) => s - (dayOffsets[i] / 365) * cf / Math.pow(1 + r, dayOffsets[i] / 365 + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 200; i++) {
    const n = npv(r), dn = dnpv(r);
    if (Math.abs(dn) < 1e-12) break;
    const nr = r - n / dn;
    if (!isFinite(nr) || nr <= -1) return null;
    if (Math.abs(nr - r) < 1e-9) { r = nr; break; }
    r = nr;
  }
  return isFinite(r) && r > -1 ? r * 100 : null;
}

/**
 * Calculate consolidated position for a set of operations sharing the same ticker.
 * @param {Array}       operations   - raw DB rows for one ticker
 * @param {number}      currentPrice - current market price
 * @param {number|null} beta         - stock beta (from Yahoo Finance)
 * @param {string}      categoria    - sector category
 */
function consolidatePosition(operations, currentPrice, beta = null, categoria = '') {
  if (!operations || operations.length === 0) return null;

  const ticker = operations[0].ticker;
  const buys   = operations.filter(op => (op.tipo || 'COMPRA') === 'COMPRA');
  const sells  = operations.filter(op => op.tipo === 'VENTA');

  if (buys.length === 0) return null;

  // ── Buys ────────────────────────────────────────────────────────────────────
  let buyQty = 0, totalBuyCost = 0, totalDividends = 0, totalBuyCommission = 0;
  let oldestPurchaseDate = buys[0].fecha_compra;

  for (const op of buys) {
    const qty  = Number(op.cantidad);
    const comm = Number(op.comision || 0);
    buyQty             += qty;
    totalBuyCost       += qty * Number(op.precio_compra) + comm;
    totalDividends     += Number(op.dividendos || 0);
    totalBuyCommission += comm;
    if (op.fecha_compra < oldestPurchaseDate) oldestPurchaseDate = op.fecha_compra;
  }

  // ── Sells ───────────────────────────────────────────────────────────────────
  let sellQty = 0, totalSellProceeds = 0, totalSellCommission = 0;
  for (const op of sells) {
    const qty  = Number(op.cantidad);
    const comm = Number(op.comision || 0);
    sellQty             += qty;
    totalSellProceeds   += qty * Number(op.precio_compra) - comm; // net received
    totalSellCommission += comm;
  }

  const remainingQty    = buyQty - sellQty;
  const avgCostPerShare = buyQty > 0 ? totalBuyCost / buyQty : 0;
  const currentValue    = remainingQty * (currentPrice || 0);
  const totalCommission = totalBuyCommission + totalSellCommission;

  // Realized: proceeds minus cost basis of sold shares
  const realizedGain   = totalSellProceeds - avgCostPerShare * sellQty;
  // Unrealized: current value minus cost basis of remaining shares
  const unrealizedGain = currentValue - avgCostPerShare * remainingQty;
  const capitalGain    = realizedGain + unrealizedGain;

  const capitalGainPercent = totalBuyCost > 0 ? (capitalGain / totalBuyCost) * 100 : 0;
  const totalReturn        = capitalGain + totalDividends;
  const totalReturnPercent = totalBuyCost > 0 ? (totalReturn / totalBuyCost) * 100 : 0;
  const yieldOnCost        = totalBuyCost > 0 ? (totalDividends / totalBuyCost) * 100 : 0;

  const daysInPosition = daysBetween(oldestPurchaseDate, TODAY());

  // XIRR: buys = negative CFs, sells = positive CFs, remaining value = final inflow today
  let irr = null;
  if (daysInPosition >= 30) {
    const cfs  = [];
    const days = [];
    for (const op of buys) {
      cfs.push(-(Number(op.cantidad) * Number(op.precio_compra) + Number(op.comision || 0)));
      days.push(daysBetween(oldestPurchaseDate, op.fecha_compra));
    }
    for (const op of sells) {
      cfs.push(Number(op.cantidad) * Number(op.precio_compra) - Number(op.comision || 0));
      days.push(daysBetween(oldestPurchaseDate, op.fecha_compra));
    }
    if (remainingQty > 0 && currentValue > 0) {
      cfs.push(currentValue);
      days.push(daysInPosition);
    }
    if (cfs.some(cf => cf > 0) && cfs.some(cf => cf < 0)) {
      irr = calcXIRR(cfs, days);
    }
  }

  return {
    ticker,
    categoria,
    quantity: remainingQty,
    avgPrice: avgCostPerShare,
    currentPrice: currentPrice || 0,
    totalInvested: totalBuyCost,
    currentValue,
    realizedGain,
    unrealizedGain,
    capitalGain,
    capitalGainPercent,
    totalDividends,
    totalCommission,
    totalReturn,
    totalReturnPercent,
    yieldOnCost,
    beta,
    daysInPosition,
    irr,
    oldestPurchaseDate,
    operationsCount: operations.length,
    portfolioWeight: 0,
  };
}

/**
 * Calculate full portfolio metrics from all consolidated positions.
 * @param {Array} positions
 */
function calculatePortfolioMetrics(positions) {
  if (!positions || positions.length === 0) {
    return {
      totalInvested: 0, totalCurrentValue: 0,
      totalCapitalGain: 0, totalCapitalGainPercent: 0,
      totalDividends: 0, dividendYieldOnCost: 0,
      totalReturn: 0, totalReturnPercent: 0,
      portfolioBeta: null, positionsCount: 0,
    };
  }

  let totalInvested     = 0;
  let totalCurrentValue = 0;
  let totalDividends    = 0;
  let totalCommission   = 0;

  for (const pos of positions) {
    totalInvested     += pos.totalInvested;
    totalCommission   += pos.totalCommission || 0;
    totalCurrentValue += pos.currentValue;
    totalDividends    += pos.totalDividends;
  }

  if (totalCurrentValue > 0) {
    for (const pos of positions) {
      pos.portfolioWeight = (pos.currentValue / totalCurrentValue) * 100;
    }
  }

  // Weighted portfolio beta (skip positions with null beta)
  let betaWeightedSum = 0;
  let betaWeightSum   = 0;
  for (const pos of positions) {
    if (pos.beta !== null && pos.beta !== undefined && !isNaN(pos.beta)) {
      betaWeightedSum += pos.portfolioWeight * pos.beta;
      betaWeightSum   += pos.portfolioWeight;
    }
  }
  const portfolioBeta = betaWeightSum > 0 ? betaWeightedSum / betaWeightSum : null;

  const totalCapitalGain        = totalCurrentValue - totalInvested;
  const totalCapitalGainPercent = totalInvested > 0 ? (totalCapitalGain / totalInvested) * 100 : 0;
  const totalReturn             = totalCapitalGain + totalDividends;
  const totalReturnPercent      = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
  const dividendYieldOnCost     = totalInvested > 0 ? (totalDividends / totalInvested) * 100 : 0;

  return {
    totalInvested,
    totalCurrentValue,
    totalCapitalGain,
    totalCapitalGainPercent,
    totalDividends,
    dividendYieldOnCost,
    totalReturn,
    totalReturnPercent,
    portfolioBeta,
    positionsCount: positions.length,
  };
}

/**
 * Group raw operations array by ticker.
 */
function groupByTicker(operations) {
  const map = new Map();
  for (const op of operations) {
    const key = op.ticker.toUpperCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(op);
  }
  return map;
}

/**
 * Build a complete portfolio snapshot.
 * @param {Array}              operations   - all DB operations
 * @param {Map<string,number>} priceMap     - ticker -> current price
 * @param {Map<string,number>} betaMap      - ticker -> beta (optional)
 * @param {Map<string,string>} categoriaMap - ticker -> categoria (optional)
 */
function buildPortfolioSnapshot(operations, priceMap, betaMap = new Map(), categoriaMap = new Map()) {
  const byTicker = groupByTicker(operations);
  const positions = [];

  for (const [ticker, ops] of byTicker) {
    const currentPrice = priceMap.get(ticker) || priceMap.get(`${ticker}.SN`) || 0;
    const beta         = betaMap.get(ticker)  || betaMap.get(`${ticker}.SN`)  || null;
    const categoria    = categoriaMap.get(ticker) || categoriaMap.get(`${ticker}.SN`) || '';
    const position     = consolidatePosition(ops, currentPrice, beta, categoria);
    if (position) positions.push(position);
  }

  positions.sort((a, b) => b.currentValue - a.currentValue);

  const metrics = calculatePortfolioMetrics(positions);

  return { positions, metrics };
}

function formatCLP(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
}

function round(value, decimals = 2) {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

module.exports = {
  consolidatePosition,
  calculatePortfolioMetrics,
  groupByTicker,
  buildPortfolioSnapshot,
  calculateBeta,
  calcXIRR,
  formatCLP,
  round,
};
