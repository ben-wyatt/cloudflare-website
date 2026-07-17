CREATE TABLE IF NOT EXISTS record_tracks (
  spotify_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album_name TEXT NOT NULL,
  album_spotify_id TEXT,
  image_url TEXT,
  spotify_url TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  explicit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS record_standout_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  spotify_track_id TEXT NOT NULL,
  review TEXT NOT NULL DEFAULT '' CHECK (length(review) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES record_users(id) ON DELETE CASCADE,
  FOREIGN KEY (spotify_track_id) REFERENCES record_tracks(spotify_id),
  UNIQUE (user_id, season, rank),
  UNIQUE (user_id, season, spotify_track_id)
);

CREATE INDEX IF NOT EXISTS record_standout_tracks_user_season_idx
  ON record_standout_tracks(user_id, season);
