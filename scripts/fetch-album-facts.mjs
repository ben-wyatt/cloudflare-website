// Gather facts about each picked album's artist, for the question games, and save them to
// the remote D1 (record_album_facts). No model is involved: these are looked-up facts.
//   node scripts/fetch-album-facts.mjs            (albums without facts yet)
//   node scripts/fetch-album-facts.mjs --force    (every album again)
//   node scripts/fetch-album-facts.mjs --dry-run  (look up and print, save nothing)
// Sources: Last.fm artist.getinfo (bio, tags, similar artists, listeners) and album.getinfo
// (the album's wiki text), and MusicBrainz (solo or band, gender, country, active years).
// MusicBrainz allows about one request a second. Uses LASTFM_API_KEY from the environment or .dev.vars.
import { d1Query, d1Write, readKey, sqlText, wait } from "./lib/remote-d1.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const LASTFM_KEY = readKey("LASTFM_API_KEY");
if (!LASTFM_KEY) {
  console.error("LASTFM_API_KEY is not set in the environment or .dev.vars.");
  process.exit(1);
}

const plain = (value) => String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const baseTitle = (name) => String(name).replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/\s+-\s+.*$/, "").trim() || String(name);
const luceneText = (value) => String(value).replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1");

// Last.fm text comes as HTML with a "Read more on Last.fm" link at the end.
function cleanLastFmText(value, max = 700) {
  const text = String(value || "")
    .replace(/<a [^>]*>Read more on Last\.fm<\/a>\.?/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/User-contributed text is available under.*$/i, "")
    .replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(". ") + 1, max - 80)).trim()}…`;
}

const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);

async function lastFm(params) {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.search = new URLSearchParams({ ...params, api_key: LASTFM_KEY, format: "json", autocorrect: "1" }).toString();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "CloudflareWebsite-RecordClub/1.0" } });
    if (response.status === 429) { await wait(3000 * (attempt + 1)); continue; }
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.error ? null : body;
  }
  return null;
}

let lastMusicBrainz = 0;
async function musicBrainz(pathAndQuery) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const gap = Date.now() - lastMusicBrainz;
    if (gap < 1100) await wait(1100 - gap);
    lastMusicBrainz = Date.now();
    const response = await fetch(`https://musicbrainz.org/ws/2/${pathAndQuery}`, {
      headers: { "user-agent": "record-club-album-facts/0.1", accept: "application/json" },
    });
    if (response.status === 503 || response.status === 429) { await wait(3000 * (attempt + 1)); continue; }
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }
  return null;
}

// The MusicBrainz artist credited on this album's release group, else null.
async function musicBrainzArtistId(album, artistName) {
  const title = baseTitle(album.name);
  const words = plain(artistName).split(" ").filter((word) => word.length >= 3);
  const query = `releasegroup:"${luceneText(title)}"${words.length ? ` AND (${words.map((word) => `artist:${luceneText(word)}`).join(" OR ")})` : ""}`;
  const result = await musicBrainz(`release-group/?fmt=json&limit=10&query=${encodeURIComponent(query)}`);
  for (const group of result?.["release-groups"] || []) {
    if (Number(group.score) < 85 || plain(baseTitle(group.title)) !== plain(title)) continue;
    const credit = group["artist-credit"]?.[0];
    const creditWords = new Set(plain(credit?.name || credit?.artist?.name).split(" "));
    if (credit?.artist?.id && words.some((word) => creditWords.has(word))) return credit.artist.id;
  }
  return null;
}

function musicBrainzFacts(artist) {
  if (!artist) return {};
  return {
    type: artist.type || null,
    gender: artist.type === "Person" ? artist.gender || null : null,
    country: artist.country || null,
    area: artist.area?.name || null,
    beginArea: artist["begin-area"]?.name || null,
    activeSince: artist["life-span"]?.begin ? Number(String(artist["life-span"].begin).slice(0, 4)) || null : null,
    ended: Boolean(artist["life-span"]?.ended),
    disambiguation: artist.disambiguation || null,
  };
}

const artistCache = new Map();
async function artistFacts(album, artistName) {
  const key = plain(artistName);
  if (artistCache.has(key)) return artistCache.get(key);
  const info = (await lastFm({ method: "artist.getinfo", artist: artistName }))?.artist;
  let mbArtist = null;
  const mbid = info?.mbid || await musicBrainzArtistId(album, artistName);
  if (mbid) mbArtist = await musicBrainz(`artist/${mbid}?fmt=json`);
  const facts = {
    name: info?.name || artistName,
    ...musicBrainzFacts(mbArtist),
    lastfmListeners: Number(info?.stats?.listeners) || null,
    tags: asList(info?.tags?.tag).map((tag) => String(tag.name || "").toLowerCase()).filter(Boolean).slice(0, 6),
    similar: asList(info?.similar?.artist).map((artist) => String(artist.name || "")).filter(Boolean).slice(0, 5),
    bio: cleanLastFmText(info?.bio?.summary),
  };
  artistCache.set(key, facts);
  return facts;
}

const albums = d1Query(`SELECT DISTINCT a.spotify_id AS spotifyId, a.name, a.artist_name AS artistName
  FROM record_albums a
  JOIN record_list_items li ON li.spotify_album_id = a.spotify_id
  LEFT JOIN record_album_facts f ON f.spotify_album_id = a.spotify_id
  WHERE ${force ? "1 = 1" : "f.spotify_album_id IS NULL"}
  ORDER BY a.artist_name, a.name`);
console.log(`Looking up facts for ${albums.length} albums${dryRun ? " (dry run)" : ""}.`);

const statements = [];
for (const album of albums) {
  const artistName = String(album.artistName || "").split(",")[0].trim();
  try {
    const various = /^various artists$/i.test(artistName);
    const artist = various ? { name: artistName, type: "Various artists" } : await artistFacts(album, artistName);
    const wiki = (await lastFm({ method: "album.getinfo", artist: artistName, album: album.name }))?.album?.wiki?.summary;
    const facts = { artist, albumWiki: cleanLastFmText(wiki, 600) };
    console.log(`✓ ${album.artistName} — ${album.name}: ${[artist.type, artist.gender, artist.country, artist.activeSince].filter(Boolean).join(", ") || "no MusicBrainz match"}${facts.albumWiki ? " · wiki" : ""}`);
    if (dryRun) console.log(JSON.stringify(facts, null, 2));
    statements.push(`INSERT OR REPLACE INTO record_album_facts (spotify_album_id, facts_json, fetched_at)
      VALUES (${sqlText(album.spotifyId)}, ${sqlText(JSON.stringify(facts))}, ${sqlText(new Date().toISOString())})`);
  } catch (error) {
    console.warn(`× ${album.artistName} — ${album.name}: ${error.message}`);
  }
  if (!dryRun && statements.length >= 25) d1Write(statements.splice(0));
}
if (!dryRun && statements.length) d1Write(statements);
console.log("Done.");
