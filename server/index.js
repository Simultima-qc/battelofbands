'use strict';

const express = require('express');
const cors    = require('cors');
const { initializeDb } = require('./db/database');

// ---------------------------------------------------------------------------
// Bootstrap database
// ---------------------------------------------------------------------------
initializeDb();

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app  = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',   // Vite default dev server
    'http://127.0.0.1:5173',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const artistsRouter    = require('./routes/artists');
const tournamentRouter = require('./routes/tournament');
const rankingsRouter   = require('./routes/rankings');

app.use('/api/artists',    artistsRouter);
app.use('/api/tournament', tournamentRouter);
app.use('/api/rankings',   rankingsRouter);

// Health-check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error.',
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[Server] BattleOfBands API listening on http://localhost:${PORT}`);
});

module.exports = app;
