// Describe every picked album's cover with a vision model and save it to the remote D1.
//   node scripts/describe-covers.mjs              (covers not described yet, or changed since)
//   node scripts/describe-covers.mjs --limit 5    (only the first five, for a look)
//   node scripts/describe-covers.mjs --force      (describe every cover again)
//   node scripts/describe-covers.mjs --dry-run    (describe and print, save nothing)
// Covers are public album art, so nothing private is sent. Raw model replies are kept in
// RAW_DIR for review. Uses OPENROUTER_API_KEY from the environment or .dev.vars.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { d1Query, d1Write, mapLimit, openRouterJson, sqlText } from "./lib/remote-d1.mjs";

const COVER_MODEL = "deepseek/deepseek-v4.1-flash";
const RAW_DIR = process.env.COVER_RAW_DIR || path.join(homedir(), "Agent", "artifacts", "record-club-covers", "raw");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIndex = args.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : Infinity;

const PEOPLE = ["none", "one person", "two people", "a group", "a crowd", "part of a person"];
const MEDIUMS = ["photograph", "painting", "drawing or illustration", "collage", "graphic design", "3D render", "mixed media"];
const BRIGHTNESS = ["dark", "medium", "bright"];

const SYSTEM = `You describe album covers for a music game. Look only at the image.
Never name the album, the artist or any real person, and never guess what the music sounds like.
Reply with one JSON object with exactly these keys:
- "description": one paragraph of 60 to 110 words on what can be seen: the subject, setting, composition, colors, light, texture, lettering and overall feel. Plain, concrete words.
- "subject": a short phrase for the main subject, such as "a man's face in close-up", "an empty swimming pool" or "abstract shapes".
- "people": one of ${PEOPLE.map((value) => `"${value}"`).join(", ")}.
- "medium": one of ${MEDIUMS.map((value) => `"${value}"`).join(", ")}.
- "palette": a list of 2 to 5 main colors in plain words, the most dominant first.
- "brightness": one of ${BRIGHTNESS.map((value) => `"${value}"`).join(", ")}.
- "mood": 2 to 4 words.
- "style": a short phrase on composition and style, such as "minimal and centered" or "busy collage".
- "objects": a list of up to 8 visible things (animals, vehicles, plants, buildings, clothing, symbols, objects).
- "text_on_cover": the words printed on the cover, exactly as shown, or "" when there are none.`;

function clean(value, max = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value, max) {
  return (Array.isArray(value) ? value : []).map((item) => clean(item, 60)).filter(Boolean).slice(0, max);
}

// Keep only the expected keys, in the allowed forms.
function normalizeDescription(data) {
  const pick = (value, allowed, fallback) => (allowed.includes(clean(value).toLowerCase()) ? clean(value).toLowerCase() : fallback);
  const description = {
    description: clean(data?.description, 1200),
    subject: clean(data?.subject, 120),
    people: pick(data?.people, PEOPLE, "none"),
    medium: pick(data?.medium, MEDIUMS.map((value) => value.toLowerCase()), "mixed media"),
    palette: list(data?.palette, 5),
    brightness: pick(data?.brightness, BRIGHTNESS, "medium"),
    mood: clean(data?.mood, 80),
    style: clean(data?.style, 120),
    objects: list(data?.objects, 8),
    textOnCover: clean(data?.text_on_cover ?? data?.textOnCover, 200),
  };
  if (description.description.split(" ").length < 25) throw new Error("description too short");
  return description;
}

async function imageDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`cover download ${response.status}`);
  const type = response.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${type};base64,${bytes.toString("base64")}`;
}

async function describe(album) {
  const { data, cost, raw, model } = await openRouterJson({
    model: COVER_MODEL,
    maxTokens: 900,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this album cover." },
          { type: "image_url", image_url: { url: await imageDataUrl(album.imageUrl) } },
        ],
      },
    ],
  });
  mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(path.join(RAW_DIR, `${album.spotifyId}.json`), JSON.stringify(raw, null, 2));
  return { description: normalizeDescription(data), cost, model };
}

const albums = d1Query(`SELECT DISTINCT a.spotify_id AS spotifyId, a.name, a.artist_name AS artistName, a.image_url AS imageUrl
  FROM record_albums a
  JOIN record_list_items li ON li.spotify_album_id = a.spotify_id
  LEFT JOIN record_cover_descriptions d ON d.spotify_album_id = a.spotify_id
  WHERE a.image_url IS NOT NULL AND trim(a.image_url) <> ''
    ${force ? "" : "AND (d.spotify_album_id IS NULL OR d.image_url <> a.image_url)"}
  ORDER BY a.artist_name, a.name`).slice(0, limit);
console.log(`Describing ${albums.length} covers with ${COVER_MODEL}${dryRun ? " (dry run)" : ""}.`);

let totalCost = 0;
const failures = [];
const statements = [];
await mapLimit(albums, 6, async (album) => {
  try {
    const { description, cost, model } = await describe(album);
    totalCost += cost;
    console.log(`✓ ${album.artistName} — ${album.name}: ${description.subject}`);
    if (dryRun) console.log(JSON.stringify(description, null, 2));
    statements.push(`INSERT OR REPLACE INTO record_cover_descriptions
      (spotify_album_id, image_url, description_json, model, described_at)
      VALUES (${sqlText(album.spotifyId)}, ${sqlText(album.imageUrl)}, ${sqlText(JSON.stringify(description))},
        ${sqlText(model)}, ${sqlText(new Date().toISOString())})`);
  } catch (error) {
    failures.push(album);
    console.warn(`× ${album.artistName} — ${album.name}: ${error.message}`);
  }
});

if (!dryRun && statements.length) d1Write(statements, { slice: 40 });
console.log(`Saved ${dryRun ? 0 : statements.length}; ${failures.length} failed; cost $${totalCost.toFixed(4)}.`);
if (failures.length) process.exitCode = 1;
