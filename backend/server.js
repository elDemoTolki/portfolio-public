'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Middleware ────────────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const priceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many price requests, please wait.' },
});

app.use('/api/', apiLimiter);
app.use('/api/price', priceLimiter);
app.use('/api/update-prices', priceLimiter);

// ─── Static Frontend ──────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api', routes);

// ─── SPA Fallback ─────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         PORTFOLIO TRACKER - ACCIONES CHILENAS        ║
╠══════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}            ║
║  Environment:       ${(process.env.NODE_ENV || 'production').padEnd(30)} ║
╚══════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
