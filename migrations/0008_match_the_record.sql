CREATE TABLE IF NOT EXISTS record_match_rounds (
  id TEXT PRIMARY KEY,
  player_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (player_user_id) REFERENCES record_users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_user_id) REFERENCES record_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS record_match_rounds_player_idx
  ON record_match_rounds(player_user_id, expires_at);

CREATE TABLE IF NOT EXISTS record_match_round_albums (
  round_id TEXT NOT NULL,
  spotify_album_id TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 8),
  is_answer INTEGER NOT NULL CHECK (is_answer IN (0, 1)),
  PRIMARY KEY (round_id, spotify_album_id),
  UNIQUE (round_id, display_order),
  FOREIGN KEY (round_id) REFERENCES record_match_rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (spotify_album_id) REFERENCES record_albums(spotify_id)
);

CREATE INDEX IF NOT EXISTS record_match_round_albums_round_idx
  ON record_match_round_albums(round_id, display_order);

CREATE TABLE IF NOT EXISTS record_match_results (
  round_id TEXT PRIMARY KEY,
  player_user_id TEXT NOT NULL,
  correct_count INTEGER NOT NULL CHECK (correct_count BETWEEN 0 AND 2),
  completed_at TEXT NOT NULL,
  FOREIGN KEY (round_id) REFERENCES record_match_rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (player_user_id) REFERENCES record_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS record_match_results_player_idx
  ON record_match_results(player_user_id, completed_at);
