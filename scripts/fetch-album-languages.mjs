// Look up each picked album's language on MusicBrainz and save it to the remote D1.
//   node scripts/fetch-album-languages.mjs            (albums not looked up yet)
//   node scripts/fetch-album-languages.mjs --all      (look every album up again)
//   node scripts/fetch-album-languages.mjs --unknown  (retry albums with no language yet)
// MusicBrainz allows about one request a second, so this waits between lookups.
import { execFileSync } from "node:child_process";

const USER_AGENT = "record-club-language-lookup/0.1";
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
const luceneText = (value) => String(value).replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1");
const plain = (value) => String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// "Album (Deluxe Edition)" and "Album - Remastered" search as "Album".
const baseTitle = (name) => String(name).replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/\s+-\s+.*$/, "").trim() || String(name);
// "Ms. Lauryn Hill" and "Lauryn Hill", or "Denzel Curry, Kenny Beats" and
// "Denzel Curry & Kenny Beats", share a distinctive word.
const sameArtist = (credit, artistName) => {
  const words = new Set(credit.split(" ").filter((word) => word.length >= 3));
  return plain(artistName).split(" ").some((word) => word.length >= 3 && words.has(word));
};
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function lookup(album) {
  const title = baseTitle(album.name);
  // Match any distinctive word of the artist ("Ms. Lauryn Hill" finds "Lauryn Hill");
  // a compilation credits its composers, so it is searched by title alone.
  const compilation = /^various artists$/i.test(String(album.artistName).trim());
  const artistWords = plain(album.artistName).split(" ").filter((word) => word.length >= 3);
  const query = `release:"${luceneText(title)}"`
    + (compilation || !artistWords.length ? "" : ` AND (${artistWords.map((word) => `artist:${luceneText(word)}`).join(" OR ")})`);
  const url = `https://musicbrainz.org/ws/2/release/?fmt=json&limit=25&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
    if (response.status === 503 || response.status === 429) {
      await wait(4000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`MusicBrainz answered ${response.status}`);
    const releases = (await response.json()).releases || [];
    // Count the languages of close matches: same title and an artist credit that matches.
    const votes = new Map();
    for (const release of releases) {
      if (Number(release.score) < 85 || plain(baseTitle(release.title)) !== plain(title)) continue;
      const credit = plain((release["artist-credit"] || []).map((part) => `${part.name}${part.joinphrase || ""}`).join(""));
      if (!compilation && !sameArtist(credit, album.artistName)) continue;
      const language = release["text-representation"]?.language;
      if (language) votes.set(language, (votes.get(language) || 0) + 1);
    }
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] || null;
  }
  throw new Error("MusicBrainz stayed busy");
}

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
    language = await lookup(album);
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
