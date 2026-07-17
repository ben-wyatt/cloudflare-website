import { requireUser } from "../../_shared/auth.js";
import { handleApiError, json } from "../../_shared/http.js";
import { searchSpotifyAlbums } from "../../_shared/spotify.js";

export async function onRequestGet({ request, env }) {
  try {
    await requireUser(env, request);
    const query = new URL(request.url).searchParams.get("q") || "";
    const albums = await searchSpotifyAlbums(env, query);
    return json({ albums });
  } catch (error) {
    return handleApiError(error);
  }
}
