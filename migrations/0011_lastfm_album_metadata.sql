ALTER TABLE record_albums ADD COLUMN lastfm_listeners INTEGER;
ALTER TABLE record_albums ADD COLUMN lastfm_playcount INTEGER;
ALTER TABLE record_albums ADD COLUMN lastfm_tags_json TEXT;
ALTER TABLE record_albums ADD COLUMN lastfm_url TEXT;
ALTER TABLE record_albums ADD COLUMN lastfm_fetched_at TEXT;
