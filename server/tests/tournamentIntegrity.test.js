'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createApp } = require('../index');
const { initializeDb, getDb, closeDb } = require('../db/database');
const {
  normalizeArtistName,
  weightedSampleWithoutReplacement,
} = require('../lib/artistSelection');

function seedArtist(db, artist) {
  db.prepare(`
    INSERT INTO artists (id, name, country, language, genres, image_url, mbid, popularity)
    VALUES (@id, @name, @country, @language, @genres, NULL, NULL, @popularity)
  `).run({
    ...artist,
    genres: JSON.stringify(artist.genres),
  });
  db.prepare(`INSERT INTO rankings (artist_id) VALUES (?)`).run(artist.id);
}

function seedFixture(db) {
  for (let i = 1; i <= 16; i += 1) {
    seedArtist(db, {
      id: `rock-${i}`,
      name: `Rock Artist ${i}`,
      country: 'US',
      language: 'English',
      genres: ['Rock'],
      popularity: 4 + (i % 7),
    });
  }

  // Duplicate display identity must not create a 17th eligible tournament slot.
  seedArtist(db, {
    id: 'rock-duplicate',
    name: '  ROCK   ARTIST 1  ',
    country: 'US',
    language: 'English',
    genres: ['Rock'],
    popularity: 10,
  });

  for (let i = 1; i <= 15; i += 1) {
    seedArtist(db, {
      id: `jazz-${i}`,
      name: `Jazz Artist ${i}`,
      country: 'CA',
      language: 'French',
      genres: ['Jazz'],
      popularity: 6,
    });
  }
}

async function withApi(run) {
  initializeDb(':memory:');
  const db = getDb();
  seedFixture(db);

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
    await run({ db, request });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDb();
  }
}

function rankingTotals(db) {
  return db.prepare(`
    SELECT
      SUM(points) AS points,
      SUM(wins) AS wins,
      SUM(tournaments_played) AS tournaments_played
    FROM rankings
  `).get();
}

test('weighted selection never duplicates a normalized artist identity', () => {
  const artists = [
    { id: '1', name: 'The Band', popularity: 10 },
    { id: '2', name: '  THE   BAND ', popularity: 9 },
    { id: '3', name: 'Other', popularity: 1 },
    { id: '4', name: 'Third', popularity: 5 },
  ];

  const sequence = [0.99, 0.98, 0.7, 0.8];
  let index = 0;
  const chosen = weightedSampleWithoutReplacement(
    artists,
    3,
    () => sequence[index++ % sequence.length]
  );

  const identities = chosen.map((artist) => normalizeArtistName(artist.name));
  assert.equal(new Set(identities).size, 3);
  assert.equal(identities.filter((name) => name === 'the band').length, 1);
});

test('weighted selection favors higher popularity for the same random draw', () => {
  const chosen = weightedSampleWithoutReplacement(
    [
      { id: 'low', name: 'Low Popularity', popularity: 1 },
      { id: 'high', name: 'High Popularity', popularity: 10 },
    ],
    1,
    () => 0.5
  );

  assert.equal(chosen[0].id, 'high');
});

test('MVP tournament API enforces 16 unique artists and defers rankings until completion', async () => {
  await withApi(async ({ db, request }) => {
    const categories = await request('/api/artists/categories');
    assert.equal(categories.response.status, 200);
    assert.ok(categories.body.categories.genre.includes('Rock'));
    assert.ok(!categories.body.categories.genre.includes('Jazz'));
    assert.equal(categories.body.categories._counts.genre.Rock, 16);
    assert.equal(categories.body.categories._minimum_required, 16);

    const tooSmall = await request('/api/tournament/start', {
      method: 'POST',
      body: JSON.stringify({
        user_session: 'small-session',
        category_type: 'genre',
        category_value: 'Jazz',
      }),
    });
    assert.equal(tooSmall.response.status, 400);
    assert.equal(tooSmall.body.available, 15);
    assert.equal(tooSmall.body.required, 16);

    const started = await request('/api/tournament/start', {
      method: 'POST',
      body: JSON.stringify({
        user_session: 'mvp-session',
        category_type: 'genre',
        category_value: 'Rock',
      }),
    });

    assert.equal(started.response.status, 201);
    assert.equal(started.body.tournament.status, 'in_progress');
    assert.equal(started.body.bracket.length, 1);
    assert.equal(started.body.bracket[0].length, 8);

    const roundOneArtists = started.body.bracket[0].flatMap((match) => [
      match.artist1,
      match.artist2,
    ]);
    assert.equal(roundOneArtists.length, 16);
    assert.equal(
      new Set(roundOneArtists.map((artist) => normalizeArtistName(artist.name))).size,
      16
    );

    assert.deepEqual(rankingTotals(db), {
      points: 0,
      wins: 0,
      tournaments_played: 0,
    });

    const tournamentId = started.body.tournament.id;
    const firstMatch = started.body.bracket[0][0];
    const firstVote = await request(`/api/tournament/${tournamentId}/match`, {
      method: 'POST',
      body: JSON.stringify({
        match_id: firstMatch.id,
        winner_id: firstMatch.artist1.id,
      }),
    });
    assert.equal(firstVote.response.status, 200);

    // Partial/abandoned progress must not affect aggregate rankings.
    assert.deepEqual(rankingTotals(db), {
      points: 0,
      wins: 0,
      tournaments_played: 0,
    });

    const duplicateVote = await request(`/api/tournament/${tournamentId}/match`, {
      method: 'POST',
      body: JSON.stringify({
        match_id: firstMatch.id,
        winner_id: firstMatch.artist1.id,
      }),
    });
    assert.equal(duplicateVote.response.status, 400);
    assert.match(duplicateVote.body.error, /already recorded/i);

    let state = firstVote.body;
    let safety = 0;
    while (state.tournament.status !== 'completed') {
      const pending = state.bracket.flat().find((match) => !match.winner_id);
      assert.ok(pending, 'expected a pending match before completion');

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
      assert.ok(safety < 20, 'tournament should complete within 15 total votes');
    }

    assert.equal(state.tournament.status, 'completed');
    assert.ok(state.tournament.winner);
    assert.equal(state.bracket.length, 4);
    assert.deepEqual(state.bracket.map((round) => round.length), [8, 4, 2, 1]);
    assert.equal(state.bracket.flat().length, 15);
    assert.ok(state.bracket.flat().every((match) => match.winner_id));

    const played = db.prepare(`
      SELECT tournaments_played
      FROM rankings
      WHERE artist_id IN (
        SELECT artist1_id FROM tournament_matches WHERE tournament_id = ? AND round = 1
        UNION
        SELECT artist2_id FROM tournament_matches WHERE tournament_id = ? AND round = 1
      )
    `).all(tournamentId, tournamentId);

    assert.equal(played.length, 16);
    assert.ok(played.every((row) => row.tournaments_played === 1));

    const totalsAfterCompletion = rankingTotals(db);
    assert.equal(totalsAfterCompletion.tournaments_played, 16);
    assert.ok(totalsAfterCompletion.points > 0);
    assert.equal(totalsAfterCompletion.wins, 15);

    const stageTotals = db.prepare(`
      SELECT
        SUM(quarters) AS quarters,
        SUM(semis) AS semis,
        SUM(finals) AS finals
      FROM rankings
    `).get();
    assert.deepEqual(stageTotals, {
      quarters: 4,
      semis: 2,
      finals: 1,
    });

    // Completion endpoint is idempotent once the tournament is already complete.
    const completeAgain = await request(`/api/tournament/${tournamentId}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(completeAgain.response.status, 200);
    assert.equal(rankingTotals(db).tournaments_played, 16);
  });
});
