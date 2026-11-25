-- The question games and the cover-art features (development account only for now).
-- Every statement is safe to run twice.

-- What each cover shows, written once by a vision model (scripts/describe-covers.mjs).
-- image_url is the cover that was described, so a changed cover is described again.
CREATE TABLE IF NOT EXISTS record_cover_descriptions (
  spotify_album_id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  description_json TEXT NOT NULL CHECK (json_valid(description_json)),
  model TEXT NOT NULL,
  described_at TEXT NOT NULL,
  FOREIGN KEY (spotify_album_id) REFERENCES record_albums(spotify_id) ON DELETE CASCADE
);

-- Each cover's closest covers by description, highest similarity first
-- (scripts/cover-similarity.mjs). Stored both ways round.
CREATE TABLE IF NOT EXISTS record_cover_neighbors (
  spotify_album_id TEXT NOT NULL,
  neighbor_album_id TEXT NOT NULL,
  similarity REAL NOT NULL,
  PRIMARY KEY (spotify_album_id, neighbor_album_id)
);

CREATE INDEX IF NOT EXISTS record_cover_neighbors_similarity_idx
  ON record_cover_neighbors(similarity);

-- One line on what two look-alike covers share, for Wrapped. album_a < album_b.
CREATE TABLE IF NOT EXISTS record_cover_pairs (
  album_a TEXT NOT NULL,
  album_b TEXT NOT NULL,
  similarity REAL NOT NULL,
  reason TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (album_a, album_b)
);

-- Ready-made cover puzzles: four groups of four look-alike covers from one group's picks.
CREATE TABLE IF NOT EXISTS record_cover_puzzles (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS record_cover_puzzles_group_idx
  ON record_cover_puzzles(group_id, season);

-- Facts about each album's artist from Last.fm and MusicBrainz (scripts/fetch-album-facts.mjs).
CREATE TABLE IF NOT EXISTS record_album_facts (
  spotify_album_id TEXT PRIMARY KEY,
  facts_json TEXT NOT NULL CHECK (json_valid(facts_json)),
  fetched_at TEXT NOT NULL,
  FOREIGN KEY (spotify_album_id) REFERENCES record_albums(spotify_id) ON DELETE CASCADE
);

-- A round of a question game. board_json lists the candidates and which are turned down.
CREATE TABLE IF NOT EXISTS record_question_rounds (
  id TEXT PRIMARY KEY,
  player_user_id TEXT NOT NULL,
  data_group_id TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('record', 'listener', 'only-one')),
  secret_id TEXT NOT NULL,
  board_json TEXT NOT NULL CHECK (json_valid(board_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  finished_at TEXT,
  solved INTEGER NOT NULL DEFAULT 0 CHECK (solved IN (0, 1)),
  FOREIGN KEY (player_user_id) REFERENCES record_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS record_question_rounds_player_idx
  ON record_question_rounds(player_user_id, created_at);

-- Every question, description and guess, with the raw model answers, so rounds can be reviewed.
CREATE TABLE IF NOT EXISTS record_question_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('question', 'description', 'guess')),
  text TEXT NOT NULL CHECK (length(text) <= 300),
  answer TEXT,
  judgments_json TEXT CHECK (judgments_json IS NULL OR json_valid(judgments_json)),
  turned_down_json TEXT CHECK (turned_down_json IS NULL OR json_valid(turned_down_json)),
  input_tokens INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (round_id) REFERENCES record_question_rounds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS record_question_turns_round_idx
  ON record_question_turns(round_id, id);
