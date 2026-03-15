'use strict';

/**
 * API client — thin wrapper around axios for backend communication.
 */

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  response => response.data,
  error => {
    const msg =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Unknown error';
    console.error('[API]', error.config?.url, msg);
    return Promise.reject(new Error(msg));
  }
);

const ApiClient = {
  // ─── Portfolios ─────────────────────────────────────────────────────────────

  getPortfolios() {
    return api.get('/portfolios');
  },

  createPortfolio(nombre, descripcion = '') {
    return api.post('/portfolios', { nombre, descripcion });
  },

  deletePortfolio(id) {
    return api.delete(`/portfolios/${id}`);
  },

  // ─── Operations ─────────────────────────────────────────────────────────────

  getPortfolio(portfolioId = 1) {
    return api.get('/portfolio', { params: { portfolioId } });
  },

  addOperation(data, portfolioId = 1) {
    return api.post('/portfolio', { ...data, portfolioId });
  },

  updateOperation(id, data) {
    return api.put(`/portfolio/${id}`, data);
  },

  deleteOperation(id) {
    return api.delete(`/portfolio/${id}`);
  },

  // ─── Prices ─────────────────────────────────────────────────────────────────

  getPrice(ticker) {
    return api.get('/price', { params: { ticker } });
  },

  updatePrices(portfolioId = 1) {
    return api.get('/update-prices', { params: { portfolioId } });
  },

  // ─── History ────────────────────────────────────────────────────────────────

  getHistory(days = 365, portfolioId = 1) {
    return api.get('/history', { params: { days, portfolioId } });
  },

  rebuildHistory(portfolioId = 1) {
    return api.get('/history/rebuild', { params: { portfolioId } });
  },

  // ─── Tickers ────────────────────────────────────────────────────────────────

  getTickers(q = '') {
    return api.get('/tickers', { params: { q } });
  },
};
