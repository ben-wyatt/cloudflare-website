import { requireUser } from "../../_shared/auth.js";
import { labGroup, requireLabUser } from "../../_shared/dev-lab.js";
import { HttpError, handleApiError, json, requireDb } from "../../_shared/http.js";
import { RECORD_SEASON } from "../../_shared/records-config.js";

// Crates: sixteen covers that sort into four groups of four look-alikes. The puzzles are made
// ahead of time by scripts/cover-similarity.mjs; the page checks the groups itself.
export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(env, request);
    requireLabUser(user);
    const db = requireDb(env);
    const url = new URL(request.url);
    const groupId = labGroup(url.searchParams.get("group"));
    const result = await db.prepare(
      `SELECT id, payload_json AS payloadJson
       FROM record_cover_puzzles
       WHERE group_id = ? AND season = ?`,
    ).bind(groupId, RECORD_SEASON).all();
    const puzzles = (result.results || [])
      .sort((a, b) => Number(a.id.split("-").at(-1)) - Number(b.id.split("-").at(-1)));
    if (!puzzles.length) throw new HttpError("There are no cover puzzles for this group yet.", 404, "no_puzzles");
    const asked = Number(url.searchParams.get("n"));
    const index = Number.isInteger(asked) && asked >= 1 && asked <= puzzles.length
      ? asked - 1
      : crypto.getRandomValues(new Uint32Array(1))[0] % puzzles.length;
    const payload = JSON.parse(puzzles[index].payloadJson);
    return json({ group: groupId, number: index + 1, count: puzzles.length, groups: payload.groups });
  } catch (error) {
    return handleApiError(error);
  }
}
