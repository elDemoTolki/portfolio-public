'use strict';

/**
 * Table module — renders the positions table with sortable columns.
 */

const Table = (() => {
  let onEdit   = null;
  let onDelete = null;

  // Sort state
  let sortCol = 'currentValue';
  let sortDir = 'desc'; // 'asc' | 'desc'

  // ─── Formatters ────────────────────────────────────────────────────────────

  function formatCLP(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v);
  }

  function formatNum(v, dec = 2) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function formatPct(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  }

  function formatDivYield(v) {
    if (!v || isNaN(v) || v === 0) return '<span class="div-yield dim">—</span>';
    const label = `+${v.toFixed(2)}%`;
    const cls = v >= 4 ? 'div-yield high' : v >= 2 ? 'div-yield mid' : 'div-yield low';
    return `<span class="${cls}">${label}</span>`;
  }

  function formatIrr(v) {
    if (v === null || v === undefined || isNaN(v)) return '<span class="muted">—</span>';
    const sign = v >= 0 ? '+' : '';
    const cls  = v >= 0 ? 'profit' : 'loss';
    return `<span class="${cls}">${sign}${v.toFixed(1)}%</span>`;
  }

  const CATEGORY_COLORS = {
    'Banca':        '#38bdf8',
    'Utilities':    '#818cf8',
    'Retail':       '#fb923c',
    'Minería':      '#facc15',
    'Energía':      '#4ade80',
    'Forestal':     '#86efac',
    'Inmobiliario': '#f472b6',
    'Consumo':      '#a78bfa',
    'Transporte':   '#94a3b8',
    'Holding':      '#e2e8f0',
    'Financiero':   '#67e8f9',
    'Construcción': '#fdba74',
  };

  function formatCategoria(cat) {
    if (!cat) return '<span class="cat-badge cat-default">—</span>';
    const color = CATEGORY_COLORS[cat] || '#94a3b8';
    return `<span class="cat-badge" style="--cat-color:${color}">${cat}</span>`;
  }

  // ─── Sort ──────────────────────────────────────────────────────────────────

  function sortPositions(positions) {
    if (!sortCol) return positions;
    return [...positions].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      // Nulls to end
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      // String sort for ticker/categoria
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb, 'es');
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  function bindSortHeaders() {
    document.querySelectorAll('.positions-table th[data-col]').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortCol = col;
          sortDir = col === 'ticker' || col === 'categoria' ? 'asc' : 'desc';
        }
        updateSortIndicators();
        // Re-render with cached positions
        if (_lastPositions) render(_lastPositions);
      });
    });
  }

  function updateSortIndicators() {
    document.querySelectorAll('.positions-table th[data-col]').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.col === sortCol) th.classList.add(`sort-${sortDir}`);
    });
  }

  // Cache last positions for re-sort without new data
  let _lastPositions = null;

  // ─── Render ────────────────────────────────────────────────────────────────

  function render(positions) {
    _lastPositions = positions;
    const tbody = document.getElementById('positions-tbody');
    if (!tbody) return;

    if (!positions || positions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="14" class="empty-state">
            <div class="empty-icon">📊</div>
            <p>No hay posiciones en el portafolio.</p>
            <p class="empty-hint">Agrega tu primera compra usando el formulario.</p>
          </td>
        </tr>`;
      return;
    }

    const sorted = sortPositions(positions);
    updateSortIndicators();

    tbody.innerHTML = sorted.map((pos, i) => {
      const isProfit  = pos.capitalGain >= 0;
      const rowClass  = isProfit ? 'row-profit' : 'row-loss';
      const gainClass = isProfit ? 'profit' : 'loss';

      return `
        <tr class="position-row ${rowClass}" data-ticker="${pos.ticker}" data-index="${i}">
          <td>
            <div class="ticker-cell">
              <span class="ticker-badge">${pos.ticker}</span>
              <span class="ops-count">${pos.operationsCount} op${pos.operationsCount !== 1 ? 's' : ''}</span>
            </div>
          </td>
          <td>${formatCategoria(pos.categoria)}</td>
          <td class="num">${formatNum(pos.quantity, 2)}</td>
          <td class="num">${formatCLP(pos.avgPrice)}</td>
          <td class="num current-price" data-ticker="${pos.ticker}">${pos.currentPrice > 0 ? formatCLP(pos.currentPrice) : '<span class="no-price">N/D</span>'}</td>
          <td class="num">${formatCLP(pos.totalInvested)}</td>
          <td class="num">${formatCLP(pos.currentValue)}</td>
          <td class="num ${gainClass}">${formatCLP(pos.capitalGain)}</td>
          <td class="num ${gainClass}">${formatPct(pos.capitalGainPercent)}</td>
          <td class="num">${pos.daysInPosition ?? '—'}</td>
          <td class="num">${formatIrr(pos.irr)}</td>
          <td class="num">${formatDivYield(pos.yieldOnCost)}</td>
          <td class="num">${formatPct(pos.portfolioWeight)}</td>
          <td class="actions-cell">
            <button class="btn-icon btn-expand" title="Ver operaciones" data-ticker="${pos.ticker}">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
            </button>
          </td>
        </tr>
        <tr class="operations-detail-row hidden" id="ops-${pos.ticker}">
          <td colspan="14">
            <div class="operations-detail">
              ${renderOperationsDetail(pos.operations, pos.currentPrice)}
            </div>
          </td>
        </tr>`;
    }).join('');

    // Bind events
    tbody.querySelectorAll('.btn-expand').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ticker = e.currentTarget.dataset.ticker;
        toggleOperationsDetail(ticker);
        e.currentTarget.closest('.position-row').classList.toggle('expanded');
      });
    });

    tbody.querySelectorAll('.btn-edit-op').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id, 10);
        if (onEdit) onEdit(id);
      });
    });

    tbody.querySelectorAll('.btn-delete-op').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id, 10);
        const ticker = e.currentTarget.dataset.ticker;
        if (onDelete) onDelete(id, ticker);
      });
    });
  }

  function renderOperationsDetail(operations, currentPrice = 0) {
    if (!operations || operations.length === 0) {
      return '<p class="no-ops">Sin operaciones registradas.</p>';
    }

    const clp = v => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v);
    const pct  = v => {
      if (v === null || isNaN(v)) return '—';
      const sign = v >= 0 ? '+' : '';
      return `${sign}${v.toFixed(2)}%`;
    };

    return `
      <table class="ops-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cantidad</th>
            <th>Precio Compra</th>
            <th>Moneda</th>
            <th>Valor Compra</th>
            <th>Valor Actual</th>
            <th>Ganancia</th>
            <th>Retorno %</th>
            <th>Dividendos</th>
            <th>Comisión</th>
            <th>Corredora</th>
            <th>Nota</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${operations.map(op => {
            const qty        = Number(op.cantidad);
            const pCompra    = Number(op.precio_compra);
            const comision   = Number(op.comision || 0);
            const valorCompra = qty * pCompra + comision;
            const valorActual = currentPrice > 0 ? qty * currentPrice : null;
            const ganancia    = valorActual !== null ? valorActual - valorCompra : null;
            const retorno     = valorActual !== null && valorCompra > 0 ? (ganancia / valorCompra) * 100 : null;

            const isVenta = op.tipo === 'VENTA';
            return `
            <tr class="${isVenta ? 'op-venta-row' : ''}">
              <td>
                ${isVenta ? '<span class="op-tipo-badge venta">VENTA</span>' : '<span class="op-tipo-badge compra">COMPRA</span>'}
                ${op.fecha_compra}
              </td>
              <td>${qty.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
              <td>${clp(pCompra)}</td>
              <td>${op.moneda}</td>
              <td>${clp(valorCompra)}</td>
              <td>${isVenta ? '<span class="muted">—</span>' : (valorActual !== null ? clp(valorActual) : '<span class="muted">—</span>')}</td>
              <td>${isVenta ? '<span class="muted">—</span>' : (ganancia !== null ? clp(ganancia) : '<span class="muted">—</span>')}</td>
              <td>${isVenta ? '<span class="muted">—</span>' : pct(retorno)}</td>
              <td>${isVenta ? '<span class="muted">—</span>' : clp(Number(op.dividendos || 0))}</td>
              <td>${clp(comision)}</td>
              <td>${op.corredora ? `<span class="corredora-badge">${op.corredora}</span>` : '<span class="muted">—</span>'}</td>
              <td class="op-nota">${op.nota ? `<span title="${op.nota}">${op.nota.length > 40 ? op.nota.slice(0, 40) + '…' : op.nota}</span>` : '<span class="muted">—</span>'}</td>
              <td class="op-actions">
                <button class="btn-icon btn-edit-op" data-id="${op.id}" title="Editar">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                </button>
                <button class="btn-icon btn-delete-op btn-danger" data-id="${op.id}" data-ticker="${op.ticker || ''}" title="Eliminar">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function toggleOperationsDetail(ticker) {
    const row = document.getElementById(`ops-${ticker}`);
    if (row) row.classList.toggle('hidden');
  }

  function updatePriceCells(priceMap) {
    document.querySelectorAll('.current-price[data-ticker]').forEach(cell => {
      const ticker = cell.dataset.ticker;
      const price  = priceMap.get(ticker) || priceMap.get(`${ticker}.SN`);
      if (price !== undefined) {
        cell.innerHTML = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);
      }
    });
  }

  function setHandlers({ onEdit: editFn, onDelete: deleteFn }) {
    onEdit   = editFn;
    onDelete = deleteFn;
  }

  function showLoading() {
    const tbody = document.getElementById('positions-tbody');
    if (!tbody) return;
    tbody.innerHTML = Array(4).fill(`
      <tr class="skeleton-row">
        ${Array(13).fill('<td><div class="skeleton"></div></td>').join('')}
      </tr>
    `).join('');
  }

  // Bind sort headers after DOM ready
  document.addEventListener('DOMContentLoaded', bindSortHeaders);

  return { render, updatePriceCells, setHandlers, showLoading };
})();
