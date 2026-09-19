'use strict';

const express = require('express');
const cors = require('cors');
const { initializeStore } = require('./db/store');
const { getAllowedOrigins, getPort } = require('./config');
const { HttpError } = require('./lib/http');

function createApp() {
  const app = express();

  const allowedOrigins = getAllowedOrigins();

  app.use(cors({
    origin(origin, callback) {
      // No Origin header means same-origin or a non-browser client; the
      // production topology is same-origin, so this is the normal case.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Deny without throwing: the request proceeds without CORS headers,
      // so a browser will block the response instead of getting a 500.
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  app.use(errorHandler);

  return app;
}

// Only HttpError carries a message written for API consumers. Anything else
// (driver errors, unexpected exceptions) may embed connection strings or
// other internals and must not reach the response body.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  console.error('[Error]', err);
  const safeMessage = err instanceof HttpError ? err.message : 'Internal server error.';
  res.status(err.status || 500).json({ error: safeMessage });
}

async function startServer() {
  await initializeStore();

  const app = createApp();
  const PORT = getPort();
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

module.exports = { createApp, startServer, errorHandler };
