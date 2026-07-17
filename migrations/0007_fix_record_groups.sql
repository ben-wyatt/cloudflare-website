INSERT OR IGNORE INTO record_groups (id, name, created_at) VALUES
  ('wyatt-fam', 'Wyatt Family', '2026-07-17T00:00:00.000Z'),
  ('badabing', 'Badabing', '2026-07-17T00:00:00.000Z');

-- The original access code was temporarily represented as the generic
-- "friends" group. Preserve those members and their lists under its real name.
UPDATE record_users
SET group_id = 'badabing'
WHERE group_id = 'friends';

DELETE FROM record_groups
WHERE id = 'friends';
