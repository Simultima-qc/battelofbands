'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseAllowedOrigins,
  getAllowedOrigins,
  resolveDatabaseSsl,
  resolveStoreProvider,
  DEV_ORIGINS,
} = require('../config');
const { initializeDb, closeDb } = require('../db/database');
const { createApp, errorHandler } = require('../index');

test('parseAllowedOrigins splits, trims and drops empty entries', () => {
  assert.deepEqual(parseAllowedOrigins(''), []);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(
    parseAllowedOrigins(' https://alpha.example.com , https://beta.example.com ,,'),
    ['https://alpha.example.com', 'https://beta.example.com']
  );
});

test('getAllowedOrigins always trusts local Vite dev origins', () => {
  const origins = getAllowedOrigins({});
  for (const devOrigin of DEV_ORIGINS) {
    assert.ok(origins.includes(devOrigin));
  }
});

test('getAllowedOrigins adds explicit ALLOWED_ORIGINS without enabling a wildcard', () => {
  const origins = getAllowedOrigins({ ALLOWED_ORIGINS: 'https://alpha.example.com' });
  assert.ok(origins.includes('https://alpha.example.com'));
  assert.ok(!origins.includes('*'));
});

test('resolveDatabaseSsl requires TLS unless explicitly disabled', () => {
  assert.equal(resolveDatabaseSsl({}), 'require');
  assert.equal(resolveDatabaseSsl({ DATABASE_SSL: 'false' }), false);
  assert.equal(resolveDatabaseSsl({ DATABASE_SSL: 'anything-else' }), 'require');
});

test('resolveStoreProvider fails safe: production without DATABASE_URL must not silently fall back to SQLite', () => {
  assert.throws(
    () => resolveStoreProvider({ env: { NODE_ENV: 'production' } }),
    /DATABASE_URL is required/
  );
});

test('resolveStoreProvider allows SQLite outside production when no DATABASE_URL is set', () => {
  assert.equal(resolveStoreProvider({ env: {} }), 'sqlite');
  assert.equal(resolveStoreProvider({ env: { NODE_ENV: 'test' } }), 'sqlite');
});

test('resolveStoreProvider selects postgres whenever a connection string is available, in any environment', () => {
  assert.equal(
    resolveStoreProvider({ env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://x' } }),
    'postgres'
  );
  assert.equal(
    resolveStoreProvider({ connectionString: 'postgres://explicit', env: {} }),
    'postgres'
  );
});

test('resolveStoreProvider respects an explicit provider override regardless of environment', () => {
  assert.equal(
    resolveStoreProvider({ provider: 'sqlite', env: { NODE_ENV: 'production' } }),
    'sqlite'
  );
});

async function withApp(run) {
  initializeDb(':memory:');
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDb();
  }
}

test('CORS: localhost dev origin is accepted', async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });
});

test('CORS: an unapproved cross-origin request does not receive permissive CORS headers', async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    assert.equal(res.status, 200); // request still succeeds server-side; the browser enforces CORS
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
  });
});

test('CORS: a request with no Origin header (same-origin/non-browser) is not blocked', async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
  });
});

test('Error handler never echoes an internal (non-HttpError) message to the client', () => {
  const err = new Error('connection to postgres://user:super-secret@example.invalid/db failed');
  let statusCode;
  let jsonBody;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
    },
  };

  errorHandler(err, {}, res, () => {});

  assert.equal(statusCode, 500);
  assert.deepEqual(jsonBody, { error: 'Internal server error.' });
  assert.ok(!JSON.stringify(jsonBody).includes('super-secret'));
});

test('Error handler forwards an HttpError message (API-safe by construction)', () => {
  const { HttpError } = require('../lib/http');
  const err = new HttpError(404, 'Tournament not found.');
  let statusCode;
  let jsonBody;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
    },
  };

  errorHandler(err, {}, res, () => {});

  assert.equal(statusCode, 404);
  assert.deepEqual(jsonBody, { error: 'Tournament not found.' });
});
