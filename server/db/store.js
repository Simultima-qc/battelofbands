'use strict';

const postgres = require('postgres');
const { v4: uuidv4 } = require('uuid');
const { initializeDb, getDb, closeDb } = require('./database');
const { HttpError } = require('../lib/http');
const { resolveDatabaseSsl, resolveStoreProvider, getDatabaseUrl } = require('../config');

const ROUND_POINTS = { 1: 1, 2: 2, 3: 4, 4: 8 };
const WINNER_BONUS = 16;
const SCHEMA = 'battleofbands';

function parseGenres(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeGenres(value) {
  return JSON.stringify(parseGenres(value));
}

function toIso(value) {
  if (!value) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapArtist(row) {
  if (!row) return null;
  return {
    ...row,
    genres: parseGenres(row.genres),
    popularity: Number(row.popularity ?? 4),
  };
}

function mapTournament(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_session: row.user_session,
    category_type: row.category_type,
    category_value: row.category_value,
    status: row.status,
    created_at: toIso(row.created_at),
    completed_at: toIso(row.completed_at),
    winner_id: row.winner_id,
  };
}

function buildBracketFromRows(rows) {
  const roundMap = new Map();

  for (const row of rows) {
    const round = Number(row.round);
    if (!roundMap.has(round)) roundMap.set(round, []);

    const genres1 = serializeGenres(row.artist1_genres);
    const genres2 = serializeGenres(row.artist2_genres);

    roundMap.get(round).push({
      id: row.id,
      tournament_id: row.tournament_id,
      round,
      match_index: Number(row.match_index),
      artist1_id: row.artist1_id,
      artist2_id: row.artist2_id,
      winner_id: row.winner_id,
      played_at: toIso(row.played_at),
      artist1_name: row.artist1_name,
      artist1_image: row.artist1_image,
      artist1_country: row.artist1_country,
      artist1_genres: genres1,
      artist2_name: row.artist2_name,
      artist2_image: row.artist2_image,
      artist2_country: row.artist2_country,
      artist2_genres: genres2,
      winner_name: row.winner_name,
      artist1: {
        id: row.artist1_id,
        name: row.artist1_name,
        image_url: row.artist1_image,
        country: row.artist1_country,
        genres: genres1,
      },
      artist2: {
        id: row.artist2_id,
        name: row.artist2_name,
        image_url: row.artist2_image,
        country: row.artist2_country,
        genres: genres2,
      },
    });
  }

  return [...roundMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, matches]) => matches.sort((a, b) => a.match_index - b.match_index));
}

function mapRanking(row) {
  return {
    artist_id: row.artist_id,
    points: Number(row.points || 0),
    wins: Number(row.wins || 0),
    finals: Number(row.finals || 0),
    semis: Number(row.semis || 0),
    quarters: Number(row.quarters || 0),
    tournaments_played: Number(row.tournaments_played || 0),
    name: row.name,
    country: row.country,
    language: row.language,
    genres: parseGenres(row.genres),
    image_url: row.image_url,
    mbid: row.mbid,
  };
}

class SQLiteStore {
  _db() {
    return getDb();
  }

  async listArtists() {
    return this._db()
      .prepare('SELECT * FROM artists ORDER BY name ASC')
      .all()
      .map(mapArtist);
  }

  async seedArtists(artists) {
    const db = this._db();
    const upsert = db.prepare(`
      INSERT INTO artists (id, name, country, language, genres, image_url, mbid, popularity)
      VALUES (@id, @name, @country, @language, @genres, @image_url, @mbid, @popularity)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        country = excluded.country,
        language = excluded.language,
        genres = excluded.genres,
        image_url = excluded.image_url,
        mbid = excluded.mbid,
        popularity = excluded.popularity
    `);
    const ensureRanking = db.prepare(
      'INSERT OR IGNORE INTO rankings (artist_id) VALUES (?)'
    );

    const run = db.transaction((rows) => {
      for (const artist of rows) {
        upsert.run({
          id: artist.id,
          name: artist.name,
          country: artist.country || null,
          language: artist.language || null,
          genres: JSON.stringify(artist.genres || []),
          image_url: artist.image_url || null,
          mbid: artist.mbid || null,
          popularity: artist.popularity ?? 4,
        });
        ensureRanking.run(artist.id);
      }
    });

    run(artists);
    return { total: db.prepare('SELECT COUNT(*) AS c FROM artists').get().c };
  }

  _getTournament(id) {
    return mapTournament(
      this._db().prepare('SELECT * FROM tournaments WHERE id = ?').get(id)
    );
  }

  _getActiveTournament(sessionId) {
    return mapTournament(
      this._db()
        .prepare(`
          SELECT * FROM tournaments
          WHERE user_session = ? AND status = 'in_progress'
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(sessionId)
    );
  }

  _getBracket(tournamentId) {
    const rows = this._db()
      .prepare(`
        SELECT
          tm.*,
          a1.name AS artist1_name, a1.image_url AS artist1_image,
          a1.country AS artist1_country, a1.genres AS artist1_genres,
          a2.name AS artist2_name, a2.image_url AS artist2_image,
          a2.country AS artist2_country, a2.genres AS artist2_genres,
          aw.name AS winner_name
        FROM tournament_matches tm
        JOIN artists a1 ON a1.id = tm.artist1_id
        JOIN artists a2 ON a2.id = tm.artist2_id
        LEFT JOIN artists aw ON aw.id = tm.winner_id
        WHERE tm.tournament_id = ?
        ORDER BY tm.round ASC, tm.match_index ASC
      `)
      .all(tournamentId);
    return buildBracketFromRows(rows);
  }

  _attachWinner(tournament) {
    if (!tournament?.winner_id) return tournament;
    const winner = this._db()
      .prepare('SELECT * FROM artists WHERE id = ?')
      .get(tournament.winner_id);
    return winner ? { ...tournament, winner: mapArtist(winner) } : tournament;
  }

  async getTournamentState(id) {
    const tournament = this._getTournament(id);
    if (!tournament) return null;
    return {
      tournament: this._attachWinner(tournament),
      bracket: this._getBracket(id),
    };
  }

  async getActiveTournamentState(sessionId) {
    const tournament = this._getActiveTournament(sessionId);
    if (!tournament) return { tournament: null, bracket: null };
    return {
      tournament: this._attachWinner(tournament),
      bracket: this._getBracket(tournament.id),
    };
  }

  async createTournament({ userSession, categoryType, categoryValue, artists }) {
    const db = this._db();
    const tournamentId = uuidv4();
    const createdAt = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO tournaments
          (id, user_session, category_type, category_value, status, created_at)
        VALUES (?, ?, ?, ?, 'in_progress', ?)
      `).run(tournamentId, userSession, categoryType, categoryValue, createdAt);

      const ensureRanking = db.prepare(
        'INSERT OR IGNORE INTO rankings (artist_id) VALUES (?)'
      );
      const insertMatch = db.prepare(`
        INSERT INTO tournament_matches
          (id, tournament_id, round, match_index, artist1_id, artist2_id)
        VALUES (?, ?, 1, ?, ?, ?)
      `);

      for (const artist of artists) ensureRanking.run(artist.id);
      for (let i = 0; i < artists.length; i += 2) {
        insertMatch.run(
          uuidv4(),
          tournamentId,
          i / 2,
          artists[i].id,
          artists[i + 1].id
        );
      }
    });

    tx();
    return this.getTournamentState(tournamentId);
  }

  _applyCompletedRankings(db, tournamentId, championId) {
    const participants = db.prepare(`
      SELECT artist1_id AS artist_id
      FROM tournament_matches
      WHERE tournament_id = ? AND round = 1
      UNION
      SELECT artist2_id AS artist_id
      FROM tournament_matches
      WHERE tournament_id = ? AND round = 1
    `).all(tournamentId, tournamentId);

    const completedMatches = db.prepare(`
      SELECT round, winner_id
      FROM tournament_matches
      WHERE tournament_id = ? AND winner_id IS NOT NULL
      ORDER BY round ASC, match_index ASC
    `).all(tournamentId);

    const incPlayed = db.prepare(`
      UPDATE rankings
      SET tournaments_played = tournaments_played + 1
      WHERE artist_id = ?
    `);
    const updateWinner = db.prepare(`
      UPDATE rankings
      SET
        points = points + @points,
        wins = wins + 1,
        quarters = quarters + @quarters,
        semis = semis + @semis,
        finals = finals + @finals
      WHERE artist_id = @winnerId
    `);

    for (const participant of participants) incPlayed.run(participant.artist_id);

    for (const match of completedMatches) {
      updateWinner.run({
        points: ROUND_POINTS[match.round] ?? 1,
        quarters: match.round === 2 ? 1 : 0,
        semis: match.round === 3 ? 1 : 0,
        finals: match.round === 4 ? 1 : 0,
        winnerId: match.winner_id,
      });
    }

    db.prepare(
      'UPDATE rankings SET points = points + ? WHERE artist_id = ?'
    ).run(WINNER_BONUS, championId);
  }

  async recordMatch({ tournamentId, matchId, winnerId }) {
    const db = this._db();

    const tx = db.transaction(() => {
      const tournament = db
        .prepare('SELECT * FROM tournaments WHERE id = ?')
        .get(tournamentId);
      if (!tournament) throw new HttpError(404, 'Tournament not found.');
      if (tournament.status === 'completed') {
        throw new HttpError(400, 'Tournament is already completed.');
      }

      const match = db
        .prepare(`
          SELECT * FROM tournament_matches
          WHERE id = ? AND tournament_id = ?
        `)
        .get(matchId, tournamentId);

      if (!match) throw new HttpError(404, 'Match not found in this tournament.');
      if (match.winner_id) throw new HttpError(400, 'Match result already recorded.');
      if (winnerId !== match.artist1_id && winnerId !== match.artist2_id) {
        throw new HttpError(400, 'winner_id must be one of the two match participants.');
      }

      const playedAt = new Date().toISOString();
      db.prepare(`
        UPDATE tournament_matches
        SET winner_id = ?, played_at = ?
        WHERE id = ? AND winner_id IS NULL
      `).run(winnerId, playedAt, matchId);

      const roundMatches = db
        .prepare(`
          SELECT * FROM tournament_matches
          WHERE tournament_id = ? AND round = ?
          ORDER BY match_index ASC
        `)
        .all(tournamentId, match.round);

      if (!roundMatches.every((row) => row.winner_id !== null)) return;

      const winners = roundMatches.map((row) => row.winner_id);
      if (winners.length === 1) {
        const updated = db.prepare(`
          UPDATE tournaments
          SET status = 'completed', completed_at = ?, winner_id = ?
          WHERE id = ? AND status = 'in_progress'
        `).run(playedAt, winners[0], tournamentId);

        if (updated.changes === 1) {
          this._applyCompletedRankings(db, tournamentId, winners[0]);
        }
        return;
      }

      const nextRound = match.round + 1;
      const insert = db.prepare(`
        INSERT OR IGNORE INTO tournament_matches
          (id, tournament_id, round, match_index, artist1_id, artist2_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < winners.length; i += 2) {
        insert.run(
          uuidv4(),
          tournamentId,
          nextRound,
          i / 2,
          winners[i],
          winners[i + 1]
        );
      }
    });

    tx();
    return this.getTournamentState(tournamentId);
  }

  async forceCompleteTournament(tournamentId) {
    const db = this._db();
    let alreadyCompleted = false;

    const tx = db.transaction(() => {
      const tournament = db
        .prepare('SELECT * FROM tournaments WHERE id = ?')
        .get(tournamentId);

      if (!tournament) throw new HttpError(404, 'Tournament not found.');
      if (tournament.status === 'completed') {
        alreadyCompleted = true;
        return;
      }

      const pending = db
        .prepare(`
          SELECT COUNT(*) AS c
          FROM tournament_matches
          WHERE tournament_id = ? AND winner_id IS NULL
        `)
        .get(tournamentId).c;

      if (pending > 0) {
        throw new HttpError(
          400,
          `There are still ${pending} unplayed match(es). Complete all matches first.`
        );
      }

      const lastWinner = db
        .prepare(`
          SELECT winner_id
          FROM tournament_matches
          WHERE tournament_id = ? AND winner_id IS NOT NULL
          ORDER BY round DESC, match_index ASC
          LIMIT 1
        `)
        .get(tournamentId);

      if (!lastWinner) {
        throw new HttpError(400, 'No matches have been played yet.');
      }

      const now = new Date().toISOString();
      const updated = db.prepare(`
        UPDATE tournaments
        SET status = 'completed', completed_at = ?, winner_id = ?
        WHERE id = ? AND status = 'in_progress'
      `).run(now, lastWinner.winner_id, tournamentId);

      if (updated.changes === 1) {
        this._applyCompletedRankings(db, tournamentId, lastWinner.winner_id);
      }
    });

    tx();
    const state = await this.getTournamentState(tournamentId);
    return { ...state, alreadyCompleted };
  }

  async listRankingRows() {
    return this._db()
      .prepare(`
        SELECT
          r.*,
          a.name,
          a.country,
          a.language,
          a.genres,
          a.image_url,
          a.mbid
        FROM rankings r
        JOIN artists a ON a.id = r.artist_id
      `)
      .all()
      .map(mapRanking);
  }
}

class PostgresStore {
  constructor({
    connectionString = getDatabaseUrl(),
    ssl = resolveDatabaseSsl(),
    clientFactory = postgres,
    ping = null,
    livenessTimeoutMs = 1500,
  } = {}) {
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for the Postgres store.');
    }
    this.connectionString = connectionString;
    this.ssl = ssl;
    this.clientFactory = clientFactory;
    this.ping = ping;
    this.livenessTimeoutMs = livenessTimeoutMs;
    this.reconnectPromise = null;
    this.sql = this._createClient();
  }

  _createClient() {
    return this.clientFactory(this.connectionString, {
      max: 1,
      prepare: false,
      ssl: this.ssl,
      connect_timeout: 5,
      idle_timeout: 20,
      max_lifetime: 60 * 10,
    });
  }

  async _defaultPing(client) {
    await client`SELECT 1 AS ok`;
  }

  async _pingWithTimeout(client) {
    let timer;
    try {
      await Promise.race([
        this.ping ? this.ping(client) : this._defaultPing(client),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Postgres liveness check timed out.')),
            this.livenessTimeoutMs
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async _recycleClient(staleClient, firstError) {
    // Another request may already have replaced the client while this caller
    // was waiting for its liveness check to fail.
    if (this.sql !== staleClient) {
      await this._pingWithTimeout(this.sql);
      return;
    }

    try {
      await staleClient.end({ timeout: 0 });
    } catch {
      // Recycling is best-effort; the replacement connection is authoritative.
    }

    // Re-check after close: a concurrent recovery may have completed while the
    // stale client was shutting down.
    if (this.sql !== staleClient) {
      await this._pingWithTimeout(this.sql);
      return;
    }

    const replacement = this._createClient();
    this.sql = replacement;

    try {
      await this._pingWithTimeout(replacement);
    } catch (secondError) {
      const error = new Error('Postgres connection is unavailable.');
      error.cause = secondError;
      error.firstFailure = firstError;
      throw error;
    }
  }

  async ensureAlive() {
    const client = this.sql;

    try {
      await this._pingWithTimeout(client);
      return;
    } catch (firstError) {
      // If another request already recovered the store, validate the current
      // client rather than recycling the replacement it installed.
      if (this.sql !== client) {
        await this._pingWithTimeout(this.sql);
        return;
      }

      if (!this.reconnectPromise) {
        let recoveryPromise;
        recoveryPromise = this._recycleClient(client, firstError).finally(() => {
          if (this.reconnectPromise === recoveryPromise) {
            this.reconnectPromise = null;
          }
        });
        this.reconnectPromise = recoveryPromise;
      }

      return this.reconnectPromise;
    }
  }

  async close() {
    if (this.sql) {
      await this.sql.end({ timeout: 2 });
    }
  }

  async listArtists() {
    await this.ensureAlive();
    const rows = await this.sql`
      SELECT id, name, country, language, genres, image_url, mbid, popularity
      FROM battleofbands.artists
      ORDER BY name ASC
    `;
    return rows.map(mapArtist);
  }

  async seedArtists(artists) {
    await this.ensureAlive();
    await this.sql.begin(async (tx) => {
      for (const artist of artists) {
        await tx`
          INSERT INTO battleofbands.artists
            (id, name, country, language, genres, image_url, mbid, popularity)
          VALUES (
            ${artist.id},
            ${artist.name},
            ${artist.country || null},
            ${artist.language || null},
            ${JSON.stringify(artist.genres || [])}::jsonb,
            ${artist.image_url || null},
            ${artist.mbid || null},
            ${artist.popularity ?? 4}
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            country = EXCLUDED.country,
            language = EXCLUDED.language,
            genres = EXCLUDED.genres,
            image_url = EXCLUDED.image_url,
            mbid = EXCLUDED.mbid,
            popularity = EXCLUDED.popularity
        `;
        await tx`
          INSERT INTO battleofbands.rankings (artist_id)
          VALUES (${artist.id})
          ON CONFLICT (artist_id) DO NOTHING
        `;
      }
    });

    const [row] = await this.sql`
      SELECT COUNT(*)::int AS c FROM battleofbands.artists
    `;
    return { total: Number(row.c) };
  }

  async _getTournamentWith(client, id, { lock = false } = {}) {
    const rows = lock
      ? await client`
          SELECT id, user_session, category_type, category_value, status,
                 created_at, completed_at, winner_id
          FROM battleofbands.tournaments
          WHERE id = ${id}
          FOR UPDATE
        `
      : await client`
          SELECT id, user_session, category_type, category_value, status,
                 created_at, completed_at, winner_id
          FROM battleofbands.tournaments
          WHERE id = ${id}
        `;
    return mapTournament(rows[0]);
  }

  async _getActiveTournamentWith(client, sessionId) {
    const rows = await client`
      SELECT id, user_session, category_type, category_value, status,
             created_at, completed_at, winner_id
      FROM battleofbands.tournaments
      WHERE user_session = ${sessionId} AND status = 'in_progress'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return mapTournament(rows[0]);
  }

  async _getBracketWith(client, tournamentId) {
    const rows = await client`
      SELECT
        tm.id,
        tm.tournament_id,
        tm.round,
        tm.match_index,
        tm.artist1_id,
        tm.artist2_id,
        tm.winner_id,
        tm.played_at,
        a1.name AS artist1_name,
        a1.image_url AS artist1_image,
        a1.country AS artist1_country,
        a1.genres AS artist1_genres,
        a2.name AS artist2_name,
        a2.image_url AS artist2_image,
        a2.country AS artist2_country,
        a2.genres AS artist2_genres,
        aw.name AS winner_name
      FROM battleofbands.tournament_matches tm
      JOIN battleofbands.artists a1 ON a1.id = tm.artist1_id
      JOIN battleofbands.artists a2 ON a2.id = tm.artist2_id
      LEFT JOIN battleofbands.artists aw ON aw.id = tm.winner_id
      WHERE tm.tournament_id = ${tournamentId}
      ORDER BY tm.round ASC, tm.match_index ASC
    `;
    return buildBracketFromRows(rows);
  }

  async _attachWinnerWith(client, tournament) {
    if (!tournament?.winner_id) return tournament;
    const rows = await client`
      SELECT id, name, country, language, genres, image_url, mbid, popularity
      FROM battleofbands.artists
      WHERE id = ${tournament.winner_id}
    `;
    return rows[0]
      ? { ...tournament, winner: mapArtist(rows[0]) }
      : tournament;
  }

  async getTournamentState(id) {
    await this.ensureAlive();
    const tournament = await this._getTournamentWith(this.sql, id);
    if (!tournament) return null;
    return {
      tournament: await this._attachWinnerWith(this.sql, tournament),
      bracket: await this._getBracketWith(this.sql, id),
    };
  }

  async getActiveTournamentState(sessionId) {
    await this.ensureAlive();
    const tournament = await this._getActiveTournamentWith(this.sql, sessionId);
    if (!tournament) return { tournament: null, bracket: null };
    return {
      tournament: await this._attachWinnerWith(this.sql, tournament),
      bracket: await this._getBracketWith(this.sql, tournament.id),
    };
  }

  async createTournament({ userSession, categoryType, categoryValue, artists }) {
    await this.ensureAlive();
    const tournamentId = uuidv4();
    const createdAt = new Date();

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO battleofbands.tournaments
          (id, user_session, category_type, category_value, status, created_at)
        VALUES (
          ${tournamentId},
          ${userSession},
          ${categoryType},
          ${categoryValue},
          'in_progress',
          ${createdAt}
        )
      `;

      for (const artist of artists) {
        await tx`
          INSERT INTO battleofbands.rankings (artist_id)
          VALUES (${artist.id})
          ON CONFLICT (artist_id) DO NOTHING
        `;
      }

      for (let i = 0; i < artists.length; i += 2) {
        await tx`
          INSERT INTO battleofbands.tournament_matches
            (id, tournament_id, round, match_index, artist1_id, artist2_id)
          VALUES (
            ${uuidv4()},
            ${tournamentId},
            1,
            ${i / 2},
            ${artists[i].id},
            ${artists[i + 1].id}
          )
        `;
      }
    });

    return this.getTournamentState(tournamentId);
  }

  async _applyCompletedRankings(tx, tournamentId, championId) {
    const participants = await tx`
      SELECT artist1_id AS artist_id
      FROM battleofbands.tournament_matches
      WHERE tournament_id = ${tournamentId} AND round = 1
      UNION
      SELECT artist2_id AS artist_id
      FROM battleofbands.tournament_matches
      WHERE tournament_id = ${tournamentId} AND round = 1
    `;

    const matches = await tx`
      SELECT round, winner_id
      FROM battleofbands.tournament_matches
      WHERE tournament_id = ${tournamentId} AND winner_id IS NOT NULL
      ORDER BY round ASC, match_index ASC
    `;

    for (const participant of participants) {
      await tx`
        UPDATE battleofbands.rankings
        SET tournaments_played = tournaments_played + 1
        WHERE artist_id = ${participant.artist_id}
      `;
    }

    for (const match of matches) {
      const round = Number(match.round);
      const points = ROUND_POINTS[round] ?? 1;
      await tx`
        UPDATE battleofbands.rankings
        SET
          points = points + ${points},
          wins = wins + 1,
          quarters = quarters + ${round === 2 ? 1 : 0},
          semis = semis + ${round === 3 ? 1 : 0},
          finals = finals + ${round === 4 ? 1 : 0}
        WHERE artist_id = ${match.winner_id}
      `;
    }

    await tx`
      UPDATE battleofbands.rankings
      SET points = points + ${WINNER_BONUS}
      WHERE artist_id = ${championId}
    `;
  }

  async recordMatch({ tournamentId, matchId, winnerId }) {
    await this.ensureAlive();

    await this.sql.begin(async (tx) => {
      const tournament = await this._getTournamentWith(tx, tournamentId, { lock: true });
      if (!tournament) throw new HttpError(404, 'Tournament not found.');
      if (tournament.status === 'completed') {
        throw new HttpError(400, 'Tournament is already completed.');
      }

      const matches = await tx`
        SELECT id, tournament_id, round, match_index, artist1_id, artist2_id,
               winner_id, played_at
        FROM battleofbands.tournament_matches
        WHERE id = ${matchId} AND tournament_id = ${tournamentId}
        FOR UPDATE
      `;
      const match = matches[0];

      if (!match) throw new HttpError(404, 'Match not found in this tournament.');
      if (match.winner_id) throw new HttpError(400, 'Match result already recorded.');
      if (winnerId !== match.artist1_id && winnerId !== match.artist2_id) {
        throw new HttpError(400, 'winner_id must be one of the two match participants.');
      }

      const playedAt = new Date();
      const updated = await tx`
        UPDATE battleofbands.tournament_matches
        SET winner_id = ${winnerId}, played_at = ${playedAt}
        WHERE id = ${matchId}
          AND tournament_id = ${tournamentId}
          AND winner_id IS NULL
        RETURNING id
      `;

      if (updated.length !== 1) {
        throw new HttpError(400, 'Match result already recorded.');
      }

      const roundMatches = await tx`
        SELECT id, round, match_index, winner_id
        FROM battleofbands.tournament_matches
        WHERE tournament_id = ${tournamentId}
          AND round = ${Number(match.round)}
        ORDER BY match_index ASC
      `;

      if (!roundMatches.every((row) => row.winner_id !== null)) return;

      const winners = roundMatches.map((row) => row.winner_id);
      if (winners.length === 1) {
        const completed = await tx`
          UPDATE battleofbands.tournaments
          SET status = 'completed',
              completed_at = ${playedAt},
              winner_id = ${winners[0]}
          WHERE id = ${tournamentId}
            AND status = 'in_progress'
          RETURNING id
        `;

        if (completed.length === 1) {
          await this._applyCompletedRankings(tx, tournamentId, winners[0]);
        }
        return;
      }

      const nextRound = Number(match.round) + 1;
      for (let i = 0; i < winners.length; i += 2) {
        await tx`
          INSERT INTO battleofbands.tournament_matches
            (id, tournament_id, round, match_index, artist1_id, artist2_id)
          VALUES (
            ${uuidv4()},
            ${tournamentId},
            ${nextRound},
            ${i / 2},
            ${winners[i]},
            ${winners[i + 1]}
          )
          ON CONFLICT (tournament_id, round, match_index) DO NOTHING
        `;
      }
    });

    return this.getTournamentState(tournamentId);
  }

  async forceCompleteTournament(tournamentId) {
    await this.ensureAlive();
    let alreadyCompleted = false;

    await this.sql.begin(async (tx) => {
      const tournament = await this._getTournamentWith(tx, tournamentId, { lock: true });
      if (!tournament) throw new HttpError(404, 'Tournament not found.');
      if (tournament.status === 'completed') {
        alreadyCompleted = true;
        return;
      }

      const [pendingRow] = await tx`
        SELECT COUNT(*)::int AS c
        FROM battleofbands.tournament_matches
        WHERE tournament_id = ${tournamentId}
          AND winner_id IS NULL
      `;
      const pending = Number(pendingRow.c);

      if (pending > 0) {
        throw new HttpError(
          400,
          `There are still ${pending} unplayed match(es). Complete all matches first.`
        );
      }

      const lastRows = await tx`
        SELECT winner_id
        FROM battleofbands.tournament_matches
        WHERE tournament_id = ${tournamentId}
          AND winner_id IS NOT NULL
        ORDER BY round DESC, match_index ASC
        LIMIT 1
      `;
      const lastWinner = lastRows[0];

      if (!lastWinner) throw new HttpError(400, 'No matches have been played yet.');

      const completedAt = new Date();
      const completed = await tx`
        UPDATE battleofbands.tournaments
        SET status = 'completed',
            completed_at = ${completedAt},
            winner_id = ${lastWinner.winner_id}
        WHERE id = ${tournamentId}
          AND status = 'in_progress'
        RETURNING id
      `;

      if (completed.length === 1) {
        await this._applyCompletedRankings(tx, tournamentId, lastWinner.winner_id);
      } else {
        alreadyCompleted = true;
      }
    });

    const state = await this.getTournamentState(tournamentId);
    return { ...state, alreadyCompleted };
  }

  async listRankingRows() {
    await this.ensureAlive();
    const rows = await this.sql`
      SELECT
        r.artist_id,
        r.points,
        r.wins,
        r.finals,
        r.semis,
        r.quarters,
        r.tournaments_played,
        a.name,
        a.country,
        a.language,
        a.genres,
        a.image_url,
        a.mbid
      FROM battleofbands.rankings r
      JOIN battleofbands.artists a ON a.id = r.artist_id
    `;
    return rows.map(mapRanking);
  }
}

const sqliteStore = new SQLiteStore();
let activeStore = null;

async function initializeStore({
  provider,
  connectionString,
  sqlitePath,
  ssl,
  clientFactory,
  ping,
} = {}) {
  const selected = resolveStoreProvider({ provider, connectionString });

  if (activeStore?.close) {
    await activeStore.close();
  }
  activeStore = null;

  if (selected === 'postgres') {
    activeStore = new PostgresStore({
      connectionString: connectionString || getDatabaseUrl(),
      ssl,
      clientFactory,
      ping,
    });
    await activeStore.ensureAlive();
    return activeStore;
  }

  initializeDb(sqlitePath);
  activeStore = sqliteStore;
  return activeStore;
}

function getStore() {
  return activeStore || sqliteStore;
}

async function closeStore() {
  const current = activeStore;
  activeStore = null;

  if (current instanceof PostgresStore) {
    await current.close();
    return;
  }

  closeDb();
}

module.exports = {
  ROUND_POINTS,
  WINNER_BONUS,
  SQLiteStore,
  PostgresStore,
  initializeStore,
  getStore,
  closeStore,
  parseGenres,
  mapArtist,
  mapTournament,
};
