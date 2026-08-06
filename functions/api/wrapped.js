import { requireRecordClubOwner, requireUser } from "../_shared/auth.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../_shared/http.js";
import { enrichRecordAlbum } from "../_shared/record-metadata.js";
import { RECORD_SEASON } from "../_shared/records-config.js";
import {
  WRAPPED_ALGORITHM_VERSION,
  generateWrappedStats,
} from "../_shared/records-wrapped.js";

function requireGroup(user) {
  if (!user.groupId) {
    throw new HttpError("This account is not in a Record Club group.", 403, "group_required");
  }
}

async function getSeason(db, groupId) {
  const row = await db.prepare(
    `SELECT
       gs.status,
       gs.locks_at AS locksAt,
       gs.wrapped_at AS wrappedAt,
       g.name AS groupName
     FROM record_groups g
     LEFT JOIN record_group_seasons gs
       ON gs.group_id = g.id AND gs.season = ?
     WHERE g.id = ?`,
  ).bind(RECORD_SEASON, groupId).first();
  if (!row) throw new HttpError("That Record Club group could not be found.", 404, "group_not_found");
  const lockTimeReached = row.status === "open"
    && row.locksAt
    && Date.parse(row.locksAt) <= Date.now();
  return {
    status: lockTimeReached ? "locked" : row.status || "open",
    locksAt: row.locksAt || null,
    wrappedAt: row.wrappedAt || null,
    groupName: row.groupName,
  };
}

async function loadWrappedRows(db, groupId) {
  const [membersResult, picksResult, standoutsResult, favoritesResult, artistsResult] = await db.batch([
    db.prepare(
      `SELECT id AS userId, username
       FROM record_users
       WHERE group_id = ?
       ORDER BY username COLLATE NOCASE`,
    ).bind(groupId),
    db.prepare(
      `SELECT
         u.id AS userId,
         u.username,
         li.review,
         a.spotify_id AS spotifyId,
         a.name,
         a.artist_name AS artistName,
         a.image_url AS imageUrl,
         a.spotify_url AS spotifyUrl,
         a.release_date AS releaseDate,
         a.total_tracks AS totalTracks,
         a.total_duration_ms AS totalDurationMs,
         a.metadata_enriched_at AS metadataEnrichedAt
       FROM record_list_items li
       JOIN record_users u ON u.id = li.user_id
       JOIN record_albums a ON a.spotify_id = li.spotify_album_id
       WHERE li.season = ? AND u.group_id = ?
       ORDER BY u.username COLLATE NOCASE, lower(a.artist_name), lower(a.name), a.spotify_id`,
    ).bind(RECORD_SEASON, groupId),
    db.prepare(
      `SELECT
         u.id AS userId,
         u.username,
         st.review,
         t.spotify_id AS spotifyId,
         t.name,
         t.artist_name AS artistName,
         t.album_name AS albumName,
         t.album_spotify_id AS albumSpotifyId,
         t.image_url AS imageUrl,
         t.spotify_url AS spotifyUrl,
         t.duration_ms AS durationMs
       FROM record_standout_tracks st
       JOIN record_users u ON u.id = st.user_id
       JOIN record_tracks t ON t.spotify_id = st.spotify_track_id
       WHERE st.season = ? AND u.group_id = ?
       ORDER BY u.username COLLATE NOCASE, lower(t.artist_name), lower(t.name), t.spotify_id`,
    ).bind(RECORD_SEASON, groupId),
    db.prepare(
      `SELECT
         u.id AS userId,
         u.username,
         f.spotify_album_id AS spotifyAlbumId,
         f.spotify_track_id AS spotifyTrackId,
         t.name AS trackName,
         t.artist_name AS trackArtistName,
         t.spotify_url AS trackSpotifyUrl
       FROM record_track_favorites f
       JOIN record_users u ON u.id = f.user_id
       LEFT JOIN record_tracks t ON t.spotify_id = f.spotify_track_id
       WHERE f.season = ? AND u.group_id = ?
       ORDER BY f.spotify_album_id, f.spotify_track_id, u.username COLLATE NOCASE`,
    ).bind(RECORD_SEASON, groupId),
    db.prepare(
      `SELECT DISTINCT
         aa.spotify_album_id AS spotifyAlbumId,
         ar.spotify_id AS spotifyArtistId,
         ar.name AS artistName,
         ar.spotify_url AS artistSpotifyUrl
       FROM record_album_artists aa
       JOIN record_artists ar ON ar.spotify_id = aa.spotify_artist_id
       JOIN record_list_items li ON li.spotify_album_id = aa.spotify_album_id
       JOIN record_users u ON u.id = li.user_id
       WHERE li.season = ? AND u.group_id = ?
       ORDER BY lower(ar.name), aa.spotify_album_id`,
    ).bind(RECORD_SEASON, groupId),
  ]);

  return {
    members: membersResult.results || [],
    picks: picksResult.results || [],
    standouts: standoutsResult.results || [],
    favorites: favoritesResult.results || [],
    albumArtists: artistsResult.results || [],
  };
}

function makePayload(season, groupId, seasonInfo, rows, generatedAt) {
  return {
    generatedAt,
    group: { id: groupId, name: seasonInfo.groupName },
    seasonStatus: seasonInfo.status,
    locksAt: seasonInfo.locksAt,
    wrappedAt: seasonInfo.wrappedAt,
    ...generateWrappedStats({ season, ...rows }),
  };
}

async function getSnapshot(db, groupId) {
  return db.prepare(
    `SELECT payload_json AS payloadJson
     FROM record_wrapped_snapshots
     WHERE group_id = ? AND season = ?`,
  ).bind(groupId, RECORD_SEASON).first();
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(env, request);
    requireRecordClubOwner(user);
    requireGroup(user);
    const db = requireDb(env);
    const seasonInfo = await getSeason(db, user.groupId);

    if (seasonInfo.status === "wrapped") {
      const existingSnapshot = await getSnapshot(db, user.groupId);
      if (existingSnapshot?.payloadJson) {
        return json({ ...JSON.parse(existingSnapshot.payloadJson), snapshot: true, metadataPending: 0 });
      }
    }

    const rows = await loadWrappedRows(db, user.groupId);
    const generatedAt = new Date().toISOString();
    const payload = makePayload(RECORD_SEASON, user.groupId, seasonInfo, rows, generatedAt);
    const metadataPending = new Set(
      rows.picks
        .filter((row) => !row.metadataEnrichedAt)
        .map((row) => row.spotifyId),
    ).size;

    if (seasonInfo.status === "wrapped") {
      if (metadataPending > 0) {
        return json({
          ...payload,
          snapshot: false,
          preparingSnapshot: true,
          metadataPending,
        });
      }
      await db.prepare(
        `INSERT OR IGNORE INTO record_wrapped_snapshots
           (group_id, season, algorithm_version, payload_json, generated_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        user.groupId,
        RECORD_SEASON,
        WRAPPED_ALGORITHM_VERSION,
        JSON.stringify(payload),
        generatedAt,
        seasonInfo.wrappedAt || generatedAt,
      ).run();
      const storedSnapshot = await getSnapshot(db, user.groupId);
      return json({
        ...(storedSnapshot?.payloadJson ? JSON.parse(storedSnapshot.payloadJson) : payload),
        snapshot: true,
        metadataPending,
      });
    }

    return json({ ...payload, snapshot: false, metadataPending });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(env, request);
    requireRecordClubOwner(user);
    requireGroup(user);
    const db = requireDb(env);
    const body = await readJson(request);
    if (body.action !== "enrich") {
      throw new HttpError("That Wrapped action is not supported.", 400, "invalid_action");
    }

    const seasonInfo = await getSeason(db, user.groupId);
    if (seasonInfo.status === "wrapped") {
      const snapshot = await getSnapshot(db, user.groupId);
      if (snapshot) {
        throw new HttpError(
          "This edition of Wrapped has already been published.",
          409,
          "wrapped_published",
        );
      }
    }

    const albums = await db.prepare(
      `SELECT DISTINCT a.spotify_id AS spotifyId
       FROM record_list_items li
       JOIN record_users u ON u.id = li.user_id
       JOIN record_albums a ON a.spotify_id = li.spotify_album_id
       WHERE li.season = ?
         AND u.group_id = ?
         AND a.metadata_enriched_at IS NULL
       ORDER BY a.spotify_id
       LIMIT 2`,
    ).bind(RECORD_SEASON, user.groupId).all();

    const enriched = [];
    for (const row of albums.results || []) {
      const result = await enrichRecordAlbum(db, env, row.spotifyId);
      enriched.push({
        spotifyId: result.album.spotifyId,
        name: result.album.name,
        trackCount: result.trackCount,
      });
    }

    const remaining = await db.prepare(
      `SELECT COUNT(DISTINCT a.spotify_id) AS count
       FROM record_list_items li
       JOIN record_users u ON u.id = li.user_id
       JOIN record_albums a ON a.spotify_id = li.spotify_album_id
       WHERE li.season = ?
         AND u.group_id = ?
         AND a.metadata_enriched_at IS NULL`,
    ).bind(RECORD_SEASON, user.groupId).first("count");

    return json({ ok: true, enriched, metadataPending: Number(remaining || 0) });
  } catch (error) {
    return handleApiError(error);
  }
}
