'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'battleofbands.db');

let db;

function getDb() {
  if (!db) {
    throw new Error('Database has not been initialized. Call initializeDb() first.');
  }
  return db;
}

function initializeDb() {
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      country     TEXT,
      language    TEXT,
      genres      TEXT NOT NULL DEFAULT '[]',
      image_url   TEXT,
      mbid        TEXT UNIQUE,
      popularity  INTEGER NOT NULL DEFAULT 4
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id             TEXT PRIMARY KEY,
      user_session   TEXT NOT NULL,
      category_type  TEXT NOT NULL,
      category_value TEXT NOT NULL,
      status         TEXT NOT NULL CHECK(status IN ('in_progress', 'completed')) DEFAULT 'in_progress',
      created_at     TEXT NOT NULL,
      completed_at   TEXT,
      winner_id      TEXT REFERENCES artists(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tournaments_session
      ON tournaments(user_session);

    CREATE TABLE IF NOT EXISTS tournament_matches (
      id            TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round         INTEGER NOT NULL,
      match_index   INTEGER NOT NULL,
      artist1_id    TEXT NOT NULL REFERENCES artists(id),
      artist2_id    TEXT NOT NULL REFERENCES artists(id),
      winner_id     TEXT REFERENCES artists(id),
      played_at     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_matches_tournament
      ON tournament_matches(tournament_id, round);

    CREATE TABLE IF NOT EXISTS rankings (
      artist_id           TEXT PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
      points              INTEGER NOT NULL DEFAULT 0,
      wins                INTEGER NOT NULL DEFAULT 0,
      finals              INTEGER NOT NULL DEFAULT 0,
      semis               INTEGER NOT NULL DEFAULT 0,
      quarters            INTEGER NOT NULL DEFAULT 0,
      tournaments_played  INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Migration: add popularity column if it doesn't exist yet
  try { db.exec(`ALTER TABLE artists ADD COLUMN popularity INTEGER NOT NULL DEFAULT 4`); } catch {}

  console.log(`[DB] Initialized — ${DB_PATH}`);
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initializeDb, getDb, closeDb };
