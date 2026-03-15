# Portfolio Tracker — Acciones Chilenas

Terminal financiero personal para seguimiento de inversiones en la Bolsa de Santiago.

## Requisitos

- Node.js v18.0.0 o superior (se utiliza el módulo SQLite integrado desde v22.5)
- Conexión a Internet (para precios de Yahoo Finance)

## Instalación

```bash
npm install
```

## Iniciar la aplicación

```bash
node backend/server.js
```

Abrir en el navegador: **http://localhost:3000**

## Características

- **Múltiples portafolios**: Crea, renombra y elimina portafolios independientes
- **Compras y ventas**: Registra operaciones de tipo COMPRA y VENTA por ticker
- **Consolidación automática**: Precio promedio ponderado considerando compras y ventas parciales
- **Precios en tiempo real**: Integración con Yahoo Finance (tickers con sufijo `.SN`)
- **Caché de precios**: 5 minutos para minimizar llamadas a Yahoo Finance
- **Historial de portafolio**: Evolución del valor reconstruida desde Yahoo Finance con precios históricos
- **Beta del portafolio**: Calculado vs el ETF ECH (proxy IPSA) con 1 año de retornos diarios
- **IRR por posición**: XIRR anualizado considerando el momento exacto de cada flujo de caja
- **Dashboard financiero**: KPIs, tabla de posiciones y gráficos interactivos
- **Gráficos**: Distribución por ticker, por corredora, por sector, rentabilidad y evolución temporal
- **Clasificación por sector**: Categorías asignadas automáticamente desde la lista de tickers conocidos
- **Corredora por operación**: Registro opcional de la corredora usada en cada transacción
- **Autocompletado de tickers**: 42+ tickers chilenos preconfigurados con nombre y sector
- **Rate limiting**: Protección integrada contra uso abusivo de la API

## Cálculos financieros

| Métrica | Fórmula |
|---|---|
| Capital invertido | `Σ(cantidad × precio_compra + comisión)` |
| Precio promedio | `Σ(cantidad × precio) / Σ(cantidad)` — sobre todas las compras |
| Valor actual | `cantidad_restante × precio_actual` |
| Ganancia realizada | `ingresos_ventas − costo_base_acciones_vendidas` |
| Ganancia no realizada | `valor_actual − costo_base_acciones_restantes` |
| Ganancia capital | `ganancia_realizada + ganancia_no_realizada` |
| Retorno capital % | `(ganancia_capital / capital_invertido) × 100` |
| Retorno total % | `(ganancia_capital + dividendos) / capital_invertido × 100` |
| Yield on cost | `dividendos / capital_invertido × 100` |
| Peso portafolio | `valor_actual / valor_total_portafolio × 100` |
| IRR (XIRR) | Newton-Raphson sobre flujos irregulares; requiere ≥30 días en posición |
| Beta | `Cov(retornos_acción, retornos_ECH) / Var(retornos_ECH)` — 1 año de datos diarios |
| Beta portafolio | Promedio ponderado por peso de cada posición |

## API REST

### Portafolios

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/portfolios` | Listar todos los portafolios |
| POST | `/api/portfolios` | Crear portafolio (`{ nombre, descripcion? }`) |
| PUT | `/api/portfolios/:id` | Renombrar portafolio |
| DELETE | `/api/portfolios/:id` | Eliminar portafolio y sus operaciones |

### Operaciones

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/portfolio?portfolioId=1` | Portafolio completo con métricas |
| POST | `/api/portfolio` | Agregar operación |
| PUT | `/api/portfolio/:id` | Editar operación |
| DELETE | `/api/portfolio/:id` | Eliminar operación |

### Precios e historial

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/price?ticker=XXX` | Precio actual de un ticker |
| GET | `/api/update-prices?portfolioId=1` | Actualizar todos los precios del portafolio |
| GET | `/api/history?portfolioId=1&days=365` | Historial del portafolio (máx. 365 días) |
| GET | `/api/history/rebuild?portfolioId=1` | Reconstruir historial desde Yahoo Finance |
| GET | `/api/beta/recalculate?portfolioId=1` | Forzar recálculo de beta para todos los tickers |
| GET | `/api/tickers?q=XXX` | Autocompletado de tickers chilenos |

## Estructura del proyecto

```
portfolio-public/
├── backend/
│   ├── server.js            # Express server + middleware + rate limiting
│   ├── routes.js            # Definición de endpoints REST
│   ├── database.js          # Capa de datos (node:sqlite)
│   ├── calculations.js      # Cálculos financieros (XIRR, beta, consolidación)
│   ├── portfolioService.js  # Lógica de negocio, validación y snapshots
│   ├── priceService.js      # Caché de precios (5 min TTL)
│   ├── betaService.js       # Cálculo de beta vs ECH (caché 24h)
│   └── yahooFinance.js      # Integración con Yahoo Finance
├── frontend/
│   ├── index.html           # Dashboard principal
│   ├── css/style.css        # Estilos (tema terminal financiero)
│   └── js/
│       ├── api.js           # Cliente HTTP (axios)
│       ├── app.js           # Orquestador principal
│       ├── dashboard.js     # Métricas KPI
│       ├── table.js         # Tabla de posiciones
│       ├── charts.js        # Gráficos (Chart.js)
│       └── portfolio.js     # Selector y gestión de portafolios
├── config/
│   └── tickers_chile.json   # 42+ tickers chilenos con nombre y sector
├── db/
│   └── portfolio.db         # Base de datos SQLite (autogenerada)
└── package.json
```

## Tickers chilenos

Los tickers de la Bolsa de Santiago usan el sufijo `.SN`:

```
SQM-B.SN    COPEC.SN    FALABELLA.SN    ENELCHILE.SN
CENCOSUD.SN BCI.SN      BSANTANDER.SN   CHILE.SN
CMPC.SN     COLBUN.SN   CCU.SN          CONCHA.SN
```

El sistema incluye autocompletado con 42+ tickers preconfigurados con nombre y categoría de sector.

## Tecnología

- **Backend**: Node.js 18+ · Express 4 · SQLite (built-in `node:sqlite`) · express-rate-limit
- **Frontend**: HTML5 · CSS3 · Vanilla JavaScript · Chart.js · Axios
- **Datos**: Yahoo Finance API (sin clave API requerida)

https://porfolio-gqx3.onrender.com/
