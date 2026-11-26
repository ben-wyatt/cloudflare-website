import { requireUser } from "../_shared/auth.js";
import { HttpError, handleApiError, json, requireDb } from "../_shared/http.js";
import { buildMixtapes } from "../_shared/mixtapes.js";
import { requireRecordGames } from "../_shared/record-access.js";
import { RECORD_SEASON } from "../_shared/records-config.js";

// A new Mixtapes round from the player's group: four friends, four records each.
// Like Crates, a round happens in the page, so it does not count toward unlocking Liner Notes.
export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(env, request);
    requireRecordGames(env, user);
    if (!user.groupId) throw new HttpError("This account is not in a Record Club group.", 403, "group_required");
    const db = requireDb(env);
    const result = await db.prepare(
      `SELECT li.user_id AS userId, u.username, li.spotify_album_id AS spotifyId,
              a.name AS title, a.artist_name AS artist, a.image_url AS imageUrl, li.review AS note
       FROM record_list_items li
       JOIN record_users u ON u.id = li.user_id
       JOIN record_albums a ON a.spotify_id = li.spotify_album_id
       WHERE u.group_id = ? AND li.season = ? AND li.user_id <> ?`,
    ).bind(user.groupId, RECORD_SEASON, user.id).all();
    const puzzle = buildMixtapes(result.results || []);
    if (!puzzle) {
      throw new HttpError("Mixtapes needs four friends in your group with at least four records that nobody else picked.", 404, "not_enough_lists");
    }
    return json({ puzzle });
  } catch (error) {
    return handleApiError(error);
  }
}
