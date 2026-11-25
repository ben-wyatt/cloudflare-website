// Turn the cover descriptions into look-alike data for the Cover twins Wrapped slide, and
// save it to the remote D1:
//   1. embed each description with the local bge-small model (nothing leaves this machine),
//   2. record_cover_neighbors: each cover's 30 closest covers,
//   3. record_cover_pairs: for each group, the most alike covers picked by different people,
//      with one line from a text model on what they share.
//   node scripts/cover-similarity.mjs             (everything)
//   node scripts/cover-similarity.mjs --dry-run   (compute and print, save nothing)
// A preview page of the pairs is written to PREVIEW_DIR for a look.
// The text model sees only cover descriptions. Uses OPENROUTER_API_KEY.
// (Crates puzzles are written by hand and loaded with scripts/load-crates.mjs.)
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { lookAlikePairs, nearest, similarityMatrix } from "./lib/cover-neighbors.mjs";
import { d1Query, d1Write, openRouterJson, sqlNumber, sqlText } from "./lib/remote-d1.mjs";

const TEXT_MODEL = "deepseek/deepseek-v4.1-flash";
const EMBED_MODEL = "Xenova/bge-small-en-v1.5";
const SEASON = 2026;
const NEIGHBORS = 30;
const PAIRS_PER_GROUP = 8;
const PREVIEW_DIR = path.join(homedir(), "Agent", "artifacts", "record-club-covers");
const dryRun = process.argv.includes("--dry-run");

// The words that describe how a cover looks. The printed text is left out on purpose:
// two covers that both say "Live" should not count as alike.
function lookText(d) {
  return [
    d.description,
    `Main subject: ${d.subject}.`,
    `Colors: ${(d.palette || []).join(", ")}.`,
    `Medium: ${d.medium}. Style: ${d.style}. Mood: ${d.mood}.`,
  ].join(" ");
}

const rows = d1Query(`SELECT d.spotify_album_id AS spotifyId, d.description_json AS json,
    a.name, a.artist_name AS artistName, a.image_url AS imageUrl
  FROM record_cover_descriptions d JOIN record_albums a ON a.spotify_id = d.spotify_album_id
  ORDER BY d.spotify_album_id`);
const albums = rows.map((row) => ({ ...row, description: JSON.parse(row.json) }));
const indexById = new Map(albums.map((album, index) => [album.spotifyId, index]));
console.log(`Embedding ${albums.length} cover descriptions with ${EMBED_MODEL}.`);

const { pipeline } = await import("@xenova/transformers");
const embed = await pipeline("feature-extraction", EMBED_MODEL);
const vectors = [];
for (const album of albums) {
  const output = await embed(lookText(album.description), { pooling: "mean", normalize: true });
  vectors.push(Float32Array.from(output.data));
}
const matrix = similarityMatrix(vectors);

const picks = d1Query(`SELECT u.group_id AS groupId, li.user_id AS userId, u.username, li.spotify_album_id AS spotifyId
  FROM record_list_items li JOIN record_users u ON u.id = li.user_id
  WHERE li.season = ${SEASON} AND u.group_id IS NOT NULL`);
const groups = new Map();
for (const pick of picks) {
  const index = indexById.get(pick.spotifyId);
  if (index === undefined) continue;
  if (!groups.has(pick.groupId)) groups.set(pick.groupId, { indexes: new Set(), pickers: new Map(), names: new Map() });
  const group = groups.get(pick.groupId);
  group.indexes.add(index);
  if (!group.pickers.has(index)) group.pickers.set(index, new Set());
  group.pickers.get(index).add(pick.userId);
  if (!group.names.has(index)) group.names.set(index, []);
  group.names.get(index).push(pick.username);
}

const statements = ["DELETE FROM record_cover_neighbors"];
albums.forEach((album, index) => {
  for (const [other, similarity] of nearest(matrix, index, NEIGHBORS)) {
    statements.push(`INSERT INTO record_cover_neighbors (spotify_album_id, neighbor_album_id, similarity)
      VALUES (${sqlText(album.spotifyId)}, ${sqlText(albums[other].spotifyId)}, ${sqlNumber(similarity.toFixed(5))})`);
  }
});

const brief = (index) => {
  const d = albums[index].description;
  return `${d.description} (Colors: ${(d.palette || []).join(", ")}; ${d.medium}; ${d.style}.)`;
};

async function pairReasons(pairs) {
  const { data, cost } = await openRouterJson({
    model: TEXT_MODEL,
    maxTokens: 1200,
    messages: [
      { role: "system", content: `You compare album covers from written descriptions. For each pair, write one plain sentence of at most 16 words on what the two covers visibly share, the way a friend would point it out. Start with "Both". Never name albums, artists or people. Reply with JSON: {"pairs": [{"id": "...", "reason": "..."}]}.` },
      { role: "user", content: JSON.stringify(pairs.map((pair, n) => ({ id: String(n), first: brief(pair.i), second: brief(pair.j) }))) },
    ],
  });
  const reasons = new Map((data?.pairs || []).map((item) => [String(item.id), String(item.reason || "").trim().slice(0, 160)]));
  return { reasons: pairs.map((_, n) => reasons.get(String(n)) || ""), cost };
}

const albumCard = (index) => ({
  spotifyId: albums[index].spotifyId,
  name: albums[index].name,
  artistName: albums[index].artistName,
  imageUrl: albums[index].imageUrl,
});

let cost = 0;
const preview = [];
const now = new Date().toISOString();
for (const [groupId, group] of groups) {
  const indexes = [...group.indexes];
  if (indexes.length < 16) continue;
  const pairs = lookAlikePairs(matrix, indexes, group.pickers, PAIRS_PER_GROUP);
  const { reasons, cost: pairCost } = await pairReasons(pairs);
  cost += pairCost;
  pairs.forEach((pair, n) => {
    const [a, b] = [albums[pair.i].spotifyId, albums[pair.j].spotifyId].sort();
    statements.push(`INSERT OR REPLACE INTO record_cover_pairs (album_a, album_b, similarity, reason, model, created_at)
      VALUES (${sqlText(a)}, ${sqlText(b)}, ${sqlNumber(pair.similarity.toFixed(5))}, ${sqlText(reasons[n])}, ${sqlText(TEXT_MODEL)}, ${sqlText(now)})`);
  });
  console.log(`${groupId}: ${indexes.length} covers, ${pairs.length} pairs`);
  preview.push({ groupId, pairs: pairs.map((pair, n) => ({ similarity: pair.similarity, reason: reasons[n],
    left: { ...albumCard(pair.i), pickers: group.names.get(pair.i) }, right: { ...albumCard(pair.j), pickers: group.names.get(pair.j) } })) });
}

if (!dryRun) d1Write(statements, { slice: 300 });
console.log(`${dryRun ? "Computed" : "Saved"} ${statements.length} statements; text model cost $${cost.toFixed(4)}.`);

// A plain preview page, for checking the pairs by eye.
const escape = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
const img = (album) => `<img src="${escape(album.imageUrl)}" alt="" title="${escape(`${album.name} — ${album.artistName}`)}">`;
const html = `<!doctype html><meta charset="utf-8"><title>Cover look-alikes</title>
<style>body{font:14px/1.4 ui-monospace,monospace;margin:2rem;background:#faf8f4}img{width:110px;height:110px;object-fit:cover;margin:2px}
.pair{display:flex;align-items:center;gap:1rem;margin:.4rem 0}</style>
${preview.map((group) => `<h1>${escape(group.groupId)}</h1>
${group.pairs.map((pair) => `<div class="pair">${img(pair.left)}${img(pair.right)}<div><b>${pair.similarity.toFixed(3)}</b> ${escape(pair.left.pickers.join(", "))} × ${escape(pair.right.pickers.join(", "))}<br>${escape(pair.reason)}</div></div>`).join("")}`).join("")}`;
mkdirSync(PREVIEW_DIR, { recursive: true });
writeFileSync(path.join(PREVIEW_DIR, "preview.html"), html);
console.log(`Preview: ${path.join(PREVIEW_DIR, "preview.html")}`);
