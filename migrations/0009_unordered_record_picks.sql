-- Album and standout-track choices are sets. Preserve existing rows and IDs,
-- but remove the ranking columns and their uniqueness constraints.
PRAGMA defer_foreign_keys = true;

CREATE TABLE record_track_favorites_backup AS
SELECT user_id, season, spotify_album_id, spotify_track_id, created_at
FROM record_track_favorites;

CREATE TABLE record_game_rounds_backup AS
SELECT
  id,
  player_user_id,
  answer_list_item_id,
  clue_level,
  guess_count,
  created_at,
  expires_at,
  solved_at
FROM record_game_rounds;

CREATE TABLE record_game_guesses_backup AS
SELECT id, round_id, guessed_user_id, created_at
FROM record_game_guesses;

DROP TABLE record_game_guesses;
DROP TABLE record_game_rounds;
DROP TABLE record_track_favorites;

CREATE TABLE record_list_items_unordered (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  spotify_album_id TEXT NOT NULL,
  review TEXT NOT NULL DEFAULT '' CHECK (length(review) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES record_users(id) ON DELETE CASCADE,
  FOREIGN KEY (spotify_album_id) REFERENCES record_albums(spotify_id),
  UNIQUE (user_id, season, spotify_album_id)
);

INSERT INTO record_list_items_unordered
  (id, user_id, season, spotify_album_id, review, created_at, updated_at)
SELECT id, user_id, season, spotify_album_id, review, created_at, updated_at
FROM record_list_items;

DROP TABLE record_list_items;
ALTER TABLE record_list_items_unordered RENAME TO record_list_items;

CREATE INDEX record_list_items_user_season_idx
  ON record_list_items(user_id, season);

CREATE TABLE record_track_favorites (
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

INSERT INTO record_track_favorites
  (user_id, season, spotify_album_id, spotify_track_id, created_at)
SELECT user_id, season, spotify_album_id, spotify_track_id, created_at
FROM record_track_favorites_backup;

CREATE TABLE record_game_rounds (
  id TEXT PRIMARY KEY,
  player_user_id TEXT NOT NULL,
  answer_list_item_id INTEGER NOT NULL,
  clue_level INTEGER NOT NULL DEFAULT 0 CHECK (clue_level BETWEEN 0 AND 3),
  guess_count INTEGER NOT NULL DEFAULT 0 CHECK (guess_count >= 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  solved_at TEXT,
  FOREIGN KEY (player_user_id) REFERENCES record_users(id) ON DELETE CASCADE,
  FOREIGN KEY (answer_list_item_id) REFERENCES record_list_items(id) ON DELETE CASCADE
);

CREATE INDEX record_game_rounds_player_idx
  ON record_game_rounds(player_user_id, expires_at);

INSERT INTO record_game_rounds
  (id, player_user_id, answer_list_item_id, clue_level, guess_count, created_at, expires_at, solved_at)
SELECT
  id,
  player_user_id,
  answer_list_item_id,
  clue_level,
  guess_count,
  created_at,
  expires_at,
  solved_at
FROM record_game_rounds_backup;

CREATE TABLE record_game_guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT NOT NULL,
  guessed_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (round_id) REFERENCES record_game_rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (guessed_user_id) REFERENCES record_users(id) ON DELETE CASCADE,
  UNIQUE (round_id, guessed_user_id)
);

CREATE INDEX record_game_guesses_round_idx
  ON record_game_guesses(round_id);

INSERT INTO record_game_guesses
  (id, round_id, guessed_user_id, created_at)
SELECT id, round_id, guessed_user_id, created_at
FROM record_game_guesses_backup;

DROP TABLE record_track_favorites_backup;
DROP TABLE record_game_rounds_backup;
DROP TABLE record_game_guesses_backup;

CREATE TABLE record_standout_tracks_unordered (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  spotify_track_id TEXT NOT NULL,
  review TEXT NOT NULL DEFAULT '' CHECK (length(review) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES record_users(id) ON DELETE CASCADE,
  FOREIGN KEY (spotify_track_id) REFERENCES record_tracks(spotify_id),
  UNIQUE (user_id, season, spotify_track_id)
);

INSERT INTO record_standout_tracks_unordered
  (id, user_id, season, spotify_track_id, review, created_at, updated_at)
SELECT id, user_id, season, spotify_track_id, review, created_at, updated_at
FROM record_standout_tracks;

DROP TABLE record_standout_tracks;
ALTER TABLE record_standout_tracks_unordered RENAME TO record_standout_tracks;

CREATE INDEX record_standout_tracks_user_season_idx
  ON record_standout_tracks(user_id, season);
