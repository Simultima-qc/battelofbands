'use strict';

const express = require('express');
const router = express.Router();
const { getStore } = require('../db/store');
const {
  MVP_BRACKET_SIZE,
  normalizeArtistName,
  weightedSampleWithoutReplacement,
} = require('../lib/artistSelection');
const { asyncRoute } = require('../lib/http');

function filterArtists(artists, categoryType, categoryValue) {
  if (!categoryType || !categoryValue) return artists;

  const value = String(categoryValue).toLowerCase();

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

function buildEligibleValues(artists, extractValues) {
  const byValue = new Map();

  for (const artist of artists) {
    const identity = normalizeArtistName(artist.name);
    if (!identity) continue;

    for (const rawValue of extractValues(artist)) {
      if (!rawValue) continue;
      const key = String(rawValue).toLowerCase();
      if (!byValue.has(key)) {
        byValue.set(key, { label: rawValue, artists: new Set() });
      }
      byValue.get(key).artists.add(identity);
    }
  }

  const eligible = [...byValue.values()]
    .filter((entry) => entry.artists.size >= MVP_BRACKET_SIZE)
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));

  return {
    values: eligible.map((entry) => entry.label),
    counts: Object.fromEntries(
      eligible.map((entry) => [entry.label, entry.artists.size])
    ),
  };
}

router.get('/', asyncRoute(async (req, res) => {
  const artists = await getStore().listArtists();
  const { category_type, category_value } = req.query;
  const filtered = filterArtists(artists, category_type, category_value);

  if (filtered === null) {
    return res.status(400).json({
      error: `Unknown category_type: ${category_type}`,
    });
  }

  res.json({ artists: filtered, total: filtered.length });
}));

router.get('/categories', asyncRoute(async (_req, res) => {
  const artists = await getStore().listArtists();

  const genres = buildEligibleValues(artists, (artist) => artist.genres || []);
  const countries = buildEligibleValues(artists, (artist) => [artist.country]);
  const languages = buildEligibleValues(artists, (artist) => [artist.language]);

  res.json({
    categories: {
      genre: genres.values,
      country: countries.values,
      language: languages.values,
      _counts: {
        genre: genres.counts,
        country: countries.counts,
        language: languages.counts,
      },
      _minimum_required: MVP_BRACKET_SIZE,
    },
  });
}));

router.get('/random', asyncRoute(async (req, res) => {
  const artists = await getStore().listArtists();
  const { category_type, category_value } = req.query;
  const count = Math.max(2, Math.min(64, parseInt(req.query.count, 10) || 32));
  const pool = filterArtists(artists, category_type, category_value);

  if (pool === null) {
    return res.status(400).json({
      error: `Unknown category_type: ${category_type}`,
    });
  }

  if (pool.length < 2) {
    return res.status(400).json({
      error: 'Not enough artists in this category to run a tournament (minimum 2).',
      available: pool.length,
    });
  }

  const uniqueCount = new Set(
    pool.map((artist) => normalizeArtistName(artist.name))
  ).size;

  if (uniqueCount < 2) {
    return res.status(400).json({
      error: 'Not enough unique artists in this category to sample.',
      available: uniqueCount,
    });
  }

  const selected = weightedSampleWithoutReplacement(
    pool,
    Math.min(count, uniqueCount)
  );

  res.json({ artists: selected, total: selected.length });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const artists = await getStore().listArtists();
  const artist = artists.find((row) => row.id === req.params.id);

  if (!artist) return res.status(404).json({ error: 'Artist not found.' });
  res.json({ artist });
}));

module.exports = router;
