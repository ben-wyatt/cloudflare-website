import { requireUser } from "../../_shared/auth.js";
import { handleApiError, json } from "../../_shared/http.js";
import { searchSpotifyRecords } from "../../_shared/spotify.js";

export async function onRequestGet({ request, env }) {
  try {
    await requireUser(env, request);
    const query = new URL(request.url).searchParams.get("q") || "";
    const results = await searchSpotifyRecords(env, query);
    return json({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
