'use strict';

const express = require('express');
const router = express.Router();
const { getStore } = require('../db/store');
const { asyncRoute } = require('../lib/http');

const ALLOWED_SORT = new Set([
  'avg',
  'points',
  'wins',
  'finals',
  'semis',
  'quarters',
  'tournaments_played',
]);

function withAverage(row) {
  return {
    ...row,
    avg: row.tournaments_played > 0
      ? Math.round((row.points / row.tournaments_played) * 100) / 100
      : null,
  };
}

router.get('/', asyncRoute(async (req, res) => {
  const sort = ALLOWED_SORT.has(req.query.sort) ? req.query.sort : 'avg';
  const order = String(req.query.order || 'desc').toLowerCase() === 'asc'
    ? 'asc'
    : 'desc';

  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * limit;

  const allRows = (await getStore().listRankingRows())
    .filter((row) => row.tournaments_played > 0)
    .map(withAverage);

  allRows.sort((a, b) => {
    const left = Number(a[sort] ?? 0);
    const right = Number(b[sort] ?? 0);
    const delta = order === 'asc' ? left - right : right - left;
    return delta || String(a.name).localeCompare(String(b.name));
  });

  const rankings = allRows.slice(offset, offset + limit);
  const total = allRows.length;

  res.json({
    rankings,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  });
}));

router.get('/leaderboard', asyncRoute(async (_req, res) => {
  const leaderboard = (await getStore().listRankingRows())
    .filter((row) => row.tournaments_played > 0)
    .sort((a, b) =>
      (b.points - a.points)
      || (b.wins - a.wins)
      || String(a.name).localeCompare(String(b.name))
    )
    .slice(0, 10);

  res.json({ leaderboard });
}));

router.get('/:artistId', asyncRoute(async (req, res) => {
  const rows = await getStore().listRankingRows();
  const row = rows.find((item) => item.artist_id === req.params.artistId);

  if (!row) {
    return res.status(404).json({ error: 'Artist ranking not found.' });
  }

  const globalRank = rows.filter((item) => item.points > row.points).length + 1;

  res.json({
    ranking: row,
    global_rank: globalRank,
  });
}));

module.exports = router;
