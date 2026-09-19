'use strict';

const serverless = require('serverless-http');
const { createApp } = require('../../index');
const { ensureRuntimeReady } = require('../../runtime');

function startupFailure(error) {
  const safeMeta = {
    name: error?.name || 'Error',
    code: error?.code ? String(error.code) : null,
  };

  console.error('[Function startup] Runtime initialization failed.', safeMeta);

  return {
    statusCode: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify({ error: 'Service unavailable.' }),
  };
}

function createNetlifyHandler({
  app = createApp(),
  ensureReady = ensureRuntimeReady,
} = {}) {
  const expressHandler = serverless(app);

  return async function handler(event, context) {
    try {
      await ensureReady();
    } catch (error) {
      return startupFailure(error);
    }

    return expressHandler(event, context);
  };
}

const handler = createNetlifyHandler();

module.exports = {
  handler,
  createNetlifyHandler,
};
