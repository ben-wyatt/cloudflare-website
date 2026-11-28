// Fill in where each picked album's artist is from, for the Liner Notes "Passport stamps"
// map, where MusicBrainz leaves a gap or contradicts itself. Reads the album's researched
// write-up (record_album_research), so run scripts/research-albums.mjs first; then run
// scripts/geocode-places.mjs for the new places.
//   node scripts/fill-artist-places.mjs [--group badabing]   (gaps and contradictions only)
//   node scripts/fill-artist-places.mjs --check-all          (ask about every album; print disagreements)
//   add --dry-run to print and save nothing.
// A place is a person's birthplace or a group's hometown (where it formed), as MusicBrainz
// means by "begin area"; a compilation or soundtrack takes where the music was made. The
// answer is saved as facts_json.place = { country, area, evidence } and wins over the
// MusicBrainz fields. Only album and artist facts are sent to the model, never notes.
import { d1Query, d1Write, mapLimit, openRouterJson, sqlText } from "./lib/remote-d1.mjs";

const MODEL = "google/gemini-3-flash-preview";
const args = process.argv.slice(2);
const checkAll = args.includes("--check-all");
const dryRun = args.includes("--dry-run");
const groupIndex = args.indexOf("--group");
const group = groupIndex >= 0 ? args[groupIndex + 1] : "";
if (group && !/^[a-z0-9-]+$/.test(group)) throw new Error("Give a group id such as badabing.");

const albums = d1Query(`SELECT DISTINCT a.spotify_id AS id, a.name, a.artist_name AS artistName,
    json_extract(f.facts_json, '$.artist') AS artistJson,
    json_extract(f.facts_json, '$.place') AS placeJson,
    json_extract(r.research_json, '$.artist') AS researchArtist,
    json_extract(r.research_json, '$.story') AS researchStory,
    p.display_name AS mbPlaceName
  FROM record_list_items li
  JOIN record_users u ON u.id = li.user_id
  JOIN record_albums a ON a.spotify_id = li.spotify_album_id
  JOIN record_album_facts f ON f.spotify_album_id = a.spotify_id
  LEFT JOIN record_album_research r ON r.spotify_album_id = a.spotify_id
  LEFT JOIN record_places p ON p.country = upper(json_extract(f.facts_json, '$.artist.country'))
    AND p.area = trim(coalesce(json_extract(f.facts_json, '$.artist.beginArea'), ''))
  WHERE li.season = 2026 ${group ? `AND u.group_id = ${sqlText(group)}` : ""}
  ORDER BY a.artist_name, a.name`);

const parse = (json) => {
  try {
    return JSON.parse(json || "null");
  } catch {
    return null;
  }
};
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

// A gap: no country, or no hometown. A contradiction: the hometown MusicBrainz gives was
// found on the map outside the country it gives (born in Ghana, listed as Australian).
function needsLook(album) {
  const artist = parse(album.artistJson) || {};
  if (parse(album.placeJson)) return checkAll;
  if (!artist.country || !String(artist.beginArea || "").trim()) return true;
  const countryName = regionNames.of(String(artist.country).toUpperCase());
  if (album.mbPlaceName && countryName && !album.mbPlaceName.endsWith(countryName)) return true;
  return checkAll;
}

const todo = albums.filter(needsLook);
console.log(`Asking about ${todo.length} of ${albums.length} albums with ${MODEL}.`);

const instructions = `You decide where a music artist is from, for pins on a world map.
Use the researched write-up first; use the MusicBrainz fields only when the write-up says nothing.
- A person: where they were born. If the write-up only says where they grew up or are based, use that.
- A group or duo: the city where it formed. If unknown, where it is based.
- "Various Artists" compilations and soundtracks: where the music was made (a Bollywood film soundtrack: Mumbai, India).
- hometown is a city, town or region name, as specific as the sources allow; null when no source names one.
- country is the ISO 3166-1 alpha-2 code of the country the hometown is in (Tigray is in ET), or of the artist's country when there is no hometown; null when nothing says.
- evidence is a short quote from the write-up (or "MusicBrainz") that supports the answer.
Reply with JSON only: {"country": "US" | null, "hometown": "Houston" | null, "evidence": "..."}`;

let cost = 0;
const results = await mapLimit(todo, 6, async (album) => {
  const artist = parse(album.artistJson) || {};
  const facts = {
    album: album.name,
    artist: album.artistName,
    musicbrainz: { name: artist.name, type: artist.type, country: artist.country || null,
      beginArea: artist.beginArea || null, area: artist.area || null, disambiguation: artist.disambiguation || null },
    writeUp: { artist: String(album.researchArtist || "").slice(0, 2500), story: String(album.researchStory || "").slice(0, 1200) },
  };
  try {
    const reply = await openRouterJson({ model: MODEL, maxTokens: 300, messages: [
      { role: "system", content: instructions },
      { role: "user", content: JSON.stringify(facts) },
    ] });
    cost += reply.cost;
    const country = /^[A-Z]{2}$/.test(String(reply.data.country || "").toUpperCase()) ? String(reply.data.country).toUpperCase() : null;
    const area = String(reply.data.hometown || "").trim() || null;
    return { album, artist, country, area, evidence: String(reply.data.evidence || "").slice(0, 240) };
  } catch (error) {
    console.warn(`  skipped ${album.artistName} – ${album.name}: ${error.message}`);
    return null;
  }
});

const updates = [];
for (const result of results.filter(Boolean)) {
  const { album, artist, country, area, evidence } = result;
  const same = country === (artist.country ? String(artist.country).toUpperCase() : null)
    && (area || "") === String(artist.beginArea || "").trim();
  const before = `${artist.beginArea || "—"}, ${artist.country || "—"}`;
  const after = `${area || "—"}, ${country || "—"}`;
  console.log(`${same ? "  =" : "  ≠"} ${album.artistName} – ${album.name}: ${before} → ${after}${same ? "" : `  “${evidence}”`}`);
  if (same || !country) continue;
  const place = JSON.stringify({ country, area: area || "", evidence, model: MODEL });
  updates.push(`UPDATE record_album_facts SET facts_json = json_set(facts_json, '$.place', json(${sqlText(place)}))
    WHERE spotify_album_id = ${sqlText(album.id)}`);
}
if (!dryRun && updates.length) d1Write(updates);
console.log(`${updates.length} places ${dryRun ? "would be saved" : "saved"}; cost $${cost.toFixed(4)}.`);
