'use strict';

/**
 * Charts module — all Chart.js visualizations.
 */

const Charts = (() => {
  let allocationChart = null;
  let evolutionChart  = null;
  let gainChart       = null;
  let sectorChart     = null;
  let brokerChart     = null;

  const PALETTE = [
    '#38bdf8', '#818cf8', '#34d399', '#f59e0b', '#f87171',
    '#a78bfa', '#2dd4bf', '#fb923c', '#4ade80', '#e879f9',
    '#facc15', '#60a5fa', '#f472b6', '#c084fc', '#86efac',
  ];

  // Must match CATEGORY_COLORS in table.js for visual consistency
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

  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter, sans-serif', size: 12 },
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        padding: 12,
      },
    },
  };

  /**
   * Allocation pie chart — portfolio weight per ticker.
   */
  function renderAllocation(positions) {
    const ctx = document.getElementById('chart-allocation');
    if (!ctx) return;

    const data = positions.filter(p => p.currentValue > 0);
    if (data.length === 0) {
      destroyChart('allocationChart');
      showEmptyState(ctx, 'Sin datos de asignación');
      return;
    }

    const labels = data.map(p => p.ticker.replace('.SN', ''));
    const values = data.map(p => p.currentValue);
    const colors = data.map((_, i) => PALETTE[i % PALETTE.length]);

    destroyChart('allocationChart');

    allocationChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#0f172a',
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        cutout: '65%',
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: {
            ...CHART_DEFAULTS.plugins.legend,
            position: 'right',
          },
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
                const formatted = new Intl.NumberFormat('es-CL', {
                  style: 'currency', currency: 'CLP', maximumFractionDigits: 0
                }).format(ctx.raw);
                return ` ${ctx.label}: ${formatted} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * Portfolio value over time line chart.
   */
  function renderEvolution(history) {
    const ctx = document.getElementById('chart-evolution');
    if (!ctx) return;

    if (!history || history.length === 0) {
      destroyChart('evolutionChart');
      showEmptyState(ctx, 'Sin historial disponible');
      return;
    }

    const labels = history.map(h => h.fecha);
    const valorTotal = history.map(h => h.valor_total);
    const valorInvertido = history.map(h => h.valor_invertido);

    destroyChart('evolutionChart');

    evolutionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Valor Actual',
            data: valorTotal,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56,189,248,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: history.length > 30 ? 0 : 3,
            pointHoverRadius: 5,
            borderWidth: 2,
          },
          {
            label: 'Capital Invertido',
            data: valorInvertido,
            borderColor: '#94a3b8',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
          },
        ],
      },
      options: {
        ...CHART_DEFAULTS,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { color: 'rgba(148,163,184,0.1)' },
            ticks: {
              color: '#64748b',
              maxTicksLimit: 8,
              font: { size: 11 },
            },
          },
          y: {
            grid: { color: 'rgba(148,163,184,0.1)' },
            ticks: {
              color: '#64748b',
              font: { size: 11 },
              callback(value) {
                return new Intl.NumberFormat('es-CL', {
                  style: 'currency', currency: 'CLP',
                  notation: 'compact', maximumFractionDigits: 1,
                }).format(value);
              },
            },
          },
        },
        plugins: {
          ...CHART_DEFAULTS.plugins,
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: {
              label(ctx) {
                const formatted = new Intl.NumberFormat('es-CL', {
                  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
                }).format(ctx.raw);
                return ` ${ctx.dataset.label}: ${formatted}`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * Profit per ticker bar chart — always horizontal so tickers are visible on Y axis.
   */
  function renderGain(positions) {
    const ctx = document.getElementById('chart-gain');
    if (!ctx) return;

    // Sort best to worst
    const data = positions
      .filter(p => p.totalInvested > 0)
      .sort((a, b) => b.capitalGainPercent - a.capitalGainPercent);

    if (data.length === 0) {
      destroyChart('gainChart');
      showEmptyState(ctx, 'Sin datos de ganancia');
      return;
    }

    const labels = data.map(p => p.ticker);
    const values = data.map(p => p.capitalGainPercent);
    const colors = values.map(v => v >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)');
    const borders = values.map(v => v >= 0 ? '#22c55e' : '#ef4444');

    destroyChart('gainChart');

    gainChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Rentabilidad %',
          data: values,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        // Always horizontal — Y axis = tickers (categories), X axis = % values
        indexAxis: 'y',
        scales: {
          // X axis = value axis → show percentage
          x: {
            grid: { color: 'rgba(148,163,184,0.1)' },
            ticks: {
              color: '#64748b',
              font: { size: 11 },
              callback(v) {
                return `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;
              },
            },
          },
          // Y axis = category axis → show ticker names (no numeric callback)
          y: {
            grid: { color: 'rgba(148,163,184,0.08)' },
            ticks: {
              color: '#e2e8f0',
              font: { size: 12, weight: '600', family: 'Roboto Mono, monospace' },
            },
          },
        },
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { display: false },
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: {
              title(items) {
                return data[items[0].dataIndex]?.ticker || '';
              },
              label(item) {
                const pos = data[item.dataIndex];
                return [
                  ` Retorno: ${item.raw >= 0 ? '+' : ''}${Number(item.raw).toFixed(2)}%`,
                  ` Ganancia: ${new Intl.NumberFormat('es-CL', {
                    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
                  }).format(pos.capitalGain)}`,
                  ` Invertido: ${new Intl.NumberFormat('es-CL', {
                    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
                  }).format(pos.totalInvested)}`,
                ];
              },
            },
          },
        },
      },
    });
  }

  /**
   * Sector distribution doughnut — portfolio value grouped by categoria.
   */
  function renderSector(positions) {
    const ctx = document.getElementById('chart-sector');
    if (!ctx) return;

    const data = positions.filter(p => p.currentValue > 0);
    if (data.length === 0) {
      destroyChart('sectorChart');
      showEmptyState(ctx, 'Sin datos de sector');
      return;
    }

    // Aggregate value by category
    const sectorMap = new Map();
    for (const pos of data) {
      const cat = pos.categoria || 'Otro';
      sectorMap.set(cat, (sectorMap.get(cat) || 0) + pos.currentValue);
    }

    const sorted  = [...sectorMap.entries()].sort((a, b) => b[1] - a[1]);
    const labels  = sorted.map(([cat]) => cat);
    const values  = sorted.map(([, val]) => val);
    const colors  = labels.map((cat, i) => CATEGORY_COLORS[cat] || PALETTE[i % PALETTE.length]);

    destroyChart('sectorChart');

    sectorChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#0f172a',
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        cutout: '60%',
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: {
            ...CHART_DEFAULTS.plugins.legend,
            position: 'right',
          },
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
                const formatted = new Intl.NumberFormat('es-CL', {
                  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
                }).format(ctx.raw);
                return ` ${ctx.label}: ${formatted} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function destroyChart(name) {
    const refs = { allocationChart, evolutionChart, gainChart, sectorChart, brokerChart };
    if (refs[name]) refs[name].destroy();
    // Reset the module-level variable
    if (name === 'allocationChart') allocationChart = null;
    if (name === 'evolutionChart')  evolutionChart  = null;
    if (name === 'gainChart')       gainChart       = null;
    if (name === 'sectorChart')     sectorChart     = null;
    if (name === 'brokerChart')     brokerChart     = null;
  }

  function showEmptyState(ctx, msg) {
    const parent = ctx.parentElement;
    const existing = parent.querySelector('.chart-empty');
    if (!existing) {
      const div = document.createElement('div');
      div.className = 'chart-empty';
      div.textContent = msg;
      parent.appendChild(div);
    }
  }

  /**
   * Broker distribution doughnut — portfolio current value grouped by corredora.
   * Uses per-operation current value: op.cantidad × pos.currentPrice.
   */
  function renderBroker(positions, operations) {
    const ctx = document.getElementById('chart-broker');
    if (!ctx) return;

    const buys = (operations || []).filter(op => (op.tipo || 'COMPRA') === 'COMPRA');
    if (buys.length === 0) {
      destroyChart('brokerChart');
      showEmptyState(ctx, 'Sin datos de broker');
      return;
    }

    // Build price map from positions
    const priceMap = new Map(positions.map(p => [p.ticker, p.currentPrice]));

    // Aggregate current value by corredora
    const brokerMap = new Map();
    for (const op of buys) {
      const price = priceMap.get(op.ticker) || 0;
      const value = Number(op.cantidad) * price;
      const broker = op.corredora || 'Sin corredora';
      brokerMap.set(broker, (brokerMap.get(broker) || 0) + value);
    }

    const sorted = [...brokerMap.entries()].sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([b]) => b);
    const values = sorted.map(([, v]) => v);
    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    destroyChart('brokerChart');

    brokerChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#0f172a',
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        cutout: '65%',
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { ...CHART_DEFAULTS.plugins.legend, position: 'right' },
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
                const formatted = new Intl.NumberFormat('es-CL', {
                  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
                }).format(ctx.raw);
                return ` ${ctx.label}: ${formatted} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * Bind the Ticker / Broker tab buttons in the allocation card.
   */
  function bindAllocationTabs() {
    document.querySelectorAll('[data-chart-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.chartTab;
        document.querySelectorAll('[data-chart-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('chart-allocation-panel')?.classList.toggle('hidden', tab !== 'ticker');
        document.getElementById('chart-broker-panel')?.classList.toggle('hidden', tab !== 'broker');
      });
    });
  }

  /**
   * Render all charts.
   */
  function renderAll(positions, history, operations) {
    renderAllocation(positions);
    renderEvolution(history);
    renderGain(positions);
    renderSector(positions);
    renderBroker(positions, operations);
  }

  document.addEventListener('DOMContentLoaded', bindAllocationTabs);

  return { renderAll, renderAllocation, renderEvolution, renderGain, renderSector, renderBroker };
})();
