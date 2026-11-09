-- Reconstructed application schema for a new empty Arcade database only.
-- No historical settings, player activity or uploaded files are recovered here.
CREATE VIEW profiles AS SELECT id, username, username AS display_name,
  image AS avatar_url, bio, role, xp, level, streak_days, best_streak,
  last_play_date, createdAt AS created_at FROM "user";
CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), launched INTEGER NOT NULL DEFAULT 0,
  spotlight_game_id TEXT REFERENCES games(id), slow_mode_seconds INTEGER NOT NULL DEFAULT 10 CHECK (slow_mode_seconds BETWEEN 0 AND 3600)
);
INSERT INTO site_settings (id) VALUES (1);
CREATE TABLE ratings (
  user_id TEXT NOT NULL REFERENCES "user"(id), game_id TEXT NOT NULL REFERENCES games(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, game_id)
);
CREATE INDEX ratings_game ON ratings(game_id);
CREATE TABLE favorites (
  user_id TEXT NOT NULL REFERENCES "user"(id), game_id TEXT NOT NULL REFERENCES games(id),
  created_at TEXT NOT NULL, PRIMARY KEY (user_id, game_id)
);
CREATE INDEX favorites_game ON favorites(game_id);
CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES "user"(id), followee_id TEXT NOT NULL REFERENCES "user"(id),
  created_at TEXT NOT NULL, CHECK (follower_id <> followee_id), PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX follows_followee ON follows(followee_id);
CREATE TABLE comments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id), game_id TEXT NOT NULL REFERENCES games(id),
  parent_id TEXT REFERENCES comments(id), body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX comments_game ON comments(game_id, created_at);
CREATE INDEX comments_player_recent ON comments(user_id, created_at);
CREATE TABLE waitlist (email TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE playtest_applications (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, devices TEXT NOT NULL CHECK (json_valid(devices)),
  hours_per_week TEXT, favorite_eras TEXT NOT NULL CHECK (json_valid(favorite_eras)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')), created_at TEXT NOT NULL
);
