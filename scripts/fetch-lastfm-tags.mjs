// Look up each picked album on Last.fm (genre tags, listeners, plays) and save it to the remote D1.
//   node scripts/fetch-lastfm-tags.mjs            (albums never looked up)
//   node scripts/fetch-lastfm-tags.mjs --retry    (also albums with no match or no tags yet)
//   node scripts/fetch-lastfm-tags.mjs --dry-run  (look up, print, save nothing)
// Uses LASTFM_API_KEY from the environment or .dev.vars, and the same lookup as a ballot save.
// wrangler needs a Node built for this machine's processor (on Apple Silicon, an arm64 Node).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getLastFmAlbum } from "../functions/_shared/lastfm.js";

const retry = process.argv.includes("--retry");
const dryRun = process.argv.includes("--dry-run");
// wrangler reads the database settings from the repo, so run it there from any folder.
const repo = fileURLToPath(new URL("..", import.meta.url));

function readDevVar(name) {
  if (process.env[name]) return process.env[name];
  const file = new URL("../.dev.vars", import.meta.url);
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8").split("\n").find((row) => row.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const env = { LASTFM_API_KEY: readDevVar("LASTFM_API_KEY") };
if (!env.LASTFM_API_KEY) {
  console.error("LASTFM_API_KEY is not set in the environment or .dev.vars.");
  process.exit(1);
}

function d1(sql) {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", "record-club", "--remote", "--json", "--command", sql], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_WRITE_LOGS: "false" },
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(output)[0];
}

const sqlText = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
const sqlNumber = (value) => (Number.isSafeInteger(value) ? String(value) : "NULL");
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const albums = d1(`SELECT DISTINCT a.spotify_id AS spotifyId, a.name, a.artist_name AS artistName
  FROM record_albums a JOIN record_list_items li ON li.spotify_album_id = a.spotify_id
  WHERE a.lastfm_fetched_at IS NULL${retry ? " OR a.lastfm_tags_json IS NULL OR a.lastfm_tags_json = '[]'" : ""}
  ORDER BY a.artist_name, a.name`).results;
console.log(`Looking up ${albums.length} albums on Last.fm${dryRun ? " (dry run)" : ""}.`);

// The same two tries as enrichLastFmAlbum: the full artist credit, then the first artist.
async function lookup(album) {
  let result = await getLastFmAlbum(env, album);
  const primaryArtist = album.artistName.split(",")[0].trim();
  if (!result && primaryArtist !== album.artistName) {
    result = await getLastFmAlbum(env, { ...album, artistName: primaryArtist });
  }
  return result;
}

const updates = [];
const tally = { tagged: 0, noTags: 0, noMatch: 0, failed: 0 };
function flush() {
  if (!updates.length || dryRun) return void (updates.length = 0);
  d1(updates.join("\n"));
  updates.length = 0;
}

for (const album of albums) {
  let result = null;
  try {
    result = await lookup(album);
  } catch (error) {
    // Leave it unlooked-up so the next run tries again.
    tally.failed += 1;
    console.warn(`  skipped ${album.artistName} – ${album.name}: ${error.message}`);
    await wait(error.status === 429 ? 10_000 : 1_000);
    continue;
  }
  const tags = result?.tags || [];
  if (!result) tally.noMatch += 1;
  else if (tags.length) tally.tagged += 1;
  else tally.noTags += 1;
  const top = tags.slice(0, 4).map((tag) => tag.name).join(", ");
  console.log(`  ${result ? (tags.length ? "tags " : "none ") : "miss "} ${album.artistName} – ${album.name}${top ? `  [${top}]` : ""}`);
  updates.push(`UPDATE record_albums SET lastfm_listeners = ${sqlNumber(result?.listeners)}, `
    + `lastfm_playcount = ${sqlNumber(result?.playcount)}, `
    + `lastfm_tags_json = ${sqlText(result ? JSON.stringify(tags) : null)}, `
    + `lastfm_url = ${sqlText(result?.url)}, lastfm_fetched_at = ${sqlText(new Date().toISOString())} `
    + `WHERE spotify_id = ${sqlText(album.spotifyId)};`);
  // Small batches keep each wrangler command well under the argument-length limit.
  if (updates.length === 10) flush();
  await wait(400);
}
flush();
console.log("Last.fm:", tally);
