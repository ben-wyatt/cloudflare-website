import { isRecordClubOwner, requireRecordClubOwner, requireUser } from "../_shared/auth.js";
import { CRATE_STATUSES, publicPuzzle } from "../_shared/crates.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../_shared/http.js";
import { RECORD_SEASON } from "../_shared/records-config.js";

// Crates puzzles for the player's group. Owners review them: they see every puzzle that is not
// rejected, with review notes, and approve or reject each one. Everyone else gets approved
// puzzles only.

// The same gate as the other Record Club games.
function requireGameAccess(user) {
  requireRecordClubOwner(user);
  if (!user.groupId) throw new HttpError("This account is not in a Record Club group.", 403, "group_required");
}

async function loadPuzzles(db, groupId, owner) {
  const result = await db.prepare(
    `SELECT id, payload_json AS payloadJson
     FROM record_cover_puzzles
     WHERE group_id = ? AND season = ?
     ORDER BY id`,
  ).bind(groupId, RECORD_SEASON).all();
  return (result.results || [])
    .map((row) => ({ ...JSON.parse(row.payloadJson), id: row.id }))
    .filter((payload) => (owner ? payload.status !== "rejected" : payload.status === "approved"));
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
    requireGameAccess(user);
    const owner = isRecordClubOwner(user);
    const db = requireDb(env);
    const url = new URL(request.url);
    const groupId = user.groupId;
    const puzzles = await loadPuzzles(db, groupId, owner);
    if (!puzzles.length) throw new HttpError("There are no Crates puzzles for this group yet.", 404, "no_puzzles");
    const asked = Number(url.searchParams.get("n"));
    const index = Number.isInteger(asked) && asked >= 1 && asked <= puzzles.length
      ? asked - 1
      : crypto.getRandomValues(new Uint32Array(1))[0] % puzzles.length;
    const payload = puzzles[index];
    const counts = Object.fromEntries(CRATE_STATUSES.map((status) => [status, puzzles.filter((item) => (item.status || "draft") === status).length]));
    return json({
      group: groupId,
      number: index + 1,
      count: puzzles.length,
      counts,
      puzzle: publicPuzzle(payload, await coversFor(db, payload), { owner }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// { action: "review", id, status: "approved" | "rejected" | "draft" }
export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(env, request);
    // Reviewing stays an owner's job after Crates opens to everyone.
    requireRecordClubOwner(user);
    const db = requireDb(env);
    const body = await readJson(request);
    const status = String(body?.status || "");
    if (body?.action !== "review" || !CRATE_STATUSES.includes(status)) {
      throw new HttpError("Choose approved, rejected or draft.", 400, "invalid_review");
    }
    const result = await db.prepare(
      `UPDATE record_cover_puzzles
       SET payload_json = json_set(payload_json, '$.status', ?)
       WHERE id = ? AND season = ?`,
    ).bind(status, String(body.id || "").slice(0, 64), RECORD_SEASON).run();
    if (!result.meta?.changes) throw new HttpError("That puzzle could not be found.", 404, "puzzle_not_found");
    return json({ id: body.id, status });
  } catch (error) {
    return handleApiError(error);
  }
}
