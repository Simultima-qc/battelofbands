'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const postgres = require('postgres');

const { createApp } = require('../index');
const {
  PostgresStore,
  initializeStore,
  getStore,
  closeStore,
} = require('../db/store');
const { runMigrations } = require('../db/migrate');
const { normalizeArtistName } = require('../lib/artistSelection');

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

function fixtureArtists() {
  const artists = [];

  for (let i = 1; i <= 16; i += 1) {
    artists.push({
      id: `rock-${i}`,
      name: `Rock Artist ${i}`,
      country: 'US',
      language: 'English',
      genres: ['Rock'],
      popularity: 4 + (i % 7),
    });
  }

  artists.push({
    id: 'rock-duplicate',
    name: '  ROCK   ARTIST 1  ',
    country: 'US',
    language: 'English',
    genres: ['Rock'],
    popularity: 10,
  });

  for (let i = 1; i <= 15; i += 1) {
    artists.push({
      id: `jazz-${i}`,
      name: `Jazz Artist ${i}`,
      country: 'CA',
      language: 'French',
      genres: ['Jazz'],
      popularity: 6,
    });
  }

  return artists;
}

async function withHttpApp(run) {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const body = await response.json();
    return { response, body };
  }

  try {
    await run(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function rankingTotals(sql) {
  const [row] = await sql`
    SELECT
      COALESCE(SUM(points), 0)::int AS points,
      COALESCE(SUM(wins), 0)::int AS wins,
      COALESCE(SUM(tournaments_played), 0)::int AS tournaments_played
    FROM battleofbands.rankings
  `;
  return {
    points: Number(row.points),
    wins: Number(row.wins),
    tournaments_played: Number(row.tournaments_played),
  };
}

test('PostgresStore recycles a stale client before business work begins', async () => {
  const closed = [];
  const clients = [
    { id: 1, end: async () => closed.push(1) },
    { id: 2, end: async () => closed.push(2) },
  ];
  let pingCount = 0;

  const store = new PostgresStore({
    connectionString: 'postgres://example.invalid/test',
    ssl: false,
    clientFactory: () => clients.shift(),
    ping: async (client) => {
      pingCount += 1;
      if (client.id === 1) throw new Error('stale socket');
    },
    livenessTimeoutMs: 50,
  });

  await store.ensureAlive();

  assert.equal(store.sql.id, 2);
  assert.equal(pingCount, 2);
  assert.deepEqual(closed, [1]);

  await store.close();
  assert.deepEqual(closed, [1, 2]);
});

test('PostgresStore serializes concurrent stale-client recovery', async () => {
  const closed = [];
  let factoryCalls = 0;
  let releaseStalePings;
  const staleGate = new Promise((resolve) => {
    releaseStalePings = resolve;
  });
  let stalePingCount = 0;

  const staleClient = {
    id: 1,
    end: async () => {
      closed.push(1);
      await new Promise((resolve) => setTimeout(resolve, 5));
    },
  };
  const replacementClient = {
    id: 2,
    end: async () => closed.push(2),
  };

  const store = new PostgresStore({
    connectionString: 'postgres://example.invalid/test',
    ssl: false,
    clientFactory: () => {
      factoryCalls += 1;
      return factoryCalls === 1 ? staleClient : replacementClient;
    },
    ping: async (client) => {
      if (client.id === 1) {
        stalePingCount += 1;
        if (stalePingCount === 2) releaseStalePings();
        await staleGate;
        throw new Error('stale socket');
      }
    },
    livenessTimeoutMs: 100,
  });

  await Promise.all([
    store.ensureAlive(),
    store.ensureAlive(),
  ]);

  assert.equal(factoryCalls, 2, 'only one replacement client should be created');
  assert.equal(store.sql, replacementClient);
  assert.deepEqual(closed, [1], 'stale client should be closed exactly once');
  assert.equal(store.reconnectPromise, null);

  await store.close();
  assert.deepEqual(closed, [1, 2]);
});

test('Postgres migration, seed, tournament and retry contracts', {
  skip: !TEST_DATABASE_URL,
  timeout: 30000,
}, async () => {
  await runMigrations({
    connectionString: TEST_DATABASE_URL,
    ssl: false,
  });
  const secondMigration = await runMigrations({
    connectionString: TEST_DATABASE_URL,
    ssl: false,
  });
  assert.deepEqual(secondMigration.applied, []);

  const admin = postgres(TEST_DATABASE_URL, {
    max: 1,
    prepare: false,
    ssl: false,
  });

  try {
    await admin.unsafe(`
      TRUNCATE TABLE
        battleofbands.tournament_matches,
        battleofbands.tournaments,
        battleofbands.rankings,
        battleofbands.artists
      CASCADE
    `);

    const rls = await admin`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'battleofbands'
        AND c.relname IN ('artists', 'tournaments', 'tournament_matches', 'rankings')
      ORDER BY c.relname
    `;
    assert.equal(rls.length, 4);
    assert.ok(rls.every((row) => row.relrowsecurity === true));

    await initializeStore({
      provider: 'postgres',
      connectionString: TEST_DATABASE_URL,
      ssl: false,
    });

    const store = getStore();
    const firstSeed = await store.seedArtists(fixtureArtists());
    const secondSeed = await store.seedArtists(fixtureArtists());

    assert.equal(firstSeed.total, 32);
    assert.equal(secondSeed.total, 32);

    const artistRows = await admin`
      SELECT id, name
      FROM battleofbands.artists
      WHERE id LIKE 'rock-%'
      ORDER BY id
    `;
    assert.equal(artistRows.length, 17);

    await withHttpApp(async (request) => {
      const categories = await request('/api/artists/categories');
      assert.equal(categories.response.status, 200);
      assert.ok(categories.body.categories.genre.includes('Rock'));
      assert.ok(!categories.body.categories.genre.includes('Jazz'));
      assert.equal(categories.body.categories._counts.genre.Rock, 16);

      const started = await request('/api/tournament/start', {
        method: 'POST',
        body: JSON.stringify({
          user_session: 'postgres-session',
          category_type: 'genre',
          category_value: 'Rock',
        }),
      });

      assert.equal(started.response.status, 201);
      assert.equal(started.body.bracket.length, 1);
      assert.equal(started.body.bracket[0].length, 8);

      const entrants = started.body.bracket[0].flatMap((match) => [
        match.artist1,
        match.artist2,
      ]);
      assert.equal(entrants.length, 16);
      assert.equal(
        new Set(entrants.map((artist) => normalizeArtistName(artist.name))).size,
        16
      );

      const tournamentId = started.body.tournament.id;
      let state = started.body;
      let safety = 0;

      while (true) {
        const pending = state.bracket.flat().find((match) => !match.winner_id);
        assert.ok(pending, 'expected a pending match');

        if (Number(pending.round) === 4) {
          const payload = JSON.stringify({
            match_id: pending.id,
            winner_id: pending.artist1.id,
          });

          const results = await Promise.all([
            request(`/api/tournament/${tournamentId}/match`, {
              method: 'POST',
              body: payload,
            }),
            request(`/api/tournament/${tournamentId}/match`, {
              method: 'POST',
              body: payload,
            }),
          ]);

          const statuses = results.map((result) => result.response.status).sort();
          assert.deepEqual(statuses, [200, 400]);

          const winnerState = results.find((result) => result.response.status === 200).body;
          assert.equal(winnerState.tournament.status, 'completed');
          state = winnerState;
          break;
        }

        const voted = await request(`/api/tournament/${tournamentId}/match`, {
          method: 'POST',
          body: JSON.stringify({
            match_id: pending.id,
            winner_id: pending.artist1.id,
          }),
        });

        assert.equal(voted.response.status, 200);
        state = voted.body;
        safety += 1;
        assert.ok(safety < 20);
      }

      assert.deepEqual(state.bracket.map((round) => round.length), [8, 4, 2, 1]);
      assert.equal(state.bracket.flat().length, 15);
      assert.ok(state.bracket.flat().every((match) => match.winner_id));

      const totalsAfterCompletion = await rankingTotals(admin);
      assert.equal(totalsAfterCompletion.tournaments_played, 16);
      assert.equal(totalsAfterCompletion.wins, 15);
      assert.ok(totalsAfterCompletion.points > 0);

      const stageRows = await admin`
        SELECT
          COALESCE(SUM(quarters), 0)::int AS quarters,
          COALESCE(SUM(semis), 0)::int AS semis,
          COALESCE(SUM(finals), 0)::int AS finals
        FROM battleofbands.rankings
      `;
      assert.equal(Number(stageRows[0].quarters), 4);
      assert.equal(Number(stageRows[0].semis), 2);
      assert.equal(Number(stageRows[0].finals), 1);

      const completeAgain = await request(
        `/api/tournament/${tournamentId}/complete`,
        { method: 'POST', body: '{}' }
      );
      assert.equal(completeAgain.response.status, 200);
      assert.equal(
        (await rankingTotals(admin)).tournaments_played,
        16,
        'idempotent completion must not double-apply rankings'
      );

      const abandoned = await request('/api/tournament/start', {
        method: 'POST',
        body: JSON.stringify({
          user_session: 'abandoned-session',
          category_type: 'genre',
          category_value: 'Rock',
        }),
      });
      assert.equal(abandoned.response.status, 201);

      const firstMatch = abandoned.body.bracket[0][0];
      const partialVote = await request(
        `/api/tournament/${abandoned.body.tournament.id}/match`,
        {
          method: 'POST',
          body: JSON.stringify({
            match_id: firstMatch.id,
            winner_id: firstMatch.artist1.id,
          }),
        }
      );
      assert.equal(partialVote.response.status, 200);
      assert.deepEqual(
        await rankingTotals(admin),
        totalsAfterCompletion,
        'abandoned progress must not affect aggregate rankings'
      );
    });
  } finally {
    await closeStore();
    await admin.end({ timeout: 2 });
  }
});
