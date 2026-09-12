'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Points awarded for winning a match in each round.
 * Round indices are 1-based (round 1 … round 5).
 */
const ROUND_POINTS = {
  1: 1,
  2: 2,
  3: 4,  // quarter-finals
  4: 8,  // semi-finals
  5: 16, // final
};

/** Bonus points awarded to the overall tournament winner (on top of the final win). */
const WINNER_BONUS = 16;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fisher-Yates in-place shuffle */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Determine the total number of rounds for a given bracket size.
 * Size must be a power of 2.  e.g. 32 artists → 5 rounds.
 */
function totalRounds(size) {
  return Math.log2(size);
}

/**
 * Build the full bracket structure for a tournament from the DB.
 * Returns rounds as an array of arrays of match objects.
 */
function buildBracket(db, tournamentId) {
  const matches = db
    .prepare(
      `SELECT
        tm.*,
        a1.name     AS artist1_name,  a1.image_url AS artist1_image,
        a1.country  AS artist1_country, a1.genres AS artist1_genres,
        a2.name     AS artist2_name,  a2.image_url AS artist2_image,
        a2.country  AS artist2_country, a2.genres AS artist2_genres,
        aw.name     AS winner_name
       FROM tournament_matches tm
       JOIN artists a1 ON a1.id = tm.artist1_id
       JOIN artists a2 ON a2.id = tm.artist2_id
       LEFT JOIN artists aw ON aw.id = tm.winner_id
       WHERE tm.tournament_id = ?
       ORDER BY tm.round ASC, tm.match_index ASC`
    )
    .all(tournamentId);

  // Group by round, return as sorted array of arrays
  const roundMap = {};
  for (const m of matches) {
    if (!roundMap[m.round]) roundMap[m.round] = [];
    // Attach artist objects for easier frontend use
    roundMap[m.round].push({
      ...m,
      artist1: { id: m.artist1_id, name: m.artist1_name, image_url: m.artist1_image, country: m.artist1_country, genres: m.artist1_genres },
      artist2: { id: m.artist2_id, name: m.artist2_name, image_url: m.artist2_image, country: m.artist2_country, genres: m.artist2_genres },
    });
  }

  return Object.keys(roundMap)
    .sort((a, b) => Number(a) - Number(b))
    .map(r => roundMap[r]);
}

/**
 * Ensure every artist in the tournament has a rankings row.
 */
function ensureRankingRows(db, artistIds) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO rankings (artist_id) VALUES (?)`
  );
  const tx = db.transaction((ids) => ids.forEach((id) => insert.run(id)));
  tx(artistIds);
}

/**
 * Award points + stat updates to the winner of a single match.
 */
function awardMatchPoints(db, winnerId, round) {
  const pts = ROUND_POINTS[round] ?? 1;

  const updateBase = db.prepare(`
    UPDATE rankings
    SET points = points + @pts,
        wins   = wins   + 1
    WHERE artist_id = @winnerId
  `);

  const updates = { updateBase };

  // Round-specific stat columns
  if (round === 3) updates.updateQuarters = db.prepare(`UPDATE rankings SET quarters = quarters + 1 WHERE artist_id = ?`);
  if (round === 4) updates.updateSemis    = db.prepare(`UPDATE rankings SET semis    = semis    + 1 WHERE artist_id = ?`);
  if (round === 5) updates.updateFinals   = db.prepare(`UPDATE rankings SET finals   = finals   + 1 WHERE artist_id = ?`);

  updates.updateBase.run({ pts, winnerId });
  if (updates.updateQuarters) updates.updateQuarters.run(winnerId);
  if (updates.updateSemis)    updates.updateSemis.run(winnerId);
  if (updates.updateFinals)   updates.updateFinals.run(winnerId);
}

// ---------------------------------------------------------------------------
// POST /api/tournament/start
// Body: { user_session, category_type, category_value, artist_ids? }
// ---------------------------------------------------------------------------
router.post('/start', (req, res) => {
  const db = getDb();
  const { user_session, category_type, category_value, artist_ids } = req.body;

  if (!user_session) {
    return res.status(400).json({ error: 'user_session is required.' });
  }
  if (!category_type || !category_value) {
    return res.status(400).json({ error: 'category_type and category_value are required.' });
  }

  // Resolve artist pool -------------------------------------------------------
  let artists;

  if (Array.isArray(artist_ids) && artist_ids.length >= 2) {
    // Caller pre-selected the artists
    const placeholders = artist_ids.map(() => '?').join(',');
    artists = db
      .prepare(`SELECT id, name FROM artists WHERE id IN (${placeholders})`)
      .all(...artist_ids);
  } else {
    // Auto-select 32 random artists from the category
    const val = category_value.toLowerCase();
    let pool;

    if (category_type === 'genre') {
      pool = db.prepare(`SELECT id, name FROM artists WHERE LOWER(genres) LIKE ?`).all(`%"${val}"%`);
    } else if (category_type === 'country') {
      pool = db.prepare(`SELECT id, name FROM artists WHERE LOWER(country) = ?`).all(val);
    } else if (category_type === 'language') {
      pool = db.prepare(`SELECT id, name FROM artists WHERE LOWER(language) = ?`).all(val);
    } else {
      pool = db.prepare(`SELECT id, name FROM artists`).all();
    }

    if (pool.length < 2) {
      return res.status(400).json({
        error: 'Not enough artists in this category (minimum 2).',
        available: pool.length,
      });
    }

    shuffle(pool);
    // Snap to the nearest lower power of 2 (max 32)
    const bracketSize = Math.min(
      32,
      Math.pow(2, Math.floor(Math.log2(Math.min(pool.length, 32))))
    );
    artists = pool.slice(0, bracketSize);
  }

  // Ensure bracket size is a power of 2 between 2 and 32
  if (artists.length < 2) {
    return res.status(400).json({ error: 'Not enough valid artists to start a tournament.' });
  }

  const bracketSize = Math.pow(2, Math.floor(Math.log2(artists.length)));
  artists = shuffle(artists).slice(0, bracketSize);

  const tournamentId = uuidv4();
  const now = new Date().toISOString();

  const createTournament = db.transaction(() => {
    db.prepare(`
      INSERT INTO tournaments (id, user_session, category_type, category_value, status, created_at)
      VALUES (@id, @user_session, @category_type, @category_value, 'in_progress', @created_at)
    `).run({
      id: tournamentId,
      user_session,
      category_type,
      category_value,
      created_at: now,
    });

    ensureRankingRows(db, artists.map((a) => a.id));

    // Increment tournaments_played for all participants
    const incPlayed = db.prepare(`
      UPDATE rankings SET tournaments_played = tournaments_played + 1 WHERE artist_id = ?
    `);
    artists.forEach((a) => incPlayed.run(a.id));

    // Create Round 1 matches
    const insertMatch = db.prepare(`
      INSERT INTO tournament_matches
        (id, tournament_id, round, match_index, artist1_id, artist2_id)
      VALUES (@id, @tournament_id, @round, @match_index, @artist1_id, @artist2_id)
    `);

    for (let i = 0; i < artists.length; i += 2) {
      insertMatch.run({
        id: uuidv4(),
        tournament_id: tournamentId,
        round: 1,
        match_index: i / 2,
        artist1_id: artists[i].id,
        artist2_id: artists[i + 1].id,
      });
    }
  });

  createTournament();

  const tournament = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(tournamentId);
  const bracket   = buildBracket(db, tournamentId);

  res.status(201).json({ tournament, bracket });
});

// ---------------------------------------------------------------------------
// Helper: attach winner object to tournament if completed
// ---------------------------------------------------------------------------
function attachWinner(db, tournament) {
  if (tournament && tournament.winner_id) {
    const winner = db.prepare(`SELECT * FROM artists WHERE id = ?`).get(tournament.winner_id);
    if (winner) {
      try { winner.genres = JSON.parse(winner.genres); } catch { winner.genres = []; }
      tournament = { ...tournament, winner };
    }
  }
  return tournament;
}

// ---------------------------------------------------------------------------
// GET /api/tournament/session/:sessionId
// Returns the active (in_progress) tournament for a session, if any.
// ---------------------------------------------------------------------------
router.get('/session/:sessionId', (req, res) => {
  const db = getDb();
  let tournament = db
    .prepare(
      `SELECT * FROM tournaments
       WHERE user_session = ? AND status = 'in_progress'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(req.params.sessionId);

  if (!tournament) {
    return res.json({ tournament: null, bracket: null });
  }

  tournament = attachWinner(db, tournament);
  const bracket = buildBracket(db, tournament.id);
  res.json({ tournament, bracket });
});

// ---------------------------------------------------------------------------
// GET /api/tournament/:id
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const db = getDb();
  let tournament = db
    .prepare(`SELECT * FROM tournaments WHERE id = ?`)
    .get(req.params.id);

  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  tournament = attachWinner(db, tournament);
  const bracket = buildBracket(db, tournament.id);
  res.json({ tournament, bracket });
});

// ---------------------------------------------------------------------------
// POST /api/tournament/:id/match
// Body: { match_id, winner_id }
// Records the result and, if the round is complete, generates the next round.
// ---------------------------------------------------------------------------
router.post('/:id/match', (req, res) => {
  const db = getDb();
  const { match_id, winner_id } = req.body;

  if (!match_id || !winner_id) {
    return res.status(400).json({ error: 'match_id and winner_id are required.' });
  }

  const tournament = db
    .prepare(`SELECT * FROM tournaments WHERE id = ?`)
    .get(req.params.id);

  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });
  if (tournament.status === 'completed') {
    return res.status(400).json({ error: 'Tournament is already completed.' });
  }

  const match = db
    .prepare(`SELECT * FROM tournament_matches WHERE id = ? AND tournament_id = ?`)
    .get(match_id, tournament.id);

  if (!match) return res.status(404).json({ error: 'Match not found in this tournament.' });
  if (match.winner_id) return res.status(400).json({ error: 'Match result already recorded.' });

  // winner_id must be one of the two participants
  if (winner_id !== match.artist1_id && winner_id !== match.artist2_id) {
    return res.status(400).json({ error: 'winner_id must be one of the two match participants.' });
  }

  const advanceBracket = db.transaction(() => {
    const playedAt = new Date().toISOString();

    // Record match result
    db.prepare(`
      UPDATE tournament_matches
      SET winner_id = @winner_id, played_at = @played_at
      WHERE id = @id
    `).run({ winner_id, played_at: playedAt, id: match_id });

    // Award points
    awardMatchPoints(db, winner_id, match.round);

    // Check if all matches in this round are complete
    const roundMatches = db
      .prepare(
        `SELECT * FROM tournament_matches
         WHERE tournament_id = ? AND round = ?
         ORDER BY match_index ASC`
      )
      .all(tournament.id, match.round);

    const allDone = roundMatches.every((m) => m.winner_id !== null || m.id === match_id);

    if (allDone) {
      // Gather winners in match-index order
      const winners = roundMatches.map((m) =>
        m.id === match_id ? winner_id : m.winner_id
      );

      if (winners.length === 1) {
        // Tournament over — mark completed
        db.prepare(`
          UPDATE tournaments
          SET status = 'completed', completed_at = ?, winner_id = ?
          WHERE id = ?
        `).run(playedAt, winners[0], tournament.id);

        // Award bonus points to the overall champion
        db.prepare(`
          UPDATE rankings SET points = points + ? WHERE artist_id = ?
        `).run(WINNER_BONUS, winners[0]);
      } else {
        // Build next round
        const nextRound = match.round + 1;
        const insertMatch = db.prepare(`
          INSERT INTO tournament_matches
            (id, tournament_id, round, match_index, artist1_id, artist2_id)
          VALUES (@id, @tournament_id, @round, @match_index, @artist1_id, @artist2_id)
        `);

        for (let i = 0; i < winners.length; i += 2) {
          insertMatch.run({
            id: uuidv4(),
            tournament_id: tournament.id,
            round: nextRound,
            match_index: i / 2,
            artist1_id: winners[i],
            artist2_id: winners[i + 1],
          });
        }
      }
    }
  });

  advanceBracket();

  let updatedTournament = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(tournament.id);
  updatedTournament = attachWinner(db, updatedTournament);
  const bracket = buildBracket(db, tournament.id);

  res.json({ tournament: updatedTournament, bracket });
});

// ---------------------------------------------------------------------------
// POST /api/tournament/:id/complete
// Force-completes a tournament (e.g. if the client lost state).
// Only usable when all matches are already played.
// ---------------------------------------------------------------------------
router.post('/:id/complete', (req, res) => {
  const db = getDb();

  const tournament = db
    .prepare(`SELECT * FROM tournaments WHERE id = ?`)
    .get(req.params.id);

  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });
  if (tournament.status === 'completed') {
    return res.json({ message: 'Already completed.', tournament });
  }

  // Find the highest round match with a winner
  const lastWinner = db
    .prepare(
      `SELECT winner_id FROM tournament_matches
       WHERE tournament_id = ? AND winner_id IS NOT NULL
       ORDER BY round DESC, match_index ASC
       LIMIT 1`
    )
    .get(tournament.id);

  if (!lastWinner) {
    return res.status(400).json({ error: 'No matches have been played yet.' });
  }

  const pendingMatches = db
    .prepare(
      `SELECT COUNT(*) AS c FROM tournament_matches
       WHERE tournament_id = ? AND winner_id IS NULL`
    )
    .get(tournament.id);

  if (pendingMatches.c > 0) {
    return res.status(400).json({
      error: `There are still ${pendingMatches.c} unplayed match(es). Complete all matches first.`,
    });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE tournaments
    SET status = 'completed', completed_at = ?, winner_id = ?
    WHERE id = ?
  `).run(now, lastWinner.winner_id, tournament.id);

  const updatedTournament = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(tournament.id);
  res.json({ tournament: updatedTournament });
});

module.exports = router;
