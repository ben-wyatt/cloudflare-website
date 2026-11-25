-- One row for every finished round, win or lose, of Whose Wax? (who-picked-it), Staff Picks
-- (match-the-record) or Flip Side (flip-side). Liner Notes (Wrapped) and the
-- group's full lists open for a member once they have finished enough rounds this season,
-- because the lists give away the games' answers.
CREATE TABLE record_game_plays (
  round_id TEXT PRIMARY KEY,
  player_user_id TEXT NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('who-picked-it', 'match-the-record', 'flip-side')),
  season INTEGER NOT NULL,
  finished_at TEXT NOT NULL,
  FOREIGN KEY (player_user_id) REFERENCES record_users(id) ON DELETE CASCADE
);

CREATE INDEX record_game_plays_player_idx
  ON record_game_plays(player_user_id, season);

-- Rounds finished before this table existed: solved Who Picked It? rounds keep a result,
-- lost ones survive only until their round expires, and every finished Match The Record
-- round keeps a result.
INSERT OR IGNORE INTO record_game_plays (round_id, player_user_id, game, season, finished_at)
SELECT round_id, player_user_id, 'who-picked-it', 2026, solved_at
FROM record_game_results;

INSERT OR IGNORE INTO record_game_plays (round_id, player_user_id, game, season, finished_at)
SELECT id, player_user_id, 'who-picked-it', 2026, solved_at
FROM record_game_rounds
WHERE solved_at IS NOT NULL;

INSERT OR IGNORE INTO record_game_plays (round_id, player_user_id, game, season, finished_at)
SELECT round_id, player_user_id, 'match-the-record', 2026, completed_at
FROM record_match_results;
