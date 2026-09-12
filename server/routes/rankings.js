'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// ---------------------------------------------------------------------------
// GET /api/rankings
// Query params:
//   page      — 1-based page number (default 1)
//   limit     — results per page (default 20, max 100)
//   sort      — column to sort by: points | wins | finals | semis | quarters | tournaments_played (default: points)
//   order     — asc | desc (default: desc)
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const db = getDb();

  const ALLOWED_SORT = new Set(['avg', 'points', 'wins', 'finals', 'semis', 'quarters', 'tournaments_played']);
  const ALLOWED_ORDER = new Set(['asc', 'desc']);

  const sort  = ALLOWED_SORT.has(req.query.sort) ? req.query.sort : 'avg';
  const order = ALLOWED_ORDER.has(req.query.order?.toLowerCase())
    ? req.query.order.toLowerCase()
    : 'desc';

  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * limit;

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM rankings WHERE tournaments_played > 0`)
    .get().c;

  const sortExpr = sort === 'avg'
    ? `CAST(r.points AS REAL) / r.tournaments_played`
    : `r.${sort}`;

  const rows = db
    .prepare(
      `SELECT
         r.*,
         a.name,
         a.country,
         a.language,
         a.genres,
         a.image_url,
         a.mbid,
         ROUND(CAST(r.points AS REAL) / r.tournaments_played, 2) AS avg
       FROM rankings r
       JOIN artists a ON a.id = r.artist_id
       WHERE r.tournaments_played > 0
       ORDER BY ${sortExpr} ${order.toUpperCase()}, a.name ASC
       LIMIT @limit OFFSET @offset`
    )
    .all({ limit, offset });

  // Parse genres for each row
  const rankings = rows.map((row) => {
    try { row.genres = JSON.parse(row.genres); } catch { row.genres = []; }
    return row;
  });

  res.json({
    rankings,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/rankings/leaderboard
// Shortcut — top 10 by points, no pagination needed.
// ---------------------------------------------------------------------------
router.get('/leaderboard', (req, res) => {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT
         r.*,
         a.name,
         a.country,
         a.language,
         a.genres,
         a.image_url,
         a.mbid
       FROM rankings r
       JOIN artists a ON a.id = r.artist_id
       WHERE r.tournaments_played > 0
       ORDER BY r.points DESC, r.wins DESC, a.name ASC
       LIMIT 10`
    )
    .all();

  const leaderboard = rows.map((row) => {
    try { row.genres = JSON.parse(row.genres); } catch { row.genres = []; }
    return row;
  });

  res.json({ leaderboard });
});

// ---------------------------------------------------------------------------
// GET /api/rankings/:artistId
// Single artist statistics.
// ---------------------------------------------------------------------------
router.get('/:artistId', (req, res) => {
  const db = getDb();

  const row = db
    .prepare(
      `SELECT
         r.*,
         a.name,
         a.country,
         a.language,
         a.genres,
         a.image_url,
         a.mbid
       FROM rankings r
       JOIN artists a ON a.id = r.artist_id
       WHERE r.artist_id = ?`
    )
    .get(req.params.artistId);

  if (!row) return res.status(404).json({ error: 'Artist ranking not found.' });

  try { row.genres = JSON.parse(row.genres); } catch { row.genres = []; }

  // Compute global rank
  const rankResult = db
    .prepare(
      `SELECT COUNT(*) + 1 AS rank
       FROM rankings
       WHERE points > (SELECT points FROM rankings WHERE artist_id = ?)`
    )
    .get(req.params.artistId);

  res.json({ ranking: row, global_rank: rankResult?.rank ?? null });
});

module.exports = router;
