-- Map coordinates for the places artists come from (scripts/geocode-places.mjs), for the
-- Liner Notes "Passport stamps" map. One row per MusicBrainz begin area and country, as
-- record_album_facts stores them; area '' is the country itself. lat/lon stay NULL when the
-- place could not be found, so the script does not ask again. Safe to run twice.
CREATE TABLE IF NOT EXISTS record_places (
  country TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  lat REAL,
  lon REAL,
  display_name TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (country, area)
);
