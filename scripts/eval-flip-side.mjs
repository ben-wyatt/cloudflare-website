// Score Flip Side's answers on a hand-checked question set, in three setups:
//   A: the record facts as before (no write-up, no date)
//   B: the same facts plus today's date
//   C: today's date plus the researched write-up (record_album_research)
//   node scripts/eval-flip-side.mjs [questions.json]
// questions.json: [{ "id": "<spotify album id>", "q": "Is it danceable?", "expect": true }].
// A question is right when Jev's probability is on the expected side of 0.5; "unsure" counts
// probabilities between 0.3 and 0.7, which Flip Side answers with "Probably" or "Hard to say".
// Sends the same facts the game sends (including the pickers' notes) to Jev. Uses TYPESAFE_API_KEY.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { buildJevRequest, recordFacts } from "../functions/_shared/question-games.js";
import { d1Query, mapLimit, readKey, sqlText } from "./lib/remote-d1.mjs";

const file = process.argv[2] || path.join(homedir(), "Agent", "artifacts", "record-club-research", "eval-questions.json");
const questions = JSON.parse(readFileSync(file, "utf8"));
const ids = [...new Set(questions.map((item) => item.id))];
const list = ids.map(sqlText).join(", ");

const albums = new Map(d1Query(`SELECT a.spotify_id AS spotifyId, a.name, a.artist_name AS artistName,
    a.release_date AS releaseDate, a.album_type AS albumType, a.total_tracks AS totalTracks,
    a.total_duration_ms AS totalDurationMs, a.explicit_track_count AS explicitTrackCount,
    a.metadata_enriched_at AS metadataEnrichedAt, a.lastfm_listeners AS lastfmListeners,
    a.lastfm_tags_json AS lastfmTagsJson, a.language, d.description_json AS descriptionJson,
    f.facts_json AS factsJson, r.research_json AS researchJson
  FROM record_albums a
  LEFT JOIN record_cover_descriptions d ON d.spotify_album_id = a.spotify_id
  LEFT JOIN record_album_facts f ON f.spotify_album_id = a.spotify_id
  LEFT JOIN record_album_research r ON r.spotify_album_id = a.spotify_id
  WHERE a.spotify_id IN (${list})`).map((row) => [row.spotifyId, row]));
const picks = d1Query(`SELECT li.spotify_album_id AS id, u.username, li.review FROM record_list_items li
  JOIN record_users u ON u.id = li.user_id WHERE li.spotify_album_id IN (${list})`);
const tracks = d1Query(`SELECT at.spotify_album_id AS id, t.name FROM record_album_tracks at
  JOIN record_tracks t ON t.spotify_id = at.spotify_track_id WHERE at.spotify_album_id IN (${list})
  ORDER BY at.disc_number, at.track_number`);

function factsFor(id, withResearch) {
  const album = { ...albums.get(id) };
  if (!withResearch) album.researchJson = null;
  if (!album.metadataEnrichedAt) album.explicitTrackCount = null;
  return recordFacts(album, {
    picks: picks.filter((row) => row.id === id),
    trackNames: tracks.filter((row) => row.id === id).map((row) => row.name),
  });
}

async function ask(item, setup) {
  const request = buildJevRequest(item.q, [{ id: item.id, facts: factsFor(item.id, setup === "C") }]);
  if (setup === "A") {
    delete request.state.today;
    request.questions.c0.instructions.task = request.questions.c0.instructions.task.replace(/ Today's date is .*$/, "");
  }
  delete request.questions.kind;
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { authorization: `Bearer ${readKey("TYPESAFE_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", ...request }),
  });
  const payload = await response.json();
  return { p: Number(payload.answers?.c0?.noul), tokens: Number(payload.usage?.input_tokens || 0) };
}

const results = await mapLimit(questions, 4, async (item) => {
  const [a, b, c] = [await ask(item, "A"), await ask(item, "B"), await ask(item, "C")];
  return { ...item, a, b, c };
});

const right = (p, expect) => (expect ? p > 0.5 : p < 0.5);
const unsure = (p) => p > 0.3 && p < 0.7;
for (const row of results) {
  const mark = (r) => `${r.p.toFixed(2)}${right(r.p, row.expect) ? " " : "✗"}`;
  const album = albums.get(row.id);
  console.log(`${row.expect ? "yes" : "no "} A ${mark(row.a)}  B ${mark(row.b)}  C ${mark(row.c)}  ${album.artistName.slice(0, 16).padEnd(16)} ${row.q}`);
}
for (const setup of ["a", "b", "c"]) {
  const scored = results.map((row) => row[setup]);
  const correct = results.filter((row) => right(row[setup].p, row.expect)).length;
  const tokens = Math.round(scored.reduce((sum, r) => sum + r.tokens, 0) / scored.length);
  console.log(`${setup.toUpperCase()}: ${correct}/${results.length} right, ${scored.filter((r) => unsure(r.p)).length} unsure, ~${tokens} input tokens per record`);
}
