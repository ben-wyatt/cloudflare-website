import { isRecordClubOwner } from "./auth.js";
import { HttpError } from "./http.js";
import { findMatchTarget } from "./match-record-game.js";
import { RECORD_SEASON, WRAPPED_UNLOCK_ROUNDS } from "./records-config.js";

// RECORD_CLUB_RELEASE (wrangler.toml [vars], or .dev.vars locally) opens the games, Wrapped
// and the group lists. "" or "off": owner accounts only. "all": every group. A comma list
// such as "development,badabing": only those groups. Owners can always play.
export function parseRelease(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "off") return { all: false, groups: new Set() };
  if (text === "all") return { all: true, groups: new Set() };
  return { all: false, groups: new Set(text.split(",").map((group) => group.trim()).filter(Boolean)) };
}

export function isAnyGroupReleased(env) {
  const release = parseRelease(env?.RECORD_CLUB_RELEASE);
  return release.all || release.groups.size > 0;
}

export function canPlayRecordGames(env, user) {
  if (!user) return false;
  if (isRecordClubOwner(user)) return true;
  if (!user.groupId) return false;
  const release = parseRelease(env?.RECORD_CLUB_RELEASE);
  return release.all || release.groups.has(user.groupId);
}

export function requireRecordGames(env, user) {
  if (!canPlayRecordGames(env, user)) {
    throw new HttpError("The Record Club minigames are not open yet.", 403, "games_not_open");
  }
}

export const GAME_IDS = Object.freeze({
  whoPickedIt: "who-picked-it",
  matchTheRecord: "match-the-record",
  flipSide: "flip-side",
});

// Add this to the batch that finishes a round. A round counts once, however it ended.
export function finishedRoundStatement(db, { roundId, playerId, game, finishedAt }) {
  return db.prepare(
    `INSERT OR IGNORE INTO record_game_plays
       (round_id, player_user_id, game, season, finished_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(roundId, playerId, game, RECORD_SEASON, finishedAt);
}

async function countFinishedRounds(db, userId) {
  const count = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM record_game_plays
     WHERE player_user_id = ? AND season = ?`,
  ).bind(userId, RECORD_SEASON).first("count");
  return Number(count || 0);
}

// Whether either game can deal this player a round. A group without enough picks for the
// games would otherwise never see its Wrapped.
async function groupHasGameRounds(db, player) {
  const whoPickedItAlbum = await db.prepare(
    `SELECT 1 AS ready
     FROM record_list_items li
     JOIN record_users u ON u.id = li.user_id
     JOIN record_albums a ON a.spotify_id = li.spotify_album_id
     WHERE li.season = ?
       AND u.group_id = ?
       AND li.user_id <> ?
       AND a.image_url IS NOT NULL
       AND trim(a.image_url) <> ''
       AND trim(COALESCE(li.review, '')) <> ''
     LIMIT 1`,
  ).bind(RECORD_SEASON, player.groupId, player.id).first();
  if (whoPickedItAlbum) return true;
  return Boolean(await findMatchTarget(db, player));
}

// { required, played, unlocked, noGames? }
export async function getWrappedUnlock(db, user) {
  const required = WRAPPED_UNLOCK_ROUNDS;
  const played = await countFinishedRounds(db, user.id);
  if (played >= required) return { required, played, unlocked: true };
  if (!user.groupId || !(await groupHasGameRounds(db, user))) {
    return { required, played, unlocked: true, noGames: true };
  }
  return { required, played, unlocked: false };
}

// The progress to send back with a finished round; justUnlocked marks the round that opened Wrapped.
export async function wrappedUnlockAfterRound(db, user) {
  const unlock = await getWrappedUnlock(db, user);
  return { ...unlock, justUnlocked: !unlock.noGames && unlock.played === unlock.required };
}

export async function requireWrappedAccess(db, env, user) {
  requireRecordGames(env, user);
  const unlock = await getWrappedUnlock(db, user);
  if (!unlock.unlocked) {
    const remaining = unlock.required - unlock.played;
    throw new HttpError(
      `Play ${remaining} more ${remaining === 1 ? "round" : "rounds"} of the minigames to unlock Liner Notes and everyone’s lists.`,
      403,
      "wrapped_locked",
    );
  }
  return unlock;
}
