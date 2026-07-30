ALTER TABLE record_albums ADD COLUMN album_type TEXT;
ALTER TABLE record_albums ADD COLUMN release_date_precision TEXT;
ALTER TABLE record_albums ADD COLUMN total_duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE record_albums ADD COLUMN explicit_track_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE record_albums ADD COLUMN metadata_enriched_at TEXT;

CREATE TABLE record_artists (
  spotify_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  spotify_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE record_album_artists (
  spotify_album_id TEXT NOT NULL,
  spotify_artist_id TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 1),
  PRIMARY KEY (spotify_album_id, spotify_artist_id),
  UNIQUE (spotify_album_id, display_order),
  FOREIGN KEY (spotify_album_id) REFERENCES record_albums(spotify_id) ON DELETE CASCADE,
  FOREIGN KEY (spotify_artist_id) REFERENCES record_artists(spotify_id) ON DELETE CASCADE
);

CREATE INDEX record_album_artists_artist_idx
  ON record_album_artists(spotify_artist_id, spotify_album_id);

CREATE TABLE record_album_tracks (
  spotify_album_id TEXT NOT NULL,
  spotify_track_id TEXT NOT NULL,
  disc_number INTEGER NOT NULL DEFAULT 1 CHECK (disc_number >= 1),
  track_number INTEGER NOT NULL DEFAULT 1 CHECK (track_number >= 1),
  PRIMARY KEY (spotify_album_id, spotify_track_id),
  UNIQUE (spotify_album_id, disc_number, track_number),
  FOREIGN KEY (spotify_album_id) REFERENCES record_albums(spotify_id) ON DELETE CASCADE,
  FOREIGN KEY (spotify_track_id) REFERENCES record_tracks(spotify_id) ON DELETE CASCADE
);

CREATE INDEX record_album_tracks_track_idx
  ON record_album_tracks(spotify_track_id);

CREATE TABLE record_group_seasons (
  group_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'wrapped')),
  locks_at TEXT,
  wrapped_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, season),
  FOREIGN KEY (group_id) REFERENCES record_groups(id) ON DELETE CASCADE
);

INSERT INTO record_group_seasons
  (group_id, season, status, locks_at, wrapped_at, created_at, updated_at)
SELECT
  id,
  2026,
  'open',
  '2026-12-01T05:00:00.000Z',
  NULL,
  '2026-07-30T00:00:00.000Z',
  '2026-07-30T00:00:00.000Z'
FROM record_groups;

CREATE TABLE record_wrapped_snapshots (
  group_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  algorithm_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  generated_at TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (group_id, season),
  FOREIGN KEY (group_id, season)
    REFERENCES record_group_seasons(group_id, season)
    ON DELETE CASCADE
);
