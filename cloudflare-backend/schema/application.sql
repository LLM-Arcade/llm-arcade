-- Proposed application schema for a NEW, isolated Arcade D1 database only.
-- This is not a recovered Supabase schema or a production migration.
-- Apply auth.sql first. Preserve exported UUIDs as TEXT.
CREATE TABLE games (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  era TEXT NOT NULL,
  genre TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  controls TEXT NOT NULL DEFAULT '',
  ai_credit TEXT NOT NULL DEFAULT 'AI agents',
  track TEXT NOT NULL CHECK (track IN ('A', 'B')),
  status TEXT NOT NULL CHECK (status IN ('published', 'coming_soon', 'archived')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  play_count INTEGER NOT NULL DEFAULT 0 CHECK (play_count >= 0),
  score_label TEXT NOT NULL DEFAULT 'Score',
  score_cap INTEGER NOT NULL CHECK (score_cap > 0),
  html_path TEXT,
  art_url TEXT,
  created_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  data_origin TEXT NOT NULL CHECK (data_origin IN ('reconstructed', 'recovered', 'new'))
);
CREATE TABLE scores (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  stats TEXT CHECK (stats IS NULL OR json_valid(stats)),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, run_id)
);
CREATE INDEX scores_game_player_best ON scores(game_id, user_id, score DESC, created_at);
CREATE INDEX scores_player_game_recent ON scores(user_id, game_id, created_at DESC);
