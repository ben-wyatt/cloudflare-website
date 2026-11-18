// Look up each picked album's language on MusicBrainz and save it to the remote D1.
//   node scripts/fetch-album-languages.mjs            (albums not looked up yet)
//   node scripts/fetch-album-languages.mjs --all      (look every album up again)
//   node scripts/fetch-album-languages.mjs --unknown  (retry albums with no language yet)
// MusicBrainz allows about one request a second, so this waits between lookups.
import { execFileSync } from "node:child_process";
import { lookupAlbumLanguage } from "../functions/_shared/musicbrainz.js";

const everything = process.argv.includes("--all");
const unknownOnly = process.argv.includes("--unknown");

function d1(sql) {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", "record-club", "--remote", "--json", "--command", sql], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_WRITE_LOGS: "false" },
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(output)[0];
}

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const albums = d1(`SELECT DISTINCT a.spotify_id AS spotifyId, a.name, a.artist_name AS artistName
  FROM record_albums a JOIN record_list_items li ON li.spotify_album_id = a.spotify_id
  ${everything ? "" : unknownOnly ? "WHERE a.language IS NULL" : "WHERE a.language_fetched_at IS NULL"}
  ORDER BY a.artist_name, a.name`).results;
console.log(`Looking up ${albums.length} albums.`);

const updates = [];
const counts = new Map();
for (const [index, album] of albums.entries()) {
  let language = null;
  try {
    language = await lookupAlbumLanguage(album);
  } catch (error) {
    console.warn(`  skipped ${album.artistName} – ${album.name}: ${error.message}`);
    await wait(1100);
    continue;
  }
  counts.set(language || "unknown", (counts.get(language || "unknown") || 0) + 1);
  if (language && language !== "eng") console.log(`  ${language}  ${album.artistName} – ${album.name}`);
  updates.push(`UPDATE record_albums SET language = ${language ? sqlText(language) : "NULL"}, language_fetched_at = ${sqlText(new Date().toISOString())} WHERE spotify_id = ${sqlText(album.spotifyId)};`);
  if (updates.length === 40 || index === albums.length - 1) {
    d1(updates.join("\n"));
    updates.length = 0;
  }
  await wait(1500);
}
if (updates.length) d1(updates.join("\n"));
console.log("Languages:", Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])));
