-- A researched write-up of each picked album (scripts/research-albums.mjs): sound, mood and
-- themes, the story of the record, reception and the artist, built from web sources with
-- their links. Flip Side reads it so questions about how a record sounds can be answered.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS record_album_research (
  spotify_album_id TEXT PRIMARY KEY,
  research_json TEXT NOT NULL CHECK (json_valid(research_json)),
  model TEXT NOT NULL,
  researched_at TEXT NOT NULL,
  FOREIGN KEY (spotify_album_id) REFERENCES record_albums(spotify_id) ON DELETE CASCADE
);
