'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { MVP_BRACKET_SIZE, normalizeArtistName } = require('../lib/artistSelection');

/**
 * Parse the genres JSON string stored in the DB into an array.
 * Attaches the parsed value back to the artist object.
 */
function parseArtist(artist) {
  if (!artist) return null;
  try {
    artist.genres = JSON.parse(artist.genres);
  } catch {
    artist.genres = [];
  }
  return artist;
}

function parseArtists(rows) {
  return rows.map(parseArtist);
}

// ---------------------------------------------------------------------------
// GET /api/artists
// Optional query params: ?category_type=genre&category_value=rock
//                        ?category_type=country&category_value=US
//                        ?category_type=language&category_value=Spanish
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const db = getDb();
  const { category_type, category_value } = req.query;

  let rows;

  if (category_type && category_value) {
    const val = category_value.toLowerCase();

    if (category_type === 'genre') {
      // genres is stored as a JSON array string — use LIKE for a simple match
      rows = db
        .prepare(`SELECT * FROM artists WHERE LOWER(genres) LIKE ? ORDER BY name ASC`)
        .all(`%"${val}"%`);
    } else if (category_type === 'country') {
      rows = db
        .prepare(`SELECT * FROM artists WHERE LOWER(country) = ? ORDER BY name ASC`)
        .all(val);
    } else if (category_type === 'language') {
      rows = db
        .prepare(`SELECT * FROM artists WHERE LOWER(language) = ? ORDER BY name ASC`)
        .all(val);
    } else {
      return res.status(400).json({ error: `Unknown category_type: ${category_type}` });
    }
  } else {
    rows = db.prepare(`SELECT * FROM artists ORDER BY name ASC`).all();
  }

  res.json({ artists: parseArtists(rows), total: rows.length });
});

// ---------------------------------------------------------------------------
// GET /api/artists/categories
// Returns all unique genres, countries, and languages available in the DB.
// ---------------------------------------------------------------------------
router.get('/categories', (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(`SELECT name, country, language, genres FROM artists`)
    .all();

  function buildEligibleValues(extractValues) {
    const byValue = new Map();

    for (const artist of rows) {
      const identity = normalizeArtistName(artist.name);
      if (!identity) continue;

      for (const value of extractValues(artist)) {
        if (!value) continue;
        const key = String(value).toLowerCase();
        if (!byValue.has(key)) {
          byValue.set(key, { label: value, artists: new Set() });
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

  const genres = buildEligibleValues((artist) => {
    try {
      const parsed = JSON.parse(artist.genres);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const countries = buildEligibleValues((artist) => [artist.country]);
  const languages = buildEligibleValues((artist) => [artist.language]);

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
});

// ---------------------------------------------------------------------------
// GET /api/artists/random
// Query params: category_type, category_value, count (default 32)
// Returns N randomly selected artists from the specified category.
// ---------------------------------------------------------------------------
router.get('/random', (req, res) => {
  const db = getDb();
  const { category_type, category_value } = req.query;
  const count = Math.max(2, Math.min(64, parseInt(req.query.count, 10) || 32));

  let pool;

  if (category_type && category_value) {
    const val = category_value.toLowerCase();

    if (category_type === 'genre') {
      pool = db
        .prepare(`SELECT * FROM artists WHERE LOWER(genres) LIKE ?`)
        .all(`%"${val}"%`);
    } else if (category_type === 'country') {
      pool = db
        .prepare(`SELECT * FROM artists WHERE LOWER(country) = ?`)
        .all(val);
    } else if (category_type === 'language') {
      pool = db
        .prepare(`SELECT * FROM artists WHERE LOWER(language) = ?`)
        .all(val);
    } else {
      return res.status(400).json({ error: `Unknown category_type: ${category_type}` });
    }
  } else {
    pool = db.prepare(`SELECT * FROM artists`).all();
  }

  if (pool.length < 2) {
    return res.status(400).json({
      error: 'Not enough artists in this category to run a tournament (minimum 2).',
      available: pool.length,
    });
  }

  // Weighted random sampling without replacement (Efraimidis-Spirakis algorithm).
  // Each artist gets key = random^(1/popularity) — higher popularity → higher key on average.
  for (const a of pool) {
    const w = a.popularity || 4;
    a._key = Math.pow(Math.random(), 1 / w);
  }
  pool.sort((a, b) => b._key - a._key);

  const selected = pool.slice(0, Math.min(count, pool.length));
  res.json({ artists: parseArtists(selected), total: selected.length });
});

// ---------------------------------------------------------------------------
// GET /api/artists/:id
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const db = getDb();
  const artist = db.prepare(`SELECT * FROM artists WHERE id = ?`).get(req.params.id);
  if (!artist) return res.status(404).json({ error: 'Artist not found.' });
  res.json({ artist: parseArtist(artist) });
});

module.exports = router;
