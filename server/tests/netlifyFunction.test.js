'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createRuntimeInitializer,
} = require('../runtime');
const {
  initializeStore,
  getStore,
  closeStore,
} = require('../db/store');
const {
  createNetlifyHandler,
} = require('../netlify/functions/api');

function fixtureArtists() {
  return Array.from({ length: 16 }, (_, index) => ({
    id: `rock-${index + 1}`,
    name: `Rock Artist ${index + 1}`,
    country: 'CA',
    language: 'English',
    genres: ['Rock'],
    popularity: 5 + (index % 5),
  }));
}

function event(method, requestPath, body = null) {
  return {
    httpMethod: method,
    path: requestPath,
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
    },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    requestContext: {
      identity: {
        sourceIp: '127.0.0.1',
      },
    },
    body: body === null ? null : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function json(result) {
  return result.body ? JSON.parse(result.body) : null;
}

test('runtime initialization is single-flight and reused after warm initialization', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const runtime = createRuntimeInitializer(async () => {
    calls += 1;
    await gate;
  });

  const first = runtime.ensureRuntimeReady();
  const second = runtime.ensureRuntimeReady();

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(runtime.getState(), {
    initialized: false,
    initializing: true,
  });

  release();
  await Promise.all([first, second]);
  await runtime.ensureRuntimeReady();

  assert.equal(calls, 1);
  assert.deepEqual(runtime.getState(), {
    initialized: true,
    initializing: false,
  });
});

test('runtime initialization can retry after a failed cold-start attempt', async () => {
  let attempts = 0;
  const runtime = createRuntimeInitializer(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('first attempt failed');
  });

  await assert.rejects(runtime.ensureRuntimeReady(), /first attempt failed/);
  await runtime.ensureRuntimeReady();

  assert.equal(attempts, 2);
  assert.equal(runtime.getState().initialized, true);
});

test('Netlify handler preserves the Express API contract across repeated invocations', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battleofbands-netlify-'));
  const dbPath = path.join(tempDir, 'test.db');

  try {
    await initializeStore({
      provider: 'sqlite',
      sqlitePath: dbPath,
    });
    await getStore().seedArtists(fixtureArtists());

    const handler = createNetlifyHandler({
      ensureReady: async () => {},
    });

    const health = await handler(event('GET', '/api/health'), {});
    assert.equal(health.statusCode, 200);
    assert.equal(json(health).status, 'ok');

    const categories = await handler(event('GET', '/api/artists/categories'), {});
    assert.equal(categories.statusCode, 200);
    assert.ok(json(categories).categories.genre.includes('Rock'));

    const started = await handler(event('POST', '/api/tournament/start', {
      user_session: 'netlify-test-session',
      category_type: 'genre',
      category_value: 'Rock',
    }), {});

    assert.equal(started.statusCode, 201);
    const state = json(started);
    assert.equal(state.bracket.length, 1);
    assert.equal(state.bracket[0].length, 8);

    const firstMatch = state.bracket[0][0];
    const voted = await handler(
      event('POST', `/api/tournament/${state.tournament.id}/match`, {
        match_id: firstMatch.id,
        winner_id: firstMatch.artist1.id,
      }),
      {}
    );

    assert.equal(voted.statusCode, 200);
    assert.equal(json(voted).bracket[0][0].winner_id, firstMatch.artist1.id);

    const missing = await handler(event('GET', '/api/not-a-route'), {});
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(json(missing), { error: 'Route not found.' });
  } finally {
    await closeStore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Netlify startup failure returns controlled JSON without leaking secrets', async () => {
  const secret = 'postgres://user:super-secret@example.invalid/db';
  const originalError = console.error;
  console.error = () => {};

  try {
    const handler = createNetlifyHandler({
      ensureReady: async () => {
        throw new Error(`cannot connect to ${secret}`);
      },
    });

    const result = await handler(event('GET', '/api/health'), {});
    assert.equal(result.statusCode, 503);
    assert.deepEqual(json(result), { error: 'Service unavailable.' });
    assert.ok(!result.body.includes(secret));
  } finally {
    console.error = originalError;
  }
});
