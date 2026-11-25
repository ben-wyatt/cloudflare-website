import { RECORD_SEASON } from "./records-config.js";

// The "Cover twins" Wrapped slide: the most alike album art in a group, picked by different
// people. Similarity comes from the cover descriptions (scripts/cover-similarity.mjs), which
// also wrote one line on what each pair shares. Shown only to the lab account for now.
const PAIRS_SHOWN = 5;

export async function coverTwinsCard(db, groupId) {
  const [pairsResult, picksResult] = await db.batch([
    db.prepare(
      `WITH group_albums AS (
         SELECT DISTINCT li.spotify_album_id AS id
         FROM record_list_items li
         JOIN record_users u ON u.id = li.user_id
         WHERE li.season = ? AND u.group_id = ?
       )
       SELECT p.album_a AS albumA, p.album_b AS albumB, p.similarity, p.reason
       FROM record_cover_pairs p
       WHERE p.album_a IN (SELECT id FROM group_albums)
         AND p.album_b IN (SELECT id FROM group_albums)
         AND trim(p.reason) <> ''
       ORDER BY p.similarity DESC
       LIMIT 20`,
    ).bind(RECORD_SEASON, groupId),
    db.prepare(
      `SELECT li.spotify_album_id AS spotifyId, u.username,
         a.name, a.artist_name AS artistName, a.image_url AS imageUrl, a.spotify_url AS spotifyUrl,
         a.release_date AS releaseDate, a.total_tracks AS totalTracks, a.total_duration_ms AS totalDurationMs
       FROM record_list_items li
       JOIN record_users u ON u.id = li.user_id
       JOIN record_albums a ON a.spotify_id = li.spotify_album_id
       WHERE li.season = ? AND u.group_id = ?
       ORDER BY u.username COLLATE NOCASE`,
    ).bind(RECORD_SEASON, groupId),
  ]);

  const albums = new Map();
  for (const row of picksResult.results || []) {
    if (!albums.has(row.spotifyId)) {
      albums.set(row.spotifyId, {
        spotifyId: row.spotifyId,
        name: row.name,
        artistName: row.artistName,
        imageUrl: row.imageUrl || null,
        spotifyUrl: row.spotifyUrl || null,
        releaseDate: row.releaseDate || null,
        totalTracks: Number(row.totalTracks || 0),
        totalDurationMs: Number(row.totalDurationMs || 0),
        pickers: [],
      });
    }
    albums.get(row.spotifyId).pickers.push(row.username);
  }

  // Each record appears once, and a pair needs at least one picker the other record lacks.
  const used = new Set();
  const pairs = [];
  for (const row of pairsResult.results || []) {
    const left = albums.get(row.albumA);
    const right = albums.get(row.albumB);
    if (!left || !right || used.has(left.spotifyId) || used.has(right.spotifyId)) continue;
    const samePeople = left.pickers.length === right.pickers.length
      && left.pickers.every((name) => right.pickers.includes(name));
    if (samePeople) continue;
    used.add(left.spotifyId);
    used.add(right.spotifyId);
    pairs.push({ left, right, similarity: Number(row.similarity), reason: String(row.reason) });
    if (pairs.length >= PAIRS_SHOWN) break;
  }
  if (!pairs.length) return null;

  const ranking = pairs.map((pair, index) => ({
    name: `${pair.left.pickers.join(", ")} × ${pair.right.pickers.join(", ")}`,
    // Similarities sit close together; stretch them so the meters show the order.
    value: Math.max(0.05, (pair.similarity - 0.6) / 0.4),
    display: "",
    highlight: index === 0,
    sub: `${pair.left.name} · ${pair.right.name}`,
    imageUrl: null,
    view: { records: [pair.left, pair.right], fact: pair.reason },
  }));

  return {
    id: "cover-twins",
    title: "Cover twins.",
    lede: "The most alike album art in the room, picked by different people.",
    detail: "",
    records: [pairs[0].left, pairs[0].right],
    notes: [],
    wordMap: [],
    links: [],
    status: "",
    cast: [],
    stat: null,
    ranking,
    mix: [],
    timeline: null,
    chips: [],
    fact: pairs[0].reason,
    people: [],
  };
}

// Put the slide just before the last one ("Everyone's lists"), or at the end.
export function insertBeforeLast(cards, card) {
  if (!card || !Array.isArray(cards)) return cards;
  const last = cards.at(-1);
  if (last?.id === "everyone-lists") return [...cards.slice(0, -1), card, last];
  return [...cards, card];
}
