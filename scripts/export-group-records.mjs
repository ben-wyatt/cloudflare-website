// Write everything known about one group's records to one JSON file, for whoever writes
// Crates puzzles (a person or an agent): titles, dates, tags, artist facts, track names, the
// cover description, who picked each record and their notes.
//   node scripts/export-group-records.mjs [group]      (default badabing)
// Writes ~/Agent/artifacts/record-club-crates/<group>-records.json (not in the repo: it holds notes).
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { d1Query } from "./lib/remote-d1.mjs";

const group = process.argv[2] || "badabing";
if (!/^[a-z0-9-]+$/.test(group)) throw new Error("Give a group id such as badabing.");
const rows = d1Query(`SELECT a.spotify_id AS spotifyId, a.name, a.artist_name AS artistName, a.release_date AS releaseDate,
    a.album_type AS albumType, a.total_tracks AS totalTracks, a.total_duration_ms AS totalDurationMs,
    a.lastfm_listeners AS lastfmListeners, a.lastfm_tags_json AS tags, a.language,
    d.description_json AS cover, f.facts_json AS facts
  FROM record_albums a
  LEFT JOIN record_cover_descriptions d ON d.spotify_album_id = a.spotify_id
  LEFT JOIN record_album_facts f ON f.spotify_album_id = a.spotify_id
  WHERE a.image_url IS NOT NULL AND a.spotify_id IN (
    SELECT li.spotify_album_id FROM record_list_items li JOIN record_users u ON u.id = li.user_id
    WHERE li.season = 2026 AND u.group_id = '${group}')`);
const picks = d1Query(`SELECT li.spotify_album_id AS spotifyId, u.username, li.review
  FROM record_list_items li JOIN record_users u ON u.id = li.user_id
  WHERE li.season = 2026 AND u.group_id = '${group}'`);
const tracks = d1Query(`SELECT at.spotify_album_id AS spotifyId, t.name
  FROM record_album_tracks at JOIN record_tracks t ON t.spotify_id = at.spotify_track_id
  ORDER BY at.spotify_album_id, at.disc_number, at.track_number`);

const parse = (json) => { try { return JSON.parse(json || "null"); } catch { return null; } };
const records = rows.map((row) => {
  const cover = parse(row.cover) || {};
  const facts = parse(row.facts) || {};
  return {
    spotifyId: row.spotifyId,
    title: row.name,
    artist: row.artistName,
    released: row.releaseDate,
    kind: row.albumType,
    tracks: row.totalTracks,
    minutes: Math.round(Number(row.totalDurationMs || 0) / 60000) || null,
    lyricsLanguage: row.language,
    lastfmListeners: row.lastfmListeners,
    lastfmTags: (parse(row.tags) || []).filter((tag) => Number(tag.count) >= 3).slice(0, 8).map((tag) => tag.name),
    artistFacts: facts.artist || null,
    albumSummary: facts.albumWiki || null,
    trackNames: tracks.filter((track) => track.spotifyId === row.spotifyId).map((track) => track.name),
    cover: { subject: cover.subject, people: cover.people, medium: cover.medium, palette: cover.palette, printedText: cover.textOnCover, description: cover.description },
    pickedBy: picks.filter((pick) => pick.spotifyId === row.spotifyId).map((pick) => pick.username),
    notes: picks.filter((pick) => pick.spotifyId === row.spotifyId && String(pick.review || "").trim())
      .map((pick) => ({ by: pick.username, note: pick.review.trim() })),
  };
}).sort((a, b) => a.artist.localeCompare(b.artist));

const folder = path.join(homedir(), "Agent", "artifacts", "record-club-crates");
mkdirSync(folder, { recursive: true });
writeFileSync(path.join(folder, `${group}-records.json`), JSON.stringify(records, null, 2));
console.log(`${records.length} records written to ${path.join(folder, `${group}-records.json`)}`);
