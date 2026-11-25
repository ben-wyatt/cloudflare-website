// Research each picked album on the web and save a dense write-up for Flip Side
// (record_album_research). For every album, DeepSeek V4.1 Flash runs three web searches
// (OpenRouter's web plugin) from different angles and keeps only the facts the pages state,
// each with its link; then it writes fixed sections from those facts and what the database
// already knows. Nothing is invented: a section with no sources says so.
//   node scripts/research-albums.mjs --lowest 7          (the 7 picks with the fewest Last.fm listeners)
//   node scripts/research-albums.mjs --ids ID,ID         (these albums)
//   node scripts/research-albums.mjs [--group badabing]  (every picked album, or one group's, without research yet)
//   add --force to research again, --dry-run to print and save nothing, --group badabing for --lowest.
// Only album titles and artist names are searched; the friends' notes never leave this script.
// Raw replies are kept in RAW_DIR. Uses OPENROUTER_API_KEY.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { d1Query, d1Write, mapLimit, readKey, sqlText, wait } from "./lib/remote-d1.mjs";

const MODEL = "deepseek/deepseek-v4.1-flash";
const RESULTS_PER_SEARCH = 5;
const RAW_DIR = path.join(homedir(), "Agent", "artifacts", "record-club-research", "raw");
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const SECTIONS = ["sound", "mood_and_themes", "story", "reception", "artist"];

async function openRouter(body, tries = 3) {
  const key = readKey("OPENROUTER_API_KEY");
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, temperature: 0, reasoning: { enabled: false }, usage: { include: true }, ...body }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${JSON.stringify(payload?.error || payload).slice(0, 200)}`);
      const choice = payload.choices?.[0];
      if (choice?.finish_reason && choice.finish_reason !== "stop") throw new Error(`finish_reason ${choice.finish_reason}`);
      return payload;
    } catch (error) {
      lastError = error;
      await wait(2000 * attempt);
    }
  }
  throw lastError;
}

function parseJson(text) {
  const clean = String(text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
}

// What identifies this album, so search results about other albums or artists are dropped.
function identity(album) {
  return [
    `Album: "${album.name}" by ${album.artistName}.`,
    album.releaseDate ? `Released: ${album.releaseDate}.` : "",
    album.tracks?.length ? `Tracks include: ${album.tracks.slice(0, 8).join("; ")}.` : "",
    album.place ? `The artist is listed as from: ${album.place}.` : "",
  ].filter(Boolean).join(" ");
}

const SEARCHES = [
  { angle: "sound and reception", ask: (a) => `"${a.name}" ${a.artistName} album review: what it sounds like (genre, instruments, vocals, production, mood) and how critics received it` },
  { angle: "the story of the record", ask: (a) => `"${a.name}" ${a.artistName} album: how, when and where it was made, producer, label, collaborators, interview about the record` },
  { angle: "the artist", ask: (a) => `${a.artistName} musician: where they are from, background, members, earlier releases, career` },
];

// One web search, and the facts it supports about this album, each with its page.
async function search(album, step) {
  const payload = await openRouter({
    max_tokens: 7000,
    plugins: [{ id: "web", engine: "exa", max_results: RESULTS_PER_SEARCH }],
    messages: [
      { role: "system", content: `You research one album for a music game. ${identity(album)}
Use ONLY the web results you were given. Skip any result that is about a different album, a different artist with a similar name, or that you cannot tie to this album or artist. List concrete facts (genres, instruments, sound, tempo, mood, lyrical themes, recording place and process, producer, label, collaborators, reviews and scores, awards, charts, the artist's origin, age, members, history). One fact per item, in plain words, each with the exact URL it came from. Give at most 40 facts, the most specific and useful first, and do not repeat a fact. Reply with JSON only: {"facts": [{"fact": "...", "url": "https://..."}], "wrong_matches": ["url of a result that was about something else"]}.` },
      { role: "user", content: step.ask(album) },
    ],
  });
  const content = payload.choices?.[0]?.message?.content || "";
  const pages = (payload.choices?.[0]?.message?.annotations || [])
    .map((note) => note.url_citation?.url).filter(Boolean);
  // A fact counts only if its link is one of the pages the search returned.
  const plainUrl = (url) => String(url || "").replace(/#.*$/, "").replace(/\/$/, "").toLowerCase();
  const returned = new Set(pages.map(plainUrl));
  let parsed = { facts: [], wrong_matches: [] };
  try { parsed = parseJson(content); } catch { parsed.parseError = content.slice(0, 300); }
  const facts = (parsed.facts || [])
    .filter((item) => item?.fact && /^https?:\/\//.test(item.url || "") && returned.has(plainUrl(item.url)))
    .map((item) => ({ fact: String(item.fact).trim().slice(0, 400), url: item.url, angle: step.angle }));
  return { facts, pages, wrongMatches: parsed.wrong_matches || [], cost: Number(payload.usage?.cost || 0), raw: payload };
}

// The write-up, from the gathered facts and what the database already knows.
async function write(album, facts) {
  const payload = await openRouter({
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `You write a dense fact sheet about one album for a guessing game in which players ask yes-or-no questions such as "is it chill?", "are there horns?", "is it a debut?", "is it about a breakup?", "did it get great reviews?". ${identity(album)}
Write ONLY from the numbered facts and the database facts you are given; never add anything from memory. Where facts disagree, prefer the more specific source and mention the disagreement. Write in plain, compact sentences, 2 to 5 per section, packed with concrete details. Do not mention fact numbers or sources in the text. If no fact covers a section, write exactly "Not found in the sources."
Sections:
- "sound": genre and style, tempo and energy, instruments, vocals, production, comparisons to other artists.
- "mood_and_themes": how it feels (e.g. calm, sad, joyful, angry, danceable) and what the songs are about.
- "story": debut or which album in the career, when, where and how it was recorded, producer, label, collaborators and guests.
- "reception": reviews, scores, awards, chart positions, notable praise or criticism.
- "artist": who the artist is: origin, members, age or birth year, background, career so far.
Also give "unknowns": short questions a player might ask that the facts cannot answer, and "sources": the URLs of the facts you used.
Reply with JSON only: {"sound": "...", "mood_and_themes": "...", "story": "...", "reception": "...", "artist": "...", "unknowns": ["..."], "sources": ["..."]}` },
      { role: "user", content: JSON.stringify({
        database_facts: { title: album.name, artist: album.artistName, released: album.releaseDate, tracks: album.tracks,
          lastfm_tags: album.tags, artist_from: album.place, artist_type: album.artistType, artist_bio: album.bio, album_wiki: album.wiki },
        facts: facts.map((item, index) => ({ n: index + 1, ...item })),
      }) },
    ],
  });
  const data = parseJson(payload.choices?.[0]?.message?.content);
  const known = new Set(facts.map((item) => item.url));
  // Fact numbers like "(facts 3, 4)" help nobody who reads the text, so they are removed.
  const withoutFactNumbers = (text) => String(text).replace(/\s*\((?:facts?|sources?)\s[\d,\s]*(?:and\s\d+)?\)/gi, "").trim();
  const sections = Object.fromEntries(SECTIONS.map((name) => [name,
    withoutFactNumbers(data[name] || "Not found in the sources.").slice(0, 1500)]));
  return {
    sections,
    unknowns: (data.unknowns || []).map(String).slice(0, 8),
    // Only links that came from the searches count as sources.
    sources: [...new Set((data.sources || []).filter((url) => known.has(url)))],
    cost: Number(payload.usage?.cost || 0),
    raw: payload,
  };
}

async function research(album) {
  const gathered = [];
  let cost = 0;
  const raws = [];
  for (const step of SEARCHES) {
    const result = await search(album, step);
    gathered.push(...result.facts);
    cost += result.cost;
    raws.push({ angle: step.angle, pages: result.pages, wrongMatches: result.wrongMatches, raw: result.raw });
  }
  const facts = [...new Map(gathered.map((item) => [item.fact.toLowerCase(), item])).values()];
  const written = await write(album, facts);
  cost += written.cost;
  mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(path.join(RAW_DIR, `${album.spotifyId}.json`), JSON.stringify({ album: album.name, searches: raws, write: written.raw }, null, 2));
  return {
    research: { ...written.sections, unknowns: written.unknowns, sources: written.sources, facts, model: MODEL },
    cost,
    pages: raws.reduce((sum, item) => sum + item.pages.length, 0),
  };
}

// The albums to research.
const parse = (json) => { try { return JSON.parse(json || "null"); } catch { return null; } };
const ids = (option("--ids") || "").split(",").map((id) => id.trim()).filter(Boolean);
const lowest = Number(option("--lowest")) || 0;
const group = option("--group") || (lowest ? "badabing" : "");
if ((group && !/^[a-z0-9-]+$/.test(group)) || ids.some((id) => !/^[A-Za-z0-9]+$/.test(id))) throw new Error("Bad --group or --ids.");
const where = ids.length ? `a.spotify_id IN (${ids.map(sqlText).join(", ")})`
  : group ? `a.spotify_id IN (SELECT li.spotify_album_id FROM record_list_items li JOIN record_users u ON u.id = li.user_id WHERE u.group_id = ${sqlText(group)})`
    : "a.spotify_id IN (SELECT spotify_album_id FROM record_list_items)";
let albums = d1Query(`SELECT a.spotify_id AS spotifyId, a.name, a.artist_name AS artistName, a.release_date AS releaseDate,
    a.lastfm_listeners AS listeners, a.lastfm_tags_json AS tagsJson, f.facts_json AS factsJson
  FROM record_albums a
  LEFT JOIN record_album_facts f ON f.spotify_album_id = a.spotify_id
  LEFT JOIN record_album_research r ON r.spotify_album_id = a.spotify_id
  WHERE ${where} ${force || ids.length ? "" : "AND r.spotify_album_id IS NULL"} ${lowest ? "AND a.lastfm_listeners IS NOT NULL" : ""}
  ORDER BY COALESCE(a.lastfm_listeners, 0) ASC`);
if (lowest) albums = albums.filter((album) => !/^various artists$/i.test(album.artistName)).slice(0, lowest);
const tracks = albums.length ? d1Query(`SELECT at.spotify_album_id AS id, t.name FROM record_album_tracks at
  JOIN record_tracks t ON t.spotify_id = at.spotify_track_id
  WHERE at.spotify_album_id IN (${albums.map((album) => sqlText(album.spotifyId)).join(", ")})
  ORDER BY at.disc_number, at.track_number`) : [];
albums = albums.map((album) => {
  const facts = parse(album.factsJson) || {};
  return {
    ...album,
    tracks: tracks.filter((track) => track.id === album.spotifyId).map((track) => track.name),
    tags: (parse(album.tagsJson) || []).filter((tag) => Number(tag.count) >= 3).slice(0, 8).map((tag) => tag.name),
    place: facts.artist?.area || null,
    artistType: facts.artist?.type || null,
    bio: facts.artist?.bio || null,
    wiki: facts.albumWiki || null,
  };
});
console.log(`Researching ${albums.length} albums with ${MODEL}${dryRun ? " (dry run)" : ""}.`);

let total = 0;
const statements = [];
await mapLimit(albums, 3, async (album) => {
  try {
    const { research: result, cost, pages } = await research(album);
    total += cost;
    const found = SECTIONS.filter((name) => !result[name].startsWith("Not found")).length;
    console.log(`✓ ${album.artistName} — ${album.name}: ${result.facts.length} facts from ${pages} pages, ${found}/5 sections, $${cost.toFixed(4)}`);
    if (dryRun) console.log(JSON.stringify(result, null, 2));
    statements.push(`INSERT OR REPLACE INTO record_album_research (spotify_album_id, research_json, model, researched_at)
      VALUES (${sqlText(album.spotifyId)}, ${sqlText(JSON.stringify(result))}, ${sqlText(MODEL)}, ${sqlText(new Date().toISOString())})`);
  } catch (error) {
    console.warn(`× ${album.artistName} — ${album.name}: ${error.message}`);
  }
});
if (!dryRun && statements.length) d1Write(statements, { slice: 20 });
console.log(`${dryRun ? "Researched" : "Saved"} ${statements.length}; cost $${total.toFixed(3)}.`);
