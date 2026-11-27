import { coverClusters } from "./cover-clusters.js";
import { RECORD_SEASON } from "./records-config.js";

// The "Cover twins" Liner Notes slide: album art that had the same idea, grouped into named
// clusters (the smoking section, the petting zoo…) from the cover descriptions. See
// cover-clusters.js for the rules.
export async function coverTwinsCard(db, groupId) {
  const result = await db.prepare(
    `SELECT li.spotify_album_id AS spotifyId, u.username,
       a.name, a.artist_name AS artistName, a.image_url AS imageUrl, a.spotify_url AS spotifyUrl,
       a.release_date AS releaseDate, a.total_tracks AS totalTracks, a.total_duration_ms AS totalDurationMs,
       d.description_json AS descriptionJson
     FROM record_list_items li
     JOIN record_users u ON u.id = li.user_id
     JOIN record_albums a ON a.spotify_id = li.spotify_album_id
     JOIN record_cover_descriptions d ON d.spotify_album_id = li.spotify_album_id
     WHERE li.season = ? AND u.group_id = ? AND a.image_url IS NOT NULL
     ORDER BY u.username COLLATE NOCASE`,
  ).bind(RECORD_SEASON, groupId).all();
  return coverTwinsFromRows(result.results || []);
}

export function coverTwinsFromRows(rows) {
  const albums = new Map();
  for (const row of rows) {
    if (!albums.has(row.spotifyId)) {
      let description = null;
      try {
        description = JSON.parse(row.descriptionJson || "null");
      } catch {
        description = null;
      }
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
        description,
      });
    }
    const album = albums.get(row.spotifyId);
    if (!album.pickers.includes(row.username)) album.pickers.push(row.username);
  }
  const clusters = coverClusters([...albums.values()]);
  if (clusters.length < 2) return null;

  const record = ({ description, ...album }) => album;
  const view = (cluster) => ({
    stat: { value: cluster.records.length, unit: `covers ${cluster.unit}` },
    records: cluster.records.map(record),
  });
  return {
    id: "cover-twins",
    title: "Cover twins.",
    lede: "Album art that had the same idea. Pick a cluster.",
    detail: "",
    ...view(clusters[0]),
    notes: [],
    wordMap: [],
    links: [],
    status: "",
    cast: [],
    ranking: clusters.map((cluster, index) => ({
      name: cluster.name,
      value: cluster.records.length,
      display: String(cluster.records.length),
      highlight: index === 0,
      sub: cluster.pickers.join(", "),
      imageUrl: cluster.records[0].imageUrl,
      people: cluster.pickers,
      view: view(cluster),
    })),
    unranked: true,
    mix: [],
    timeline: null,
    chips: [],
    fact: "",
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
