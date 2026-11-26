// Load hand-made Crates puzzles from a JSON file into the remote D1 (record_cover_puzzles).
//   node scripts/load-crates.mjs [file]              (add or update the file's puzzles)
//   node scripts/load-crates.mjs [file] --replace    (also delete this group's puzzles not in the file)
//   node scripts/load-crates.mjs [file] --dry-run    (check only, save nothing)
// The file: { "group": "badabing", "puzzles": [{ id, title, groups: [{ level, label,
// records: [{ spotifyId, title, artist, why, source }] }], red_herrings, doubts }] }.
// Every loaded puzzle is playable; the red herrings, doubts and sources are kept for reference
// only and never shown. The current puzzles are in ~/Agent/artifacts/record-club-crates/puzzles-v2.json.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { checkPuzzle } from "../functions/_shared/crates.js";
import { d1Query, d1Write, sqlText } from "./lib/remote-d1.mjs";

const SEASON = 2026;
const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"))
  || path.join(homedir(), "Agent", "artifacts", "record-club-crates", "puzzles-v2.json");
const dryRun = args.includes("--dry-run");
const replace = args.includes("--replace");

const data = JSON.parse(readFileSync(file, "utf8"));
const groupId = String(data.group || "");
if (!/^[a-z0-9-]+$/.test(groupId)) throw new Error("The file needs a group id.");

const known = new Set(d1Query(`SELECT DISTINCT li.spotify_album_id AS id
  FROM record_list_items li JOIN record_users u ON u.id = li.user_id
  WHERE li.season = ${SEASON} AND u.group_id = ${sqlText(groupId)}`).map((row) => row.id));
const existing = d1Query(`SELECT id FROM record_cover_puzzles
  WHERE group_id = ${sqlText(groupId)} AND season = ${SEASON}`).map((row) => row.id);

const statements = [];
let rejected = 0;
const ids = [];
for (const puzzle of data.puzzles || []) {
  const problems = checkPuzzle(puzzle, known);
  if (problems.length) {
    rejected += 1;
    console.warn(`× ${puzzle.id}:\n  ${problems.join("\n  ")}`);
    continue;
  }
  ids.push(puzzle.id);
  const payload = { ...puzzle, kind: "trivia" };
  console.log(`✓ ${puzzle.id}: ${puzzle.groups.map((group) => group.label).join(" · ")}`);
  statements.push(`INSERT OR REPLACE INTO record_cover_puzzles (id, group_id, season, payload_json, created_at)
    VALUES (${sqlText(puzzle.id)}, ${sqlText(groupId)}, ${SEASON}, ${sqlText(JSON.stringify(payload))}, ${sqlText(new Date().toISOString())})`);
}
const stale = existing.filter((id) => !ids.includes(id));
if (replace && stale.length) {
  statements.push(`DELETE FROM record_cover_puzzles WHERE group_id = ${sqlText(groupId)} AND season = ${SEASON}
    AND id IN (${stale.map(sqlText).join(", ")})`);
}

if (!dryRun && statements.length) d1Write(statements);
console.log(`${dryRun ? "Checked" : "Loaded"} ${ids.length} puzzles for ${groupId}; ${rejected} had problems.`
  + (stale.length ? ` ${replace ? "Deleted" : "Left in place"} ${stale.length} other puzzles${replace ? "" : " (use --replace to delete them)"}.` : ""));
if (rejected) process.exitCode = 1;
