import { HttpError } from "./http.js";
import { getSpotifyAlbum, getSpotifyAlbumTracks } from "./spotify.js";

const STATEMENTS_PER_BATCH = 80;

async function runInBatches(db, statements) {
  for (let index = 0; index < statements.length; index += STATEMENTS_PER_BATCH) {
    await db.batch(statements.slice(index, index + STATEMENTS_PER_BATCH));
  }
}

export async function enrichRecordAlbum(db, env, albumId) {
  const spotifyAlbumId = String(albumId || "").trim();
  if (!/^[A-Za-z0-9]+$/.test(spotifyAlbumId)) {
    throw new HttpError("That album has an invalid Spotify ID.", 400, "invalid_album");
  }

  const [album, rawTracks] = await Promise.all([
    getSpotifyAlbum(env, spotifyAlbumId),
    getSpotifyAlbumTracks(env, spotifyAlbumId),
  ]);
  const tracks = rawTracks.map((track) => ({
    ...track,
    albumName: album.name,
    albumSpotifyId: album.spotifyId,
    imageUrl: album.imageUrl,
  }));
  if (album.totalTracks > 0 && tracks.length < album.totalTracks) {
    throw new HttpError(
      "Spotify did not return the album’s complete track list yet.",
      502,
      "spotify_tracks_incomplete",
    );
  }
  const now = new Date().toISOString();

  await db.prepare(
    `INSERT INTO record_albums
       (spotify_id, name, artist_name, image_url, spotify_url, release_date,
        release_date_precision, album_type, total_tracks, total_duration_ms,
        explicit_track_count, metadata_enriched_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)
     ON CONFLICT(spotify_id) DO UPDATE SET
       name = excluded.name,
       artist_name = excluded.artist_name,
       image_url = excluded.image_url,
       spotify_url = excluded.spotify_url,
       release_date = excluded.release_date,
       release_date_precision = excluded.release_date_precision,
       album_type = excluded.album_type,
       total_tracks = excluded.total_tracks,
       metadata_enriched_at = NULL,
       updated_at = excluded.updated_at`,
  ).bind(
    album.spotifyId,
    album.name,
    album.artistName,
    album.imageUrl,
    album.spotifyUrl,
    album.releaseDate,
    album.releaseDatePrecision,
    album.albumType,
    album.totalTracks,
    now,
    now,
  ).run();

  await db.batch([
    db.prepare("DELETE FROM record_album_artists WHERE spotify_album_id = ?").bind(album.spotifyId),
    db.prepare("DELETE FROM record_album_tracks WHERE spotify_album_id = ?").bind(album.spotifyId),
  ]);

  const artistStatements = [];
  for (const [index, artist] of (album.artists || []).entries()) {
    artistStatements.push(
      db.prepare(
        `INSERT INTO record_artists
           (spotify_id, name, spotify_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(spotify_id) DO UPDATE SET
           name = excluded.name,
           spotify_url = excluded.spotify_url,
           updated_at = excluded.updated_at`,
      ).bind(artist.spotifyId, artist.name, artist.spotifyUrl, now, now),
      db.prepare(
        `INSERT INTO record_album_artists
           (spotify_album_id, spotify_artist_id, display_order)
         VALUES (?, ?, ?)
         ON CONFLICT(spotify_album_id, spotify_artist_id) DO UPDATE SET
           display_order = excluded.display_order`,
      ).bind(album.spotifyId, artist.spotifyId, index + 1),
    );
  }
  await runInBatches(db, artistStatements);

  const trackStatements = [];
  for (const track of tracks) {
    trackStatements.push(
      db.prepare(
        `INSERT INTO record_tracks
           (spotify_id, name, artist_name, album_name, album_spotify_id, image_url,
            spotify_url, duration_ms, explicit, created_at, updated_at)
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
        album.name,
        album.spotifyId,
        album.imageUrl,
        track.spotifyUrl,
        track.durationMs,
        track.explicit ? 1 : 0,
        now,
        now,
      ),
      db.prepare(
        `INSERT INTO record_album_tracks
           (spotify_album_id, spotify_track_id, disc_number, track_number)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(spotify_album_id, spotify_track_id) DO UPDATE SET
           disc_number = excluded.disc_number,
           track_number = excluded.track_number`,
      ).bind(album.spotifyId, track.spotifyId, track.discNumber, track.trackNumber),
    );
  }
  await runInBatches(db, trackStatements);

  const totalDurationMs = tracks.reduce(
    (total, track) => total + Math.max(0, Number(track.durationMs || 0)),
    0,
  );
  const explicitTrackCount = tracks.filter((track) => track.explicit).length;
  await db.prepare(
    `UPDATE record_albums
     SET
       total_tracks = ?,
       total_duration_ms = ?,
       explicit_track_count = ?,
       metadata_enriched_at = ?,
       updated_at = ?
     WHERE spotify_id = ?`,
  ).bind(
    tracks.length || album.totalTracks,
    totalDurationMs,
    explicitTrackCount,
    now,
    now,
    album.spotifyId,
  ).run();

  return {
    album,
    trackCount: tracks.length,
    totalDurationMs,
    explicitTrackCount,
    enrichedAt: now,
  };
}
