'use strict';

const express = require('express');
const router = express.Router();
const { getStore } = require('../db/store');
const {
  MVP_BRACKET_SIZE,
  dedupeArtistsByName,
  weightedSampleWithoutReplacement,
} = require('../lib/artistSelection');
const { asyncRoute } = require('../lib/http');

function filterArtistPool(artists, categoryType, categoryValue) {
  const value = String(categoryValue || '').toLowerCase();

  if (categoryType === 'genre') {
    return artists.filter((artist) =>
      (artist.genres || []).some((genre) => String(genre).toLowerCase() === value)
    );
  }

  if (categoryType === 'country') {
    return artists.filter(
      (artist) => String(artist.country || '').toLowerCase() === value
    );
  }

  if (categoryType === 'language') {
    return artists.filter(
      (artist) => String(artist.language || '').toLowerCase() === value
    );
  }

  return null;
}

function findTournamentMatch(state, matchId) {
  return state?.bracket?.flat().find((match) => match.id === matchId) || null;
}

function buildRerollPool(allArtists, state) {
  const tournament = state?.tournament;
  if (!tournament) return [];

  const categoryPool = filterArtistPool(
    allArtists,
    tournament.category_type,
    tournament.category_value
  );
  if (!categoryPool) return [];

  const usedIds = new Set(
    (state.bracket || [])
      .flat()
      .flatMap((match) => [match.artist1_id, match.artist2_id])
      .filter(Boolean)
  );

  return dedupeArtistsByName(categoryPool)
    .filter((artist) => !usedIds.has(artist.id));
}

router.post('/start', asyncRoute(async (req, res) => {
  const {
    user_session,
    category_type,
    category_value,
    artist_ids,
  } = req.body;

  if (!user_session) {
    return res.status(400).json({ error: 'user_session is required.' });
  }
  if (!category_type || !category_value) {
    return res.status(400).json({
      error: 'category_type and category_value are required.',
    });
  }

  const store = getStore();
  const allArtists = await store.listArtists();

  let pool;
  if (Array.isArray(artist_ids) && artist_ids.length > 0) {
    const requested = new Set(artist_ids);
    pool = allArtists.filter((artist) => requested.has(artist.id));
  } else {
    pool = filterArtistPool(allArtists, category_type, category_value);
    if (pool === null) {
      return res.status(400).json({
        error: `Unknown category_type: ${category_type}`,
      });
    }
  }

  const uniquePool = dedupeArtistsByName(pool);
  if (uniquePool.length < MVP_BRACKET_SIZE) {
    return res.status(400).json({
      error: `At least ${MVP_BRACKET_SIZE} unique artists are required for an MVP tournament.`,
      available: uniquePool.length,
      required: MVP_BRACKET_SIZE,
    });
  }

  const artists = weightedSampleWithoutReplacement(
    uniquePool,
    MVP_BRACKET_SIZE
  );

  const state = await store.createTournament({
    userSession: user_session,
    categoryType: category_type,
    categoryValue: category_value,
    artists,
  });

  res.status(201).json(state);
}));

router.get('/session/:sessionId', asyncRoute(async (req, res) => {
  const state = await getStore().getActiveTournamentState(req.params.sessionId);
  res.json(state);
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const state = await getStore().getTournamentState(req.params.id);
  if (!state) return res.status(404).json({ error: 'Tournament not found.' });
  res.json(state);
}));

router.post('/:id/match/reroll', asyncRoute(async (req, res) => {
  const {
    match_id,
    expected_artist1_id,
    expected_artist2_id,
  } = req.body;

  if (!match_id || !expected_artist1_id || !expected_artist2_id) {
    return res.status(400).json({
      error: 'match_id, expected_artist1_id and expected_artist2_id are required.',
      code: 'REROLL_INVALID_REQUEST',
    });
  }

  const store = getStore();
  let state = await store.getTournamentState(req.params.id);
  if (!state) return res.status(404).json({ error: 'Tournament not found.' });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const match = findTournamentMatch(state, match_id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found in this tournament.' });
    }
    if (Number(match.round) !== 1) {
      return res.status(400).json({
        error: 'Unknown-pair reroll is available only in round 1.',
        code: 'REROLL_ROUND_NOT_ALLOWED',
      });
    }
    if (match.winner_id) {
      return res.status(400).json({
        error: 'A played match cannot be rerolled.',
        code: 'REROLL_MATCH_ALREADY_PLAYED',
      });
    }

    if (
      match.artist1_id !== expected_artist1_id ||
      match.artist2_id !== expected_artist2_id
    ) {
      return res.json({
        ...state,
        rerolled: false,
        reason: 'already_rerolled',
      });
    }

    const pool = buildRerollPool(await store.listArtists(), state);
    if (pool.length < 2) {
      return res.status(409).json({
        error: 'No unused replacement pair is available for this category.',
        code: 'REROLL_POOL_EXHAUSTED',
      });
    }

    const [artist1, artist2] = weightedSampleWithoutReplacement(pool, 2);

    try {
      const result = await store.rerollMatch({
        tournamentId: req.params.id,
        matchId: match_id,
        expectedArtist1Id: expected_artist1_id,
        expectedArtist2Id: expected_artist2_id,
        replacementArtist1Id: artist1.id,
        replacementArtist2Id: artist2.id,
      });

      return res.json({
        ...result.state,
        rerolled: result.applied,
        reason: result.applied ? undefined : 'already_rerolled',
      });
    } catch (error) {
      if (
        error?.status !== 409 ||
        error?.code !== 'REROLL_REPLACEMENT_CONFLICT'
      ) {
        throw error;
      }

      state = await store.getTournamentState(req.params.id);
    }
  }

  return res.status(409).json({
    error: 'Replacement artists changed concurrently. Try again.',
    code: 'REROLL_RETRY_REQUIRED',
  });
}));

router.post('/:id/match', asyncRoute(async (req, res) => {
  const { match_id, winner_id } = req.body;

  if (!match_id || !winner_id) {
    return res.status(400).json({
      error: 'match_id and winner_id are required.',
    });
  }

  const state = await getStore().recordMatch({
    tournamentId: req.params.id,
    matchId: match_id,
    winnerId: winner_id,
  });

  res.json(state);
}));

router.post('/:id/complete', asyncRoute(async (req, res) => {
  const result = await getStore().forceCompleteTournament(req.params.id);

  if (result.alreadyCompleted) {
    return res.json({
      message: 'Already completed.',
      tournament: result.tournament,
    });
  }

  res.json({ tournament: result.tournament });
}));

module.exports = router;
