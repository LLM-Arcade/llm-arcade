-- New Arcade-only schema: guest session digests and Clerk subject IDs.
-- Contains no recovered accounts, passwords or provider tokens.
CREATE TABLE "user" (
  id TEXT PRIMARY KEY NOT NULL, clerk_id TEXT UNIQUE, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  email TEXT UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0 CHECK (emailVerified IN (0, 1)),
  image TEXT, bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'playtester', 'moderator', 'admin')),
  xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0,
  last_play_date TEXT, createdAt TEXT NOT NULL
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_rate_limits (identity TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (identity, bucket));
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(bucket);
