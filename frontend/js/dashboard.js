'use strict';

/**
 * Dashboard module — renders the top KPI metric cards.
 */

const Dashboard = (() => {
  function formatCLP(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatPct(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  /**
   * Render/update all metric cards.
   * @param {Object} metrics
   */
  function render(metrics) {
    const {
      totalInvested = 0,
      totalCurrentValue = 0,
      totalCapitalGain = 0,
      totalCapitalGainPercent = 0,
      totalReturnPercent = 0,
      totalDividends = 0,
      dividendYieldOnCost = 0,
      portfolioBeta = null,
      positionsCount = 0,
    } = metrics;

    // 1. Capital Invertido
    setCard('metric-invested', {
      value: formatCLP(totalInvested),
      sub: `${positionsCount} posicion${positionsCount !== 1 ? 'es' : ''}`,
      neutral: true,
      tooltip: 'Dinero total que has gastado en compras: precio × cantidad + comisiones. Es tu costo base real.',
    });

    // 2. Valor Actual
    setCard('metric-value', {
      value: formatCLP(totalCurrentValue),
      sub: totalInvested > 0
        ? `${formatPct(((totalCurrentValue - totalInvested) / totalInvested) * 100)} vs invertido`
        : '—',
      positive: totalCurrentValue >= totalInvested,
      neutral: totalCurrentValue === totalInvested,
      tooltip: 'Lo que valen tus acciones hoy al precio de mercado. Fórmula: cantidad × precio actual de cada ticker.',
    });

    // 3. Ganancia Capital (CLP amount)
    setCard('metric-gain', {
      value: formatCLP(totalCapitalGain),
      sub: `${formatPct(totalCapitalGainPercent)} sobre capital`,
      positive: totalCapitalGain >= 0,
      neutral: totalCapitalGain === 0,
      tooltip: 'Ganancia o pérdida en pesos solo por variación de precio. Fórmula: Valor Actual − Capital Invertido. No incluye dividendos.',
    });

    // 4. Rentabilidad Capital — % sin dividendos
    setCard('metric-return-capital', {
      value: formatPct(totalCapitalGainPercent),
      sub: 'Sin dividendos',
      positive: totalCapitalGainPercent >= 0,
      neutral: totalCapitalGainPercent === 0,
      tooltip: 'Cuánto ganaste (o perdiste) en % respecto a lo invertido, sin contar dividendos. Fórmula: (Valor Actual − Invertido) / Invertido × 100.',
    });

    // 5. Rentabilidad Total — % con dividendos (highlighted)
    setCard('metric-return', {
      value: formatPct(totalReturnPercent),
      sub: `Incluye dividendos (+${dividendYieldOnCost.toFixed(2)}% div.)`,
      positive: totalReturnPercent >= 0,
      neutral: totalReturnPercent === 0,
      tooltip: 'Rentabilidad real incluyendo dividendos. Fórmula: (Ganancia de Capital + Dividendos) / Capital Invertido × 100. Es el número más completo.',
    });

    // 6. Dividendos Recibidos (CLP)
    setCard('metric-dividends', {
      value: formatCLP(totalDividends),
      sub: 'Dividendos acumulados',
      positive: true,
      neutral: totalDividends === 0,
      accent: 'dividends',
      tooltip: 'Suma de todos los dividendos en pesos que has registrado manualmente en tus operaciones.',
    });

    // 7. Dividend Yield on Cost
    setCard('metric-dividend-yield', {
      value: formatPct(dividendYieldOnCost),
      sub: 'Dividendos / Capital invertido',
      positive: true,
      neutral: dividendYieldOnCost === 0,
      accent: 'dividends',
      tooltip: 'Rendimiento por dividendos sobre tu precio de compra original. Fórmula: Dividendos / Capital Invertido × 100. Sube con el tiempo aunque el precio de la acción no cambie.',
    });

    // 8. Beta del Portafolio
    const betaValue = portfolioBeta !== null ? portfolioBeta.toFixed(2) : '—';
    const betaSub   = portfolioBeta === null  ? 'Sin datos aún'
                    : portfolioBeta < 0.8     ? 'Baja volatilidad'
                    : portfolioBeta <= 1.2    ? 'Volatilidad de mercado'
                    : 'Alta volatilidad';
    const betaDesc  = portfolioBeta !== null
      ? `Si el mercado sube 10%, tu portafolio sube ~${(portfolioBeta * 10).toFixed(1)}%. Si baja 10%, baja ~${(portfolioBeta * 10).toFixed(1)}%.`
      : '';
    setCard('metric-beta', {
      value: betaValue,
      sub: betaSub,
      neutral: portfolioBeta === null || Math.abs(portfolioBeta - 1) < 0.2,
      positive: portfolioBeta !== null && portfolioBeta < 1,
      tooltip: `Mide cuánto se mueve tu portafolio respecto al mercado chileno (ETF ECH). Beta < 1 = menos riesgo que el mercado. Beta > 1 = más riesgo. ${betaDesc}`,
    });
  }

  function setCard(id, { value, sub, positive, neutral, accent, tooltip }) {
    const el = document.getElementById(id);
    if (!el) return;

    if (tooltip) el.dataset.tooltip = tooltip;

    const valueEl = el.querySelector('.metric-value');
    const subEl = el.querySelector('.metric-sub');

    if (valueEl) {
      valueEl.textContent = value;
      valueEl.className = 'metric-value';
      if (!neutral) {
        valueEl.classList.add(positive ? 'profit' : 'loss');
      }
      if (accent === 'dividends') {
        valueEl.classList.add('dividends');
      }
    }

    if (subEl) subEl.textContent = sub || '';
  }

  function showLoading() {
    document.querySelectorAll('.metric-value').forEach(el => {
      el.textContent = '—';
      el.className = 'metric-value loading-pulse';
    });
  }

  function setLastUpdated(isoString) {
    const el = document.getElementById('last-updated');
    if (!el) return;
    const d = new Date(isoString);
    el.textContent = `Actualizado: ${d.toLocaleTimeString('es-CL')}`;
  }

  return { render, showLoading, setLastUpdated };
})();
