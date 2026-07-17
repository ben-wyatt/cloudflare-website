CREATE TABLE IF NOT EXISTS record_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS record_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES record_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS record_sessions_user_idx
  ON record_sessions(user_id);

CREATE INDEX IF NOT EXISTS record_sessions_expiry_idx
  ON record_sessions(expires_at);

CREATE TABLE IF NOT EXISTS record_albums (
  spotify_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  image_url TEXT,
  spotify_url TEXT NOT NULL,
  release_date TEXT,
  total_tracks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS record_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
  spotify_album_id TEXT NOT NULL,
  review TEXT NOT NULL DEFAULT '' CHECK (length(review) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES record_users(id) ON DELETE CASCADE,
  FOREIGN KEY (spotify_album_id) REFERENCES record_albums(spotify_id),
  UNIQUE (user_id, season, rank),
  UNIQUE (user_id, season, spotify_album_id)
);

CREATE INDEX IF NOT EXISTS record_list_items_user_season_idx
  ON record_list_items(user_id, season);
