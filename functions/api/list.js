import { requireUser } from "../_shared/auth.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../_shared/http.js";
import { getSpotifyAlbum } from "../_shared/spotify.js";

const SEASON = 2026;

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(env, request);
    const db = requireDb(env);
    const result = await db.prepare(
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
    ).bind(user.id, SEASON).all();

    return json({ season: SEASON, items: result.results || [] });
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
    if (!Array.isArray(body.items) || body.items.length > 10) {
      throw new HttpError("A draft can contain up to ten albums.", 400, "invalid_list");
    }

    const items = body.items.map((item, index) => ({
      spotifyId: String(item.spotifyId || "").trim(),
      review: String(item.review || "").trim(),
      rank: index + 1,
    }));
    const uniqueIds = new Set(items.map((item) => item.spotifyId));
    if (uniqueIds.size !== items.length || items.some((item) => !/^[A-Za-z0-9]+$/.test(item.spotifyId))) {
      throw new HttpError("Each list entry must be a different Spotify album.", 400, "invalid_albums");
    }
    if (items.some((item) => item.review.length > 500)) {
      throw new HttpError("Keep each review to 500 characters or fewer.", 400, "review_too_long");
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

    const now = new Date().toISOString();
    const statements = [
      db.prepare("DELETE FROM record_list_items WHERE user_id = ? AND season = ?").bind(user.id, SEASON),
    ];

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

    for (const item of items) {
      statements.push(db.prepare(
        `INSERT INTO record_list_items
           (user_id, season, rank, spotify_album_id, review, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(user.id, SEASON, item.rank, item.spotifyId, item.review, now, now));
    }

    await db.batch(statements);
    return json({ ok: true, season: SEASON, savedAt: now, items: items.length });
  } catch (error) {
    return handleApiError(error);
  }
}
