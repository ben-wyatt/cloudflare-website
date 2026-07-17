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
    throw new HttpError("That Spotify album could not be found.", 404, "album_not_found");
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

export async function searchSpotifyAlbums(env, query) {
  const pastedId = parseSpotifyAlbumId(query);
  if (pastedId) return [await getSpotifyAlbum(env, pastedId)];

  const trimmed = String(query || "").trim();
  if (trimmed.length < 2 || trimmed.length > 100) {
    throw new HttpError("Search with at least two characters.", 400, "invalid_search");
  }

  const search = async (value) => spotifyFetch(
    env,
    `/search?type=album&market=US&limit=8&q=${encodeURIComponent(value)}`,
  );

  const payload = await search(trimmed);
  return (payload.albums?.items || []).filter(Boolean).map(normalizeSpotifyAlbum);
}
