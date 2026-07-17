import { HttpError } from "./http.js";

let cachedToken = null;

function spotifyConfig(env) {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    throw new HttpError("Spotify is not configured yet.", 503, "spotify_not_configured");
  }
  return { clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET };
}

async function getAccessToken(env) {
  const { clientId, clientSecret } = spotifyConfig(env);
  const now = Date.now();
  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.value;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new HttpError("Spotify rejected the app credentials.", 502, "spotify_auth_failed");
  }

  const body = await response.json();
  cachedToken = {
    clientId,
    value: body.access_token,
    expiresAt: now + Number(body.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

async function spotifyFetch(env, path) {
  const token = await getAccessToken(env);
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (response.status === 429) {
    throw new HttpError("Spotify is busy. Please wait a moment and try again.", 429, "spotify_rate_limited");
  }
  if (response.status === 404) {
    throw new HttpError("That Spotify item could not be found.", 404, "spotify_item_not_found");
  }
  if (!response.ok) {
    throw new HttpError("Spotify could not complete that request.", 502, "spotify_request_failed");
  }

  return response.json();
}

export function parseSpotifyAlbumId(value) {
  const input = String(value || "").trim();
  const uriMatch = input.match(/^spotify:album:([A-Za-z0-9]+)$/i);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(input);
    if (url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const albumIndex = parts.indexOf("album");
    if (albumIndex !== -1 && parts[albumIndex + 1]) return parts[albumIndex + 1];
  } catch {
    return null;
  }

  return null;
}

export function normalizeSpotifyAlbum(album) {
  return {
    type: "album",
    spotifyId: album.id,
    name: album.name,
    artistName: (album.artists || []).map((artist) => artist.name).join(", "),
    imageUrl: album.images?.[0]?.url || null,
    spotifyUrl: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`,
    releaseDate: album.release_date || null,
    totalTracks: Number(album.total_tracks || 0),
  };
}

export async function getSpotifyAlbum(env, albumId) {
  const album = await spotifyFetch(env, `/albums/${encodeURIComponent(albumId)}?market=US`);
  return normalizeSpotifyAlbum(album);
}

export function parseSpotifyTrackId(value) {
  const input = String(value || "").trim();
  const uriMatch = input.match(/^spotify:track:([A-Za-z0-9]+)$/i);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(input);
    if (url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const trackIndex = parts.indexOf("track");
    if (trackIndex !== -1 && parts[trackIndex + 1]) return parts[trackIndex + 1];
  } catch {
    return null;
  }

  return null;
}

export function normalizeSpotifyTrack(track) {
  return {
    type: "track",
    spotifyId: String(track.id || ""),
    name: String(track.name || ""),
    artistName: (track.artists || []).map((artist) => artist.name).filter(Boolean).join(", "),
    albumName: String(track.album?.name || ""),
    albumSpotifyId: String(track.album?.id || ""),
    imageUrl: track.album?.images?.[0]?.url || null,
    spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
    discNumber: Math.max(1, Number(track.disc_number || 1)),
    trackNumber: Math.max(1, Number(track.track_number || 1)),
    durationMs: Math.max(0, Number(track.duration_ms || 0)),
    explicit: Boolean(track.explicit),
  };
}

export async function getSpotifyTrack(env, trackId) {
  const track = await spotifyFetch(env, `/tracks/${encodeURIComponent(trackId)}?market=US`);
  return normalizeSpotifyTrack(track);
}

export async function getSpotifyAlbumTracks(env, albumId) {
  const tracks = [];
  let offset = 0;

  // Spotify returns at most 50 tracks per page. Ten pages keeps this request
  // bounded while still covering unusually large box sets.
  for (let page = 0; page < 10; page += 1) {
    const payload = await spotifyFetch(
      env,
      `/albums/${encodeURIComponent(albumId)}/tracks?market=US&limit=50&offset=${offset}`,
    );
    const items = Array.isArray(payload.items) ? payload.items.filter(Boolean) : [];
    tracks.push(
      ...items
        .map(normalizeSpotifyTrack)
        .filter((track) => /^[A-Za-z0-9]+$/.test(track.spotifyId) && track.name),
    );
    offset += items.length;
    if (!payload.next || items.length === 0) break;
  }

  return tracks;
}

function interleave(left, right) {
  const results = [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index]) results.push(left[index]);
    if (right[index]) results.push(right[index]);
  }
  return results;
}

export async function searchSpotifyRecords(env, query) {
  const pastedAlbumId = parseSpotifyAlbumId(query);
  if (pastedAlbumId) return [await getSpotifyAlbum(env, pastedAlbumId)];
  const pastedTrackId = parseSpotifyTrackId(query);
  if (pastedTrackId) return [await getSpotifyTrack(env, pastedTrackId)];

  const trimmed = String(query || "").trim();
  if (trimmed.length < 2 || trimmed.length > 100) {
    throw new HttpError("Search with at least two characters.", 400, "invalid_search");
  }

  const payload = await spotifyFetch(
    env,
    `/search?type=album,track&market=US&limit=8&q=${encodeURIComponent(trimmed)}`,
  );
  const albums = (payload.albums?.items || []).filter(Boolean).map(normalizeSpotifyAlbum);
  const tracks = (payload.tracks?.items || []).filter(Boolean).map(normalizeSpotifyTrack);
  return interleave(albums, tracks);
}
