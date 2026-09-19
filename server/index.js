'use strict';

const express = require('express');
const cors = require('cors');
const { initializeStore } = require('./db/store');

function createApp() {
  const app = express();

  app.use(cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const artistsRouter = require('./routes/artists');
  const tournamentRouter = require('./routes/tournament');
  const rankingsRouter = require('./routes/rankings');

  app.use('/api/artists', artistsRouter);
  app.use('/api/tournament', tournamentRouter);
  app.use('/api/rankings', rankingsRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[Error]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error.',
    });
  });

  return app;
}

async function startServer() {
  await initializeStore();

  const app = createApp();
  const PORT = process.env.PORT || 3001;
  return app.listen(PORT, () => {
    console.log(`[Server] BattleOfBands API listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[Startup]', error);
    process.exitCode = 1;
  });
}

module.exports = { createApp, startServer };
