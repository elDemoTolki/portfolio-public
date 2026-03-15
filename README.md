# Portfolio Tracker — Acciones Chilenas

Terminal financiero personal para seguimiento de inversiones en la Bolsa de Santiago.

## Requisitos

- Node.js v22.5.0 o superior (se utiliza el módulo SQLite integrado)
- Conexión a Internet (para precios de Yahoo Finance)

## Instalación

```bash
cd portfolio-tracker
npm install
```

## Iniciar la aplicación

```bash
node backend/server.js
```

Abrir en el navegador: **http://localhost:3000**

## Características

- **Gestión de posiciones**: Agrega, edita y elimina compras de acciones
- **Múltiples operaciones por ticker**: Consolidación automática con precio promedio ponderado
- **Precios en tiempo real**: Integración con Yahoo Finance (tickers con sufijo `.SN`)
- **Caché de precios**: 5 minutos para minimizar llamadas a Yahoo Finance
- **Dashboard financiero**: KPIs, tabla de posiciones y gráficos interactivos
- **Historial de portafolio**: Evolución del valor en el tiempo

## Cálculos financieros

| Métrica | Fórmula |
|---|---|
| Capital invertido | `Σ(cantidad × precio_compra) + comisión` |
| Precio promedio | `Σ(cantidad × precio) / Σ(cantidad)` |
| Valor actual | `cantidad_total × precio_actual` |
| Ganancia capital | `valor_actual − capital_invertido` |
| Retorno % | `(ganancia / capital_invertido) × 100` |
| Yield on cost | `dividendos / capital_invertido × 100` |
| Peso portafolio | `valor_actual / valor_total_portafolio × 100` |

## API REST

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/portfolio` | Portafolio completo con métricas |
| POST | `/api/portfolio` | Agregar operación |
| PUT | `/api/portfolio/:id` | Editar operación |
| DELETE | `/api/portfolio/:id` | Eliminar operación |
| GET | `/api/price?ticker=XXX` | Precio actual de un ticker |
| GET | `/api/update-prices` | Actualizar todos los precios |
| GET | `/api/history?days=90` | Historial del portafolio |
| GET | `/api/tickers?q=XXX` | Autocompletado de tickers |

## Estructura del proyecto

```
portfolio-tracker/
├── backend/
│   ├── server.js          # Express server + middleware
│   ├── routes.js          # Definición de endpoints REST
│   ├── database.js        # Capa de datos (node:sqlite)
│   ├── calculations.js    # Cálculos financieros
│   ├── portfolioService.js# Lógica de negocio del portafolio
│   ├── priceService.js    # Gestión de caché de precios
│   └── yahooFinance.js    # Integración con Yahoo Finance
├── frontend/
│   ├── index.html         # Dashboard principal
│   ├── css/style.css      # Estilos (tema terminal financiero)
│   └── js/
│       ├── api.js         # Cliente HTTP (axios)
│       ├── app.js         # Orquestador principal
│       ├── dashboard.js   # Métricas KPI
│       ├── table.js       # Tabla de posiciones
│       ├── charts.js      # Gráficos (Chart.js)
│       └── portfolio.js   # Modal de operaciones
├── config/
│   └── tickers_chile.json # Lista de tickers chilenos conocidos
├── db/
│   └── portfolio.db       # Base de datos SQLite (autogenerada)
└── package.json
```

## Tickers chilenos

Los tickers de la Bolsa de Santiago usan el sufijo `.SN`:

```
SQM-B.SN    COPEC.SN    FALABELLA.SN    ENELCHILE.SN
CENCOSUD.SN BCI.SN      BSANTANDER.SN   CHILE.SN
CMPC.SN     COLBUN.SN   CCU.SN          CONCHA.SN
```

El sistema incluye autocompletado con 35+ tickers preconfigurados.

## Tecnología

- **Backend**: Node.js 22+ · Express 4 · SQLite (built-in `node:sqlite`)
- **Frontend**: HTML5 · CSS3 · Vanilla JavaScript · Chart.js · Axios
- **Datos**: Yahoo Finance API (sin clave API requerida)

https://porfolio-gqx3.onrender.com/
