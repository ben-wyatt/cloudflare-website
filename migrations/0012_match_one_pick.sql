-- Match The Record: one pick at a time. Each pick and each unlocked note is stored on
-- the round's album row, and a result keeps its miss count so "perfect" means no misses.
ALTER TABLE record_match_round_albums ADD COLUMN picked_at TEXT;
ALTER TABLE record_match_round_albums ADD COLUMN note_revealed_at TEXT;
ALTER TABLE record_match_results ADD COLUMN misses INTEGER NOT NULL DEFAULT 0;
