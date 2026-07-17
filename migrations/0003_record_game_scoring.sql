CREATE TABLE IF NOT EXISTS record_game_results (
  round_id TEXT PRIMARY KEY,
  player_user_id TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0),
  guesses INTEGER NOT NULL CHECK (guesses >= 1),
  clues_used INTEGER NOT NULL CHECK (clues_used BETWEEN 0 AND 3),
  solved_at TEXT NOT NULL,
  FOREIGN KEY (player_user_id) REFERENCES record_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS record_game_results_player_idx
  ON record_game_results(player_user_id, solved_at);
