import { HttpError } from "./http.js";

function comparable(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function lastFmRequest(env, method, name, artistName) {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.search = new URLSearchParams({
    method,
    artist: artistName,
    album: name,
    api_key: env.LASTFM_API_KEY,
    format: "json",
    autocorrect: "1",
  }).toString();

  let response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "CloudflareWebsite-RecordClub/1.0" },
    });
  } catch {
    throw new HttpError("Last.fm could not be reached.", 502, "lastfm_unavailable");
  }
  if (response.status === 429) {
    throw new HttpError("Last.fm is busy. Try again shortly.", 429, "lastfm_rate_limited");
  }
  if (!response.ok) {
    throw new HttpError("Last.fm could not complete that request.", 502, "lastfm_request_failed");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError("Last.fm returned an unreadable response.", 502, "lastfm_invalid_response");
  }
  if (Number(payload.error) === 6) return null;
  if (payload.error) {
    throw new HttpError("Last.fm could not complete that request.", 502, "lastfm_request_failed");
  }
  return payload;
}

export async function getLastFmAlbum(env, { name, artistName }) {
  if (!env.LASTFM_API_KEY) {
    throw new HttpError("Last.fm is not configured yet.", 503, "lastfm_not_configured");
  }
  const info = await lastFmRequest(env, "album.getinfo", name, artistName);
  const album = info?.album;
  if (!album || comparable(album.name) !== comparable(name)
    || comparable(album.artist) !== comparable(artistName)) return null;

  const listeners = Number(album.listeners);
  const playcount = Number(album.playcount);
  if (!Number.isSafeInteger(listeners) || listeners < 0
    || !Number.isSafeInteger(playcount) || playcount < 0) return null;
  const tagResponse = await lastFmRequest(env, "album.gettoptags", name, artistName);
  const rawTags = tagResponse?.toptags?.tag || album.tags?.tag || [];
  const tags = (Array.isArray(rawTags) ? rawTags : [rawTags])
    .map((tag) => ({
      name: String(tag?.name || "").trim(),
      count: Number.isFinite(Number(tag?.count)) ? Number(tag.count) : null,
    }))
    .filter((tag) => tag.name);
  return {
    listeners,
    playcount,
    tags,
    url: /^https:\/\/www\.last\.fm\//.test(album.url || "") ? album.url : null,
  };
}

export async function enrichLastFmAlbum(db, env, { spotifyId, name, artistName }) {
  const existing = await db.prepare(
    "SELECT lastfm_fetched_at FROM record_albums WHERE spotify_id = ?",
  ).bind(spotifyId).first();
  if (!existing || existing.lastfm_fetched_at) return false;

  let result = await getLastFmAlbum(env, { name, artistName });
  const primaryArtist = artistName.split(",")[0].trim();
  if (!result && primaryArtist !== artistName) {
    result = await getLastFmAlbum(env, { name, artistName: primaryArtist });
  }
  await db.prepare(
    `UPDATE record_albums
     SET lastfm_listeners = ?, lastfm_playcount = ?, lastfm_tags_json = ?,
         lastfm_url = ?, lastfm_fetched_at = ?
     WHERE spotify_id = ? AND lastfm_fetched_at IS NULL`,
  ).bind(
    result?.listeners ?? null,
    result?.playcount ?? null,
    result ? JSON.stringify(result.tags) : null,
    result?.url ?? null,
    new Date().toISOString(),
    spotifyId,
  ).run();
  return Boolean(result);
}
