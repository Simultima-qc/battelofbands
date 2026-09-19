CREATE SCHEMA IF NOT EXISTS battleofbands;

REVOKE ALL ON SCHEMA battleofbands FROM PUBLIC;

CREATE TABLE IF NOT EXISTS battleofbands.artists (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  country     text,
  language    text,
  genres      jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url   text,
  mbid        text UNIQUE,
  popularity  integer NOT NULL DEFAULT 4
);

CREATE TABLE IF NOT EXISTS battleofbands.tournaments (
  id             text PRIMARY KEY,
  user_session   text NOT NULL,
  category_type  text NOT NULL,
  category_value text NOT NULL,
  status         text NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress', 'completed')),
  created_at     timestamptz NOT NULL,
  completed_at   timestamptz,
  winner_id      text REFERENCES battleofbands.artists(id)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_session
  ON battleofbands.tournaments(user_session, created_at DESC);

CREATE TABLE IF NOT EXISTS battleofbands.tournament_matches (
  id            text PRIMARY KEY,
  tournament_id text NOT NULL
                REFERENCES battleofbands.tournaments(id) ON DELETE CASCADE,
  round         integer NOT NULL CHECK (round BETWEEN 1 AND 4),
  match_index   integer NOT NULL CHECK (match_index >= 0),
  artist1_id    text NOT NULL REFERENCES battleofbands.artists(id),
  artist2_id    text NOT NULL REFERENCES battleofbands.artists(id),
  winner_id     text REFERENCES battleofbands.artists(id),
  played_at     timestamptz,
  CONSTRAINT uq_tournament_round_match UNIQUE (tournament_id, round, match_index),
  CONSTRAINT chk_distinct_match_artists CHECK (artist1_id <> artist2_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_tournament
  ON battleofbands.tournament_matches(tournament_id, round, match_index);

CREATE TABLE IF NOT EXISTS battleofbands.rankings (
  artist_id          text PRIMARY KEY
                     REFERENCES battleofbands.artists(id) ON DELETE CASCADE,
  points             integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  wins               integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  finals             integer NOT NULL DEFAULT 0 CHECK (finals >= 0),
  semis              integer NOT NULL DEFAULT 0 CHECK (semis >= 0),
  quarters           integer NOT NULL DEFAULT 0 CHECK (quarters >= 0),
  tournaments_played integer NOT NULL DEFAULT 0 CHECK (tournaments_played >= 0)
);

ALTER TABLE battleofbands.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE battleofbands.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE battleofbands.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE battleofbands.rankings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA battleofbands FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA battleofbands FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE USAGE ON SCHEMA battleofbands FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA battleofbands FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA battleofbands FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE USAGE ON SCHEMA battleofbands FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA battleofbands FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA battleofbands FROM authenticated;
  END IF;
END
$$;
