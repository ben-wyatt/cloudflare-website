import { requireUser } from "../_shared/auth.js";
import { publicPuzzle } from "../_shared/crates.js";
import { HttpError, handleApiError, json, requireDb } from "../_shared/http.js";
import { requireRecordGames } from "../_shared/record-access.js";
import { RECORD_SEASON } from "../_shared/records-config.js";

// Crates puzzles for the player's group, in order; ?n= picks one, otherwise one at random.
// Crates rounds happen in the page, so they do not count toward unlocking Liner Notes.

// The same gate as the other Record Club games: open to the groups RECORD_CLUB_RELEASE names.
function requireGameAccess(env, user) {
  requireRecordGames(env, user);
  if (!user.groupId) throw new HttpError("This account is not in a Record Club group.", 403, "group_required");
}

async function loadPuzzles(db, groupId) {
  const result = await db.prepare(
    `SELECT id, payload_json AS payloadJson
     FROM record_cover_puzzles
     WHERE group_id = ? AND season = ?
     ORDER BY id`,
  ).bind(groupId, RECORD_SEASON).all();
  return (result.results || []).map((row) => ({ ...JSON.parse(row.payloadJson), id: row.id }));
}

async function coversFor(db, payload) {
  const ids = (payload.groups || []).flatMap((group) => (group.records || []).map((record) => record.spotifyId));
  if (!ids.length) return new Map();
  const result = await db.prepare(
    `SELECT spotify_id AS spotifyId, image_url AS imageUrl
     FROM record_albums
     WHERE spotify_id IN (${ids.map(() => "?").join(", ")})`,
  ).bind(...ids).all();
  return new Map((result.results || []).map((row) => [row.spotifyId, row.imageUrl]));
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(env, request);
    requireGameAccess(env, user);
    const db = requireDb(env);
    const puzzles = await loadPuzzles(db, user.groupId);
    if (!puzzles.length) throw new HttpError("There are no Crates puzzles for this group yet.", 404, "no_puzzles");
    const asked = Number(new URL(request.url).searchParams.get("n"));
    const index = Number.isInteger(asked) && asked >= 1 && asked <= puzzles.length
      ? asked - 1
      : crypto.getRandomValues(new Uint32Array(1))[0] % puzzles.length;
    const payload = puzzles[index];
    return json({
      number: index + 1,
      count: puzzles.length,
      puzzle: publicPuzzle(payload, await coversFor(db, payload)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
