'use strict';

/**
 * Portfolio module — manages the add/edit operation modal and form handling.
 */

const Portfolio = (() => {
  let editingId = null;
  let onSaved = null;
  let getPortfolioId = () => 1;
  let tickerSuggestions = [];
  let suggestTimer = null;

  // ─── Modal ──────────────────────────────────────────────────────────────────

  function openModal(operation = null) {
    editingId = operation ? operation.id : null;
    const modal = document.getElementById('operation-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('operation-form');

    if (!modal || !form) return;

    form.reset();
    clearErrors();

    if (operation) {
      title.textContent = 'Editar Operación';
      document.getElementById('field-ticker').value = operation.ticker || '';
      document.getElementById('field-date').value = operation.fecha_compra || '';
      document.getElementById('field-qty').value = operation.cantidad || '';
      document.getElementById('field-price').value = operation.precio_compra || '';
      document.getElementById('field-currency').value = operation.moneda || 'CLP';
      document.getElementById('field-dividends').value = operation.dividendos || 0;
      document.getElementById('field-commission').value = operation.comision || 0;
        document.getElementById('field-corredora').value = operation.corredora || '';
      document.getElementById('field-nota').value = operation.nota || '';
      setTipo(operation.tipo || 'COMPRA');
    } else {
      title.textContent = 'Nueva Operación';
      document.getElementById('field-date').value = new Date().toISOString().split('T')[0];
      setTipo('COMPRA');
    }

    modal.classList.add('active');
    document.getElementById('field-ticker').focus();
  }

  function closeModal() {
    const modal = document.getElementById('operation-modal');
    if (modal) modal.classList.remove('active');
    editingId = null;
    clearErrors();
  }

  // ─── Form Submission ──────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    clearErrors();

    const data = {
      ticker: document.getElementById('field-ticker').value.trim().toUpperCase(),
      fecha_compra: document.getElementById('field-date').value,
      cantidad: parseFloat(document.getElementById('field-qty').value),
      precio_compra: parseFloat(document.getElementById('field-price').value),
      moneda: document.getElementById('field-currency').value,
      dividendos: parseFloat(document.getElementById('field-dividends').value || 0),
      comision: parseFloat(document.getElementById('field-commission').value || 0),
      nota: document.getElementById('field-nota').value.trim(),
      corredora: document.getElementById('field-corredora').value.trim(),
      tipo: document.getElementById('field-tipo').value || 'COMPRA',
    };

    // Frontend validation before sending to API
    const errors = validateForm(data);
    if (errors.length > 0) {
      showErrors(errors);
      return;
    }

    const submitBtn = document.getElementById('btn-save');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
      if (editingId !== null) {
        await ApiClient.updateOperation(editingId, data);
        showToast('Operación actualizada correctamente', 'success');
      } else {
        await ApiClient.addOperation(data, getPortfolioId());
        showToast('Compra registrada correctamente', 'success');
      }

      closeModal();
      if (onSaved) await onSaved();
    } catch (err) {
      showErrors([err.message || 'Error al guardar. Intente nuevamente.']);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar';
    }
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  function validateForm(data) {
    const errors = [];

    if (!data.ticker || !/^[A-Za-z0-9\-\.]{1,20}$/.test(data.ticker)) {
      errors.push('Ticker inválido. Use el formato estándar (ej: SQM-B.SN).');
    }

    if (!data.fecha_compra || !/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_compra)) {
      errors.push('Fecha inválida. Use formato AAAA-MM-DD.');
    } else {
      const d = new Date(data.fecha_compra);
      if (isNaN(d.getTime())) {
        errors.push('Fecha inválida.');
      } else if (d > new Date()) {
        errors.push('La fecha de compra no puede ser futura.');
      }
    }

    if (isNaN(data.cantidad) || data.cantidad <= 0) {
      errors.push('La cantidad debe ser un número positivo.');
    }

    if (isNaN(data.precio_compra) || data.precio_compra <= 0) {
      errors.push('El precio de compra debe ser un número positivo.');
    }

    if (isNaN(data.dividendos) || data.dividendos < 0) {
      errors.push('Los dividendos no pueden ser negativos.');
    }

    if (isNaN(data.comision) || data.comision < 0) {
      errors.push('La comisión no puede ser negativa.');
    }

    return errors;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async function deleteOperation(id, ticker) {
    const confirmed = await showConfirm(
      `¿Eliminar esta operación de ${ticker}?`,
      'Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;

    try {
      await ApiClient.deleteOperation(id);
      showToast('Operación eliminada', 'success');
      if (onSaved) await onSaved();
    } catch (err) {
      showToast(err.message || 'Error al eliminar', 'error');
    }
  }

  // ─── Ticker Autocomplete ──────────────────────────────────────────────────

  async function setupTickerAutocomplete() {
    const input = document.getElementById('field-ticker');
    const dropdown = document.getElementById('ticker-suggestions');
    if (!input || !dropdown) return;

    try {
      const res = await ApiClient.getTickers();
      tickerSuggestions = res.data || [];
    } catch {
      tickerSuggestions = [];
    }

    input.addEventListener('input', () => {
      clearTimeout(suggestTimer);
      suggestTimer = setTimeout(() => showSuggestions(input, dropdown), 150);
    });

    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.suggestion-item');
      const active = dropdown.querySelector('.suggestion-item.active');
      let idx = -1;
      items.forEach((item, i) => { if (item === active) idx = i; });

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[idx + 1] || items[0];
        if (next) { if (active) active.classList.remove('active'); next.classList.add('active'); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[idx - 1] || items[items.length - 1];
        if (prev) { if (active) active.classList.remove('active'); prev.classList.add('active'); }
      } else if (e.key === 'Enter') {
        if (active) { e.preventDefault(); selectSuggestion(input, dropdown, active.dataset.ticker); }
      } else if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== input) {
        dropdown.classList.add('hidden');
      }
    });
  }

  function showSuggestions(input, dropdown) {
    const q = input.value.toUpperCase().trim();
    if (!q || q.length < 1) {
      dropdown.classList.add('hidden');
      return;
    }

    const matched = tickerSuggestions.filter(t =>
      t.ticker.includes(q) || t.name.toUpperCase().includes(q)
    ).slice(0, 8);

    if (matched.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    dropdown.innerHTML = matched.map(t => `
      <div class="suggestion-item" data-ticker="${t.ticker}">
        <span class="suggestion-ticker">${t.ticker}</span>
        <span class="suggestion-name">${t.name}</span>
      </div>
    `).join('');

    dropdown.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        selectSuggestion(input, dropdown, item.dataset.ticker);
      });
    });

    dropdown.classList.remove('hidden');
  }

  function selectSuggestion(input, dropdown, ticker) {
    input.value = ticker;
    dropdown.classList.add('hidden');
    document.getElementById('field-qty')?.focus();
  }

  // ─── UI Helpers ───────────────────────────────────────────────────────────

  function clearErrors() {
    const container = document.getElementById('form-errors');
    if (container) {
      container.innerHTML = '';
      container.classList.add('hidden');
    }
  }

  function showErrors(errors) {
    const container = document.getElementById('form-errors');
    if (!container) return;
    container.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
    container.classList.remove('hidden');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="toast-msg">${message}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function showConfirm(title, message) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      const confirmTitle = document.getElementById('confirm-title');
      const confirmMsg = document.getElementById('confirm-message');
      const btnYes = document.getElementById('confirm-yes');
      const btnNo = document.getElementById('confirm-no');

      if (!modal) { resolve(window.confirm(`${title}\n${message}`)); return; }

      confirmTitle.textContent = title;
      confirmMsg.textContent = message;
      modal.classList.add('active');

      const cleanup = () => modal.classList.remove('active');

      btnYes.onclick = () => { cleanup(); resolve(true); };
      btnNo.onclick = () => { cleanup(); resolve(false); };
    });
  }

  // ─── Tipo Toggle ──────────────────────────────────────────────────────────

  function setTipo(tipo) {
    document.getElementById('field-tipo').value = tipo;
    document.querySelectorAll('.tipo-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tipo === tipo);
    });
    const isVenta = tipo === 'VENTA';
    const priceLabel = document.querySelector('label[for="field-price"]');
    if (priceLabel) priceLabel.textContent = isVenta ? 'Precio de Venta' : 'Precio de Compra';
    const divGroup = document.getElementById('group-dividends');
    if (divGroup) divGroup.style.display = isVenta ? 'none' : '';
  }

  function bindTipoToggle() {
    document.querySelectorAll('.tipo-btn').forEach(btn => {
      btn.addEventListener('click', () => setTipo(btn.dataset.tipo));
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init(callbacks) {
    onSaved = callbacks.onSaved;
    if (callbacks.getPortfolioId) getPortfolioId = callbacks.getPortfolioId;

    // Modal triggers
    document.getElementById('btn-add')?.addEventListener('click', () => openModal());
    document.getElementById('btn-modal-close')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel')?.addEventListener('click', closeModal);

    // Close on backdrop click
    document.getElementById('operation-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'operation-modal') closeModal();
    });
    document.getElementById('confirm-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'confirm-modal') {
        document.getElementById('confirm-no')?.click();
      }
    });

    // Form submit
    document.getElementById('operation-form')?.addEventListener('submit', handleSubmit);

    // Tipo toggle
    bindTipoToggle();

    // Ticker autocomplete
    setupTickerAutocomplete();
  }

  return {
    init,
    openModal,
    closeModal,
    deleteOperation,
    showToast,
    confirm: showConfirm,
  };
})();
