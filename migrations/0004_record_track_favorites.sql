CREATE TABLE IF NOT EXISTS record_track_favorites (
  user_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  spotify_album_id TEXT NOT NULL,
  spotify_track_id TEXT NOT NULL CHECK (length(spotify_track_id) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, season, spotify_album_id, spotify_track_id),
  FOREIGN KEY (user_id, season, spotify_album_id)
    REFERENCES record_list_items(user_id, season, spotify_album_id)
    ON DELETE CASCADE
);
