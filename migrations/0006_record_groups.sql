CREATE TABLE IF NOT EXISTS record_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO record_groups (id, name, created_at) VALUES
  ('friends', 'Friends', '2026-07-17T00:00:00.000Z'),
  ('development', 'Development', '2026-07-17T00:00:00.000Z'),
  ('ey-mt-juniors', 'EY MT Juniors', '2026-07-17T00:00:00.000Z');

ALTER TABLE record_users
  ADD COLUMN group_id TEXT REFERENCES record_groups(id);

UPDATE record_users
SET group_id = 'friends'
WHERE group_id IS NULL;

UPDATE record_users
SET group_id = 'development'
WHERE instr(username, '_') > 0;

CREATE INDEX IF NOT EXISTS record_users_group_idx
  ON record_users(group_id, username);
