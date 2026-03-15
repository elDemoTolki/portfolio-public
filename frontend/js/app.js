'use strict';

/**
 * App — main orchestrator.
 */

const App = (() => {
  let state = {
    portfolios: [],
    currentPortfolioId: 1,
    portfolio: null,
    history: [],
    loading: false,
    lastUpdated: null,
    autoRefreshInterval: null,
  };

  const AUTO_REFRESH_MS = 60 * 1000;

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  async function init() {
    Portfolio.init({ onSaved: refresh, getPortfolioId: () => state.currentPortfolioId });

    Table.setHandlers({
      onEdit: (id) => {
        const op = (state.portfolio?.operations || []).find(o => o.id === id);
        if (op) Portfolio.openModal(op);
      },
      onDelete: (id, ticker) => Portfolio.deleteOperation(id, ticker),
    });

    document.getElementById('btn-refresh')?.addEventListener('click', forceRefresh);
    document.getElementById('btn-update-prices')?.addEventListener('click', updatePrices);
    document.getElementById('btn-rebuild-history')?.addEventListener('click', rebuildHistory);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);

    initPortfolioSelector();
    initPortfolioModal();

    Dashboard.showLoading();
    Table.showLoading();

    // Load portfolios first, then load data for the active one
    await loadPortfolios();
    await refresh();
    startAutoRefresh();
  }

  // ─── Portfolio Selector ────────────────────────────────────────────────────

  function initPortfolioSelector() {
    const btn = document.getElementById('btn-portfolio-selector');
    const dropdown = document.getElementById('portfolio-dropdown');

    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#portfolio-selector')) {
        dropdown?.classList.add('hidden');
      }
    });
  }

  async function loadPortfolios() {
    try {
      const res = await ApiClient.getPortfolios();
      state.portfolios = res.data || [];

      // Restore last used portfolio from localStorage
      const saved = parseInt(localStorage.getItem('currentPortfolioId') || '1', 10);
      const exists = state.portfolios.find(p => p.id === saved);
      state.currentPortfolioId = exists ? saved : (state.portfolios[0]?.id || 1);

      renderPortfolioSelector();
    } catch (err) {
      console.error('[App] Could not load portfolios:', err.message);
    }
  }

  function renderPortfolioSelector() {
    const dropdown = document.getElementById('portfolio-dropdown');
    const nameEl = document.getElementById('portfolio-current-name');
    if (!dropdown) return;

    const current = state.portfolios.find(p => p.id === state.currentPortfolioId);
    if (nameEl) nameEl.textContent = current?.nombre || 'Portafolio';

    dropdown.innerHTML = '';

    for (const p of state.portfolios) {
      const item = document.createElement('button');
      item.className = 'portfolio-dropdown-item' + (p.id === state.currentPortfolioId ? ' active' : '');
      item.type = 'button';
      item.innerHTML = `
        <div class="portfolio-item-info">
          <div class="portfolio-item-name">${escHtml(p.nombre)}</div>
          <div class="portfolio-item-ops">${p.num_operaciones || 0} operaciones</div>
        </div>
        ${state.portfolios.length > 1 && p.id !== 1 ? `
        <span class="portfolio-item-delete" title="Eliminar portafolio" data-pid="${p.id}">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </span>` : ''}
      `;

      // Click on the item row → switch portfolio (ignore delete btn)
      item.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.portfolio-item-delete');
        if (delBtn) {
          e.stopPropagation();
          const pid = parseInt(delBtn.dataset.pid, 10);
          confirmDeletePortfolio(pid);
          return;
        }
        switchPortfolio(p.id);
      });

      dropdown.appendChild(item);
    }

    // Divider + new portfolio button
    const divider = document.createElement('div');
    divider.className = 'portfolio-dropdown-divider';
    dropdown.appendChild(divider);

    const newBtn = document.createElement('button');
    newBtn.className = 'portfolio-dropdown-new';
    newBtn.type = 'button';
    newBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
      </svg>
      Nuevo Portafolio
    `;
    newBtn.addEventListener('click', () => {
      document.getElementById('portfolio-dropdown')?.classList.add('hidden');
      openPortfolioModal();
    });
    dropdown.appendChild(newBtn);
  }

  async function switchPortfolio(id) {
    if (id === state.currentPortfolioId) {
      document.getElementById('portfolio-dropdown')?.classList.add('hidden');
      return;
    }
    state.currentPortfolioId = id;
    localStorage.setItem('currentPortfolioId', id);
    document.getElementById('portfolio-dropdown')?.classList.add('hidden');
    renderPortfolioSelector();
    Dashboard.showLoading();
    Table.showLoading();
    await refresh();
  }

  async function confirmDeletePortfolio(id) {
    const p = state.portfolios.find(x => x.id === id);
    if (!p) return;

    const confirmed = await Portfolio.confirm(
      `Eliminar "${p.nombre}"`,
      `Se eliminarán todas las operaciones de este portafolio. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    try {
      await ApiClient.deletePortfolio(id);
      Portfolio.showToast(`Portafolio "${p.nombre}" eliminado`, 'success');
      if (state.currentPortfolioId === id) {
        state.currentPortfolioId = 1;
        localStorage.setItem('currentPortfolioId', 1);
      }
      await loadPortfolios();
      await refresh();
    } catch (err) {
      Portfolio.showToast('Error eliminando portafolio: ' + err.message, 'error');
    }
  }

  // ─── New Portfolio Modal ───────────────────────────────────────────────────

  function initPortfolioModal() {
    document.getElementById('btn-portfolio-modal-close')?.addEventListener('click', closePortfolioModal);
    document.getElementById('btn-portfolio-cancel')?.addEventListener('click', closePortfolioModal);
    document.getElementById('btn-portfolio-save')?.addEventListener('click', savePortfolio);

    document.getElementById('portfolio-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closePortfolioModal();
    });
  }

  function openPortfolioModal() {
    document.getElementById('field-portfolio-name').value = '';
    document.getElementById('field-portfolio-desc').value = '';
    document.getElementById('portfolio-modal')?.classList.add('active');
    document.getElementById('field-portfolio-name')?.focus();
  }

  function closePortfolioModal() {
    document.getElementById('portfolio-modal')?.classList.remove('active');
  }

  async function savePortfolio() {
    const nombre = document.getElementById('field-portfolio-name')?.value?.trim();
    const desc = document.getElementById('field-portfolio-desc')?.value?.trim();

    if (!nombre) {
      document.getElementById('field-portfolio-name')?.focus();
      Portfolio.showToast('El nombre del portafolio es requerido', 'error');
      return;
    }

    const btn = document.getElementById('btn-portfolio-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }

    try {
      const res = await ApiClient.createPortfolio(nombre, desc || '');
      const newPortfolio = res.data;
      closePortfolioModal();
      await loadPortfolios();
      await switchPortfolio(newPortfolio.id);
      Portfolio.showToast(`Portafolio "${nombre}" creado`, 'success');
    } catch (err) {
      Portfolio.showToast('Error creando portafolio: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Crear Portafolio'; }
    }
  }

  // ─── Data Loading ──────────────────────────────────────────────────────────

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    setRefreshButtonState(true);

    try {
      const pid = state.currentPortfolioId;
      const [portfolioRes, historyRes] = await Promise.allSettled([
        ApiClient.getPortfolio(pid),
        ApiClient.getHistory(365, pid),
      ]);

      if (portfolioRes.status === 'fulfilled') {
        const { positions, metrics, operations } = portfolioRes.value.data;
        state.portfolio = { positions, metrics, operations };
        state.lastUpdated = portfolioRes.value.timestamp;

        if (historyRes.status === 'fulfilled') {
          state.history = historyRes.value.data || [];
        }

        Dashboard.render(metrics);
        Table.render(positions);
        Charts.renderAll(positions, state.history, state.portfolio.operations);
        Dashboard.setLastUpdated(state.lastUpdated);
      } else {
        Portfolio.showToast('Error cargando portafolio: ' + portfolioRes.reason?.message, 'error');
      }
    } catch (err) {
      console.error('[App] Refresh error:', err);
      Portfolio.showToast('Error de conexión con el servidor', 'error');
    } finally {
      state.loading = false;
      setRefreshButtonState(false);
    }
  }

  async function forceRefresh() { await refresh(); }

  async function rebuildHistory() {
    const btn = document.getElementById('btn-rebuild-history');
    if (btn) { btn.disabled = true; btn.textContent = 'Cargando...'; }
    Portfolio.showToast('Construyendo historial desde Yahoo Finance...', 'info');
    try {
      const res = await ApiClient.rebuildHistory(state.currentPortfolioId);
      state.history = res.data || [];
      Charts.renderEvolution(state.history);
      Portfolio.showToast(res.message || 'Historial reconstruido', 'success');
    } catch (err) {
      Portfolio.showToast('Error construyendo historial: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Historial'; }
    }
  }

  async function updatePrices() {
    const btn = document.getElementById('btn-update-prices');
    if (btn) { btn.disabled = true; btn.textContent = 'Actualizando...'; }
    try {
      const res = await ApiClient.updatePrices(state.currentPortfolioId);
      Portfolio.showToast(res.message || 'Precios actualizados', 'success');
      await refresh();
    } catch (err) {
      Portfolio.showToast('Error actualizando precios: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Actualizar Precios'; }
    }
  }

  // ─── CSV Export ────────────────────────────────────────────────────────────

  function exportCSV() {
    const positions = state.portfolio?.positions;
    const operations = state.portfolio?.operations;

    if (!operations || operations.length === 0) {
      Portfolio.showToast('No hay operaciones para exportar', 'info');
      return;
    }

    const posMap = new Map();
    for (const pos of (positions || [])) posMap.set(pos.ticker, pos);

    const SEP = ';';
    const headers = [
      'Ticker', 'Fecha Compra', 'Cantidad', 'Precio Compra', 'Moneda',
      'Dividendos', 'Comision', 'Valor Compra', 'Precio Actual',
      'Valor Actual', 'Ganancia Capital', 'Retorno %',
    ];

    const rows = operations.map(op => {
      const pos         = posMap.get(op.ticker);
      const cantidad    = Number(op.cantidad);
      const pCompra     = Number(op.precio_compra);
      const comision    = Number(op.comision    || 0);
      const dividendos  = Number(op.dividendos  || 0);
      const valorCompra = cantidad * pCompra + comision;
      const pActual     = pos?.currentPrice || 0;
      const valorActual = cantidad * pActual;
      const ganancia    = valorActual - valorCompra;
      const retornoPct  = valorCompra > 0 ? (ganancia / valorCompra) * 100 : 0;

      return [
        op.ticker, op.fecha_compra, cantidad, pCompra, op.moneda,
        dividendos, comision,
        valorCompra.toFixed(0), pActual.toFixed(0), valorActual.toFixed(0),
        ganancia.toFixed(0), retornoPct.toFixed(2) + '%',
      ];
    });

    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

    const escape = cell => {
      const s = String(cell);
      return s.includes(SEP) || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [headers.join(SEP), ...rows.map(r => r.map(escape).join(SEP))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const portfolioName = state.portfolios.find(p => p.id === state.currentPortfolioId)?.nombre || 'portafolio';
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${portfolioName.replace(/\s+/g, '_')}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Portfolio.showToast(`${operations.length} operaciones exportadas`, 'success');
  }

  // ─── Auto Refresh ──────────────────────────────────────────────────────────

  function startAutoRefresh() {
    if (state.autoRefreshInterval) clearInterval(state.autoRefreshInterval);
    state.autoRefreshInterval = setInterval(refresh, AUTO_REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (state.autoRefreshInterval) {
      clearInterval(state.autoRefreshInterval);
      state.autoRefreshInterval = null;
    }
  }

  // ─── UI Helpers ────────────────────────────────────────────────────────────

  function setRefreshButtonState(loading) {
    const btn = document.getElementById('btn-refresh');
    if (!btn) return;
    btn.disabled = loading;
    btn.querySelector('.btn-spinner')?.classList.toggle('hidden', !loading);
    btn.querySelector('.btn-text')?.classList.toggle('hidden', loading);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoRefresh();
    else { refresh(); startAutoRefresh(); }
  });

  return { init, refresh, updatePrices };
})();

document.addEventListener('DOMContentLoaded', () => App.init());

// ── Tooltip system (portal to body, bypasses overflow:hidden) ──────────────
(function () {
  const tip = document.createElement('div');
  tip.id = '_tooltip';
  document.body.appendChild(tip);

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;
    tip.textContent = el.dataset.tooltip;
    tip.style.display = 'block';
    const r  = el.getBoundingClientRect();
    const tw = tip.offsetWidth || 230;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    tip.style.left = left + 'px';
    tip.style.top  = (r.bottom + 6) + 'px';
  });

  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-tooltip]')) tip.style.display = 'none';
  });
})();
