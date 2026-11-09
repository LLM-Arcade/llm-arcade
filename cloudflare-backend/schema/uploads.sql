-- D1-backed immutable files avoid activating billable object storage.
-- 400 MiB total payload allowance leaves headroom under Free's 500 MB DB cap.
CREATE TABLE storage_budget (id INTEGER PRIMARY KEY CHECK(id = 1), reserved_bytes INTEGER NOT NULL DEFAULT 0);
INSERT INTO storage_budget (id) VALUES (1);
CREATE TABLE storage_files (
  id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES "user"(id),
  content_type TEXT NOT NULL, size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 5242880),
  complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1)), created_at TEXT NOT NULL
);
CREATE INDEX storage_files_owner ON storage_files(user_id,created_at);
CREATE TABLE storage_chunks (
  file_id TEXT NOT NULL REFERENCES storage_files(id), position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 39),
  data BLOB NOT NULL CHECK(length(data) BETWEEN 1 AND 131072), PRIMARY KEY(file_id,position)
);
CREATE TABLE game_submissions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id), game_id TEXT REFERENCES games(id),
  slug TEXT NOT NULL, title TEXT NOT NULL, era TEXT NOT NULL, genre TEXT NOT NULL, description TEXT NOT NULL,
  controls TEXT NOT NULL, ai_credit TEXT NOT NULL, score_label TEXT NOT NULL, score_cap INTEGER NOT NULL,
  manifest TEXT NOT NULL CHECK(json_valid(manifest)), checklist TEXT NOT NULL CHECK(json_valid(checklist)),
  html_path TEXT NOT NULL REFERENCES storage_files(path), art_path TEXT REFERENCES storage_files(path),
  version INTEGER NOT NULL CHECK(version >= 1), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  review_note TEXT NOT NULL DEFAULT '', reviewed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX submissions_owner_pending ON game_submissions(user_id,status);
CREATE UNIQUE INDEX submissions_pending_game ON game_submissions(game_id) WHERE game_id IS NOT NULL AND status = 'pending';
CREATE UNIQUE INDEX submissions_pending_slug ON game_submissions(slug) WHERE status = 'pending';
