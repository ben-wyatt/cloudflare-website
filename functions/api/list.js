import { requireUser } from "../_shared/auth.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../_shared/http.js";
import { getSpotifyAlbum, getSpotifyTrack } from "../_shared/spotify.js";

const SEASON = 2026;
const MAX_ALBUMS = 14;
const MAX_FAVORITE_TRACKS_PER_ALBUM = 50;

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(env, request);
    const db = requireDb(env);
    const [listResult, standoutsResult, favoritesResult] = await db.batch([
      db.prepare(
        `SELECT
           li.rank,
           li.review,
           a.spotify_id AS spotifyId,
           a.name,
           a.artist_name AS artistName,
           a.image_url AS imageUrl,
           a.spotify_url AS spotifyUrl,
           a.release_date AS releaseDate,
           a.total_tracks AS totalTracks
         FROM record_list_items li
         JOIN record_albums a ON a.spotify_id = li.spotify_album_id
         WHERE li.user_id = ? AND li.season = ?
         ORDER BY li.rank ASC`,
      ).bind(user.id, SEASON),
      db.prepare(
        `SELECT
           st.rank,
           st.review,
           t.spotify_id AS spotifyId,
           t.name,
           t.artist_name AS artistName,
           t.album_name AS albumName,
           t.album_spotify_id AS albumSpotifyId,
           t.image_url AS imageUrl,
           t.spotify_url AS spotifyUrl,
           t.duration_ms AS durationMs,
           t.explicit
         FROM record_standout_tracks st
         JOIN record_tracks t ON t.spotify_id = st.spotify_track_id
         WHERE st.user_id = ? AND st.season = ?
         ORDER BY st.rank ASC`,
      ).bind(user.id, SEASON),
      db.prepare(
        `SELECT
           spotify_album_id AS spotifyAlbumId,
           spotify_track_id AS spotifyTrackId
         FROM record_track_favorites
         WHERE user_id = ? AND season = ?
         ORDER BY created_at ASC`,
      ).bind(user.id, SEASON),
    ]);

    const favoriteIdsByAlbum = new Map();
    for (const favorite of favoritesResult.results || []) {
      const albumFavorites = favoriteIdsByAlbum.get(favorite.spotifyAlbumId) || [];
      albumFavorites.push(favorite.spotifyTrackId);
      favoriteIdsByAlbum.set(favorite.spotifyAlbumId, albumFavorites);
    }
    const items = (listResult.results || []).map((item) => ({
      ...item,
      favoriteTrackIds: favoriteIdsByAlbum.get(item.spotifyId) || [],
    }));

    const standouts = (standoutsResult.results || []).map((track) => ({
      ...track,
      type: "track",
      explicit: Boolean(track.explicit),
    }));

    return json({ season: SEASON, items, standouts });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(env, request);
    const db = requireDb(env);
    const body = await readJson(request);
    if (!Array.isArray(body.items) || body.items.length > MAX_ALBUMS) {
      throw new HttpError(`A draft can contain up to ${MAX_ALBUMS} albums.`, 400, "invalid_list");
    }
    const includesStandouts = body.standouts !== undefined;
    if (includesStandouts && !Array.isArray(body.standouts)) {
      throw new HttpError("Standout tracks must be a list.", 400, "invalid_standouts");
    }

    const items = body.items.map((item, index) => {
      const value = item && typeof item === "object" ? item : {};
      if (value.favoriteTrackIds !== undefined && !Array.isArray(value.favoriteTrackIds)) {
        throw new HttpError("Favorite tracks must be a list of Spotify track IDs.", 400, "invalid_tracks");
      }
      const favoriteTrackIds = [...new Set(
        (value.favoriteTrackIds || []).map((trackId) => String(trackId || "").trim()),
      )];
      if (favoriteTrackIds.length > MAX_FAVORITE_TRACKS_PER_ALBUM) {
        throw new HttpError(
          `Choose up to ${MAX_FAVORITE_TRACKS_PER_ALBUM} favorite tracks per album.`,
          400,
          "too_many_tracks",
        );
      }
      if (favoriteTrackIds.some((trackId) => !/^[A-Za-z0-9]+$/.test(trackId))) {
        throw new HttpError("Each favorite track must have a valid Spotify track ID.", 400, "invalid_tracks");
      }
      return {
        spotifyId: String(value.spotifyId || "").trim(),
        review: String(value.review || "").trim(),
        favoriteTrackIds,
        rank: index + 1,
      };
    });
    const uniqueIds = new Set(items.map((item) => item.spotifyId));
    if (uniqueIds.size !== items.length || items.some((item) => !/^[A-Za-z0-9]+$/.test(item.spotifyId))) {
      throw new HttpError("Each list entry must be a different Spotify album.", 400, "invalid_albums");
    }
    if (items.some((item) => item.review.length > 500)) {
      throw new HttpError("Keep each review to 500 characters or fewer.", 400, "review_too_long");
    }

    const standouts = (body.standouts || []).map((item, index) => {
      const value = item && typeof item === "object" ? item : {};
      return {
        spotifyId: String(value.spotifyId || "").trim(),
        review: String(value.review || "").trim(),
        rank: index + 1,
      };
    });
    const uniqueTrackIds = new Set(standouts.map((item) => item.spotifyId));
    if (
      uniqueTrackIds.size !== standouts.length
      || standouts.some((item) => !/^[A-Za-z0-9]+$/.test(item.spotifyId))
    ) {
      throw new HttpError("Each standout must be a different Spotify track.", 400, "invalid_standouts");
    }
    if (standouts.some((item) => item.review.length > 500)) {
      throw new HttpError("Keep each track note to 500 characters or fewer.", 400, "review_too_long");
    }

    const albums = await Promise.all(items.map(async (item) => {
      const cached = await db.prepare(
        `SELECT
           spotify_id AS spotifyId,
           name,
           artist_name AS artistName,
           image_url AS imageUrl,
           spotify_url AS spotifyUrl,
           release_date AS releaseDate,
           total_tracks AS totalTracks
         FROM record_albums WHERE spotify_id = ?`,
      ).bind(item.spotifyId).first();
      return cached || getSpotifyAlbum(env, item.spotifyId);
    }));
    const tracks = includesStandouts ? await Promise.all(standouts.map(async (item) => {
      const cached = await db.prepare(
        `SELECT
           spotify_id AS spotifyId,
           name,
           artist_name AS artistName,
           album_name AS albumName,
           album_spotify_id AS albumSpotifyId,
           image_url AS imageUrl,
           spotify_url AS spotifyUrl,
           duration_ms AS durationMs,
           explicit
         FROM record_tracks WHERE spotify_id = ?`,
      ).bind(item.spotifyId).first();
      if (cached) return { ...cached, explicit: Boolean(cached.explicit) };
      return getSpotifyTrack(env, item.spotifyId);
    })) : [];

    const now = new Date().toISOString();
    const statements = [
      db.prepare("DELETE FROM record_track_favorites WHERE user_id = ? AND season = ?").bind(user.id, SEASON),
      db.prepare("DELETE FROM record_list_items WHERE user_id = ? AND season = ?").bind(user.id, SEASON),
    ];
    if (includesStandouts) {
      statements.push(
        db.prepare("DELETE FROM record_standout_tracks WHERE user_id = ? AND season = ?")
          .bind(user.id, SEASON),
      );
    }

    for (const album of albums) {
      statements.push(db.prepare(
        `INSERT INTO record_albums
           (spotify_id, name, artist_name, image_url, spotify_url, release_date, total_tracks, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(spotify_id) DO UPDATE SET
           name = excluded.name,
           artist_name = excluded.artist_name,
           image_url = excluded.image_url,
           spotify_url = excluded.spotify_url,
           release_date = excluded.release_date,
           total_tracks = excluded.total_tracks,
           updated_at = excluded.updated_at`,
      ).bind(
        album.spotifyId,
        album.name,
        album.artistName,
        album.imageUrl,
        album.spotifyUrl,
        album.releaseDate,
        album.totalTracks,
        now,
        now,
      ));
    }

    for (const track of tracks) {
      statements.push(db.prepare(
        `INSERT INTO record_tracks
           (spotify_id, name, artist_name, album_name, album_spotify_id, image_url, spotify_url,
            duration_ms, explicit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(spotify_id) DO UPDATE SET
           name = excluded.name,
           artist_name = excluded.artist_name,
           album_name = excluded.album_name,
           album_spotify_id = excluded.album_spotify_id,
           image_url = excluded.image_url,
           spotify_url = excluded.spotify_url,
           duration_ms = excluded.duration_ms,
           explicit = excluded.explicit,
           updated_at = excluded.updated_at`,
      ).bind(
        track.spotifyId,
        track.name,
        track.artistName,
        track.albumName,
        track.albumSpotifyId || null,
        track.imageUrl,
        track.spotifyUrl,
        track.durationMs,
        track.explicit ? 1 : 0,
        now,
        now,
      ));
    }

    for (const item of items) {
      statements.push(db.prepare(
        `INSERT INTO record_list_items
           (user_id, season, rank, spotify_album_id, review, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(user.id, SEASON, item.rank, item.spotifyId, item.review, now, now));
    }

    for (const item of standouts) {
      statements.push(db.prepare(
        `INSERT INTO record_standout_tracks
           (user_id, season, rank, spotify_track_id, review, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(user.id, SEASON, item.rank, item.spotifyId, item.review, now, now));
    }

    for (const item of items) {
      for (const trackId of item.favoriteTrackIds) {
        statements.push(db.prepare(
          `INSERT INTO record_track_favorites
             (user_id, season, spotify_album_id, spotify_track_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(user.id, SEASON, item.spotifyId, trackId, now));
      }
    }

    await db.batch(statements);
    return json({
      ok: true,
      season: SEASON,
      savedAt: now,
      items: items.length,
      standouts: includesStandouts ? standouts.length : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
