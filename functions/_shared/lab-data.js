import { RECORD_SEASON } from "./records-config.js";

// Database reads shared by the lab games: one group's records with their cover descriptions
// and looked-up facts, who picked what, and the notes, hearts and track names around them.

export async function loadGroupAlbums(db, groupId) {
  const result = await db.prepare(
    `SELECT
       a.spotify_id AS spotifyId,
       a.name,
       a.artist_name AS artistName,
       a.image_url AS imageUrl,
       a.spotify_url AS spotifyUrl,
       a.release_date AS releaseDate,
       a.album_type AS albumType,
       a.total_tracks AS totalTracks,
       a.total_duration_ms AS totalDurationMs,
       a.explicit_track_count AS explicitTrackCount,
       a.metadata_enriched_at AS metadataEnrichedAt,
       a.lastfm_listeners AS lastfmListeners,
       a.lastfm_tags_json AS lastfmTagsJson,
       a.language,
       d.description_json AS descriptionJson,
       f.facts_json AS factsJson
     FROM record_albums a
     LEFT JOIN record_cover_descriptions d ON d.spotify_album_id = a.spotify_id
     LEFT JOIN record_album_facts f ON f.spotify_album_id = a.spotify_id
     WHERE a.image_url IS NOT NULL
       AND trim(a.image_url) <> ''
       AND a.spotify_id IN (
         SELECT li.spotify_album_id
         FROM record_list_items li
         JOIN record_users u ON u.id = li.user_id
         WHERE li.season = ? AND u.group_id = ?
       )`,
  ).bind(RECORD_SEASON, groupId).all();
  // Enrichment counts explicit tracks; before it, the column's default 0 means "unknown".
  return (result.results || []).map((album) => ({
    ...album,
    explicitTrackCount: album.metadataEnrichedAt ? album.explicitTrackCount : null,
  }));
}

export async function loadGroupPicks(db, groupId) {
  const result = await db.prepare(
    `SELECT li.spotify_album_id AS spotifyId, u.id AS userId, u.username, li.review
     FROM record_list_items li
     JOIN record_users u ON u.id = li.user_id
     WHERE li.season = ? AND u.group_id = ?
     ORDER BY u.username COLLATE NOCASE`,
  ).bind(RECORD_SEASON, groupId).all();
  return result.results || [];
}

export async function loadGroupFavorites(db, groupId) {
  const result = await db.prepare(
    `SELECT f.spotify_album_id AS spotifyId, u.username, t.name AS trackName
     FROM record_track_favorites f
     JOIN record_users u ON u.id = f.user_id
     JOIN record_tracks t ON t.spotify_id = f.spotify_track_id
     WHERE f.season = ? AND u.group_id = ?`,
  ).bind(RECORD_SEASON, groupId).all();
  return result.results || [];
}

// Map(albumId -> track names in album order), for at most 90 albums at a time.
export async function loadTrackNames(db, albumIds) {
  const names = new Map();
  const ids = [...new Set(albumIds)].slice(0, 90);
  if (!ids.length) return names;
  const result = await db.prepare(
    `SELECT at.spotify_album_id AS albumId, t.name
     FROM record_album_tracks at
     JOIN record_tracks t ON t.spotify_id = at.spotify_track_id
     WHERE at.spotify_album_id IN (${ids.map(() => "?").join(", ")})
     ORDER BY at.spotify_album_id, at.disc_number, at.track_number`,
  ).bind(...ids).all();
  for (const row of result.results || []) {
    if (!names.has(row.albumId)) names.set(row.albumId, []);
    names.get(row.albumId).push(row.name);
  }
  return names;
}

export function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

export const listHref = (username) => `/records/lists/?member=${encodeURIComponent(username)}`;
