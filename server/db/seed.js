'use strict';

/**
 * Seed script — populates the artists table from data/artists.json
 * Run with: npm run seed
 */

const path = require('path');
const { initializeDb, getDb, closeDb } = require('./database');

const ARTISTS = require(path.join(__dirname, '../data/artists.json'));

function seed() {
  initializeDb();
  const db = getDb();

  const insertArtist = db.prepare(`
    INSERT INTO artists (id, name, country, language, genres, image_url, mbid, popularity)
    VALUES (@id, @name, @country, @language, @genres, @image_url, @mbid, @popularity)
    ON CONFLICT(id) DO UPDATE SET popularity = excluded.popularity
  `);

  const insertRanking = db.prepare(`
    INSERT OR IGNORE INTO rankings (artist_id) VALUES (?)
  `);

  const seedMany = db.transaction((artists) => {
    let inserted = 0;
    for (const artist of artists) {
      const result = insertArtist.run({
        id:         artist.id,
        name:       artist.name,
        country:    artist.country    || null,
        language:   artist.language   || null,
        genres:     JSON.stringify(artist.genres || []),
        image_url:  artist.image_url  || null,
        mbid:       artist.mbid       || null,
        popularity: artist.popularity ?? 4,
      });
      if (result.changes > 0) {
        insertRanking.run(artist.id);
        inserted++;
      }
    }
    return inserted;
  });

  const count = seedMany(ARTISTS);
  console.log(`[Seed] Inserted ${count} new artist(s). Total in DB: ${db.prepare('SELECT COUNT(*) as c FROM artists').get().c}`);

  closeDb();
}

seed();
