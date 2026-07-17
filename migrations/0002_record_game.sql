CREATE TABLE IF NOT EXISTS record_game_rounds (
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

CREATE INDEX IF NOT EXISTS record_game_rounds_player_idx
  ON record_game_rounds(player_user_id, expires_at);

CREATE TABLE IF NOT EXISTS record_game_guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT NOT NULL,
  guessed_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (round_id) REFERENCES record_game_rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (guessed_user_id) REFERENCES record_users(id) ON DELETE CASCADE,
  UNIQUE (round_id, guessed_user_id)
);

CREATE INDEX IF NOT EXISTS record_game_guesses_round_idx
  ON record_game_guesses(round_id);
