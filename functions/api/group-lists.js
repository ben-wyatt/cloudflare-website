import { requireRecordClubOwner, requireUser } from "../_shared/auth.js";
import { HttpError, handleApiError, json, requireDb } from "../_shared/http.js";
import { RECORD_SEASON } from "../_shared/records-config.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(env, request);
    requireRecordClubOwner(user);
    if (!user.groupId) throw new HttpError("This account is not in a Record Club group.", 403, "group_required");
    const db = requireDb(env);
    const [members, albums, standouts, favorites] = await db.batch([
      db.prepare(
        `SELECT id AS userId, username
         FROM record_users WHERE group_id = ?
         ORDER BY username COLLATE NOCASE`,
      ).bind(user.groupId),
      db.prepare(
        `SELECT u.id AS userId, li.review,
           a.spotify_id AS spotifyId, a.name, a.artist_name AS artistName,
           a.image_url AS imageUrl, a.spotify_url AS spotifyUrl,
           a.release_date AS releaseDate
         FROM record_list_items li
         JOIN record_users u ON u.id = li.user_id
         JOIN record_albums a ON a.spotify_id = li.spotify_album_id
         WHERE u.group_id = ? AND li.season = ?
         ORDER BY u.username COLLATE NOCASE, lower(a.artist_name), lower(a.name), a.spotify_id`,
      ).bind(user.groupId, RECORD_SEASON),
      db.prepare(
        `SELECT u.id AS userId, st.review,
           t.spotify_id AS spotifyId, t.name, t.artist_name AS artistName,
           t.album_name AS albumName, t.image_url AS imageUrl,
           t.spotify_url AS spotifyUrl
         FROM record_standout_tracks st
         JOIN record_users u ON u.id = st.user_id
         JOIN record_tracks t ON t.spotify_id = st.spotify_track_id
         WHERE u.group_id = ? AND st.season = ?
         ORDER BY u.username COLLATE NOCASE, lower(t.artist_name), lower(t.name), t.spotify_id`,
      ).bind(user.groupId, RECORD_SEASON),
      db.prepare(
        `SELECT u.id AS userId, f.spotify_album_id AS albumSpotifyId,
           f.spotify_track_id AS spotifyId, t.name,
           t.artist_name AS artistName, t.spotify_url AS spotifyUrl
         FROM record_track_favorites f
         JOIN record_users u ON u.id = f.user_id
         LEFT JOIN record_tracks t ON t.spotify_id = f.spotify_track_id
         WHERE u.group_id = ? AND f.season = ?
         ORDER BY u.username COLLATE NOCASE, f.spotify_album_id, f.spotify_track_id`,
      ).bind(user.groupId, RECORD_SEASON),
    ]);
    return json({
      season: RECORD_SEASON,
      groupId: user.groupId,
      members: members.results || [],
      albums: albums.results || [],
      standouts: standouts.results || [],
      favorites: favorites.results || [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
