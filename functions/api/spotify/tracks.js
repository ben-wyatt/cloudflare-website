import { requireUser } from "../../_shared/auth.js";
import { HttpError, handleApiError, json } from "../../_shared/http.js";
import { getSpotifyAlbumTracks } from "../../_shared/spotify.js";

export async function onRequestGet({ request, env }) {
  try {
    await requireUser(env, request);
    const albumId = (new URL(request.url).searchParams.get("album") || "").trim();
    if (!/^[A-Za-z0-9]{1,64}$/.test(albumId)) {
      throw new HttpError("Choose a valid Spotify album.", 400, "invalid_album");
    }

    const tracks = await getSpotifyAlbumTracks(env, albumId);
    return json({ albumId, tracks });
  } catch (error) {
    return handleApiError(error);
  }
}
