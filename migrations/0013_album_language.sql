-- Album language from MusicBrainz (ISO 639-3, e.g. eng, spa, jpn; zxx = no lyrics).
-- language_fetched_at is set even when MusicBrainz has no answer, so it isn't asked twice.
ALTER TABLE record_albums ADD COLUMN language TEXT;
ALTER TABLE record_albums ADD COLUMN language_fetched_at TEXT;
