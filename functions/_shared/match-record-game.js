import { RECORD_SEASON } from "./records-config.js";

export const MATCH_RECORD_ANSWER_COUNT = 2;
export const MATCH_RECORD_CHOICE_COUNT = 8;
// Two misses are allowed; the third ends the round.
export const MATCH_RECORD_MAX_MISSES = 3;

export function normalizeMatchAlbumId(value) {
  const albumId = String(value || "").trim();
  return /^[A-Za-z0-9]{1,128}$/.test(albumId) ? albumId : null;
}

// choices: [{ isAnswer, pickedAt }]
export function matchRoundProgress(choices) {
  const picked = choices.filter((choice) => Boolean(choice.pickedAt));
  const found = picked.filter((choice) => Boolean(choice.isAnswer)).length;
  const misses = picked.length - found;
  const solved = found >= MATCH_RECORD_ANSWER_COUNT;
  return { found, misses, solved, finished: solved || misses >= MATCH_RECORD_MAX_MISSES };
}

// The answer whose note a miss unlocks: one the player has not found (a found record
// shows its note anyway), with a note before one without. Null when none is left.
export function nextMatchNote(choices) {
  const rank = (choice) => (String(choice.note || "").trim() ? 0 : 1);
  return choices
    .filter((choice) => Boolean(choice.isAnswer) && !choice.noteRevealedAt && !choice.pickedAt)
    .sort((a, b) => rank(a) - rank(b) || Number(a.displayOrder) - Number(b.displayOrder))[0] || null;
}

// The listener's notes the player can see, in the order they appeared: notes unlocked by
// misses, and the note of every record found. A note names its record only once that
// record is found, or once the round is over.
export function visibleMatchNotes(choices, finished = false) {
  // Timestamps compare as plain strings; a note never shown sorts last.
  const shownAt = (choice) => [choice.noteRevealedAt, choice.pickedAt].filter(Boolean).sort()[0] || "\uffff";
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return choices
    .filter((choice) => Boolean(choice.isAnswer) && (finished || choice.noteRevealedAt || choice.pickedAt))
    .sort((a, b) => order(shownAt(a), shownAt(b)) || Number(a.displayOrder) - Number(b.displayOrder))
    .map((choice) => (choice.pickedAt || finished
      ? { note: String(choice.note || ""), spotifyId: choice.spotifyId }
      : { note: String(choice.note || "") }));
}

// A random listener in the player's group who can anchor a round: two covered albums of
// their own, and six other covered group records to stand beside them. Null when nobody can.
export async function findMatchTarget(db, player) {
  return db.prepare(
    `SELECT candidate.id AS userId, candidate.username
     FROM record_users candidate
     WHERE candidate.group_id = ?
       AND candidate.id <> ?
       AND (
         SELECT COUNT(DISTINCT target_item.spotify_album_id)
         FROM record_list_items target_item
         JOIN record_albums target_album
           ON target_album.spotify_id = target_item.spotify_album_id
         WHERE target_item.user_id = candidate.id
           AND target_item.season = ?
           AND target_album.image_url IS NOT NULL
           AND trim(target_album.image_url) <> ''
       ) >= ?
       AND (
         SELECT COUNT(DISTINCT decoy_item.spotify_album_id)
         FROM record_list_items decoy_item
         JOIN record_users decoy_user ON decoy_user.id = decoy_item.user_id
         JOIN record_albums decoy_album
           ON decoy_album.spotify_id = decoy_item.spotify_album_id
         WHERE decoy_item.season = ?
           AND decoy_user.group_id = ?
           AND decoy_album.image_url IS NOT NULL
           AND trim(decoy_album.image_url) <> ''
           AND NOT EXISTS (
             SELECT 1
             FROM record_list_items target_check
             WHERE target_check.user_id = candidate.id
               AND target_check.season = decoy_item.season
               AND target_check.spotify_album_id = decoy_item.spotify_album_id
           )
       ) >= ?
     ORDER BY RANDOM()
     LIMIT 1`,
  ).bind(
    player.groupId,
    player.id,
    RECORD_SEASON,
    MATCH_RECORD_ANSWER_COUNT,
    RECORD_SEASON,
    player.groupId,
    MATCH_RECORD_CHOICE_COUNT - MATCH_RECORD_ANSWER_COUNT,
  ).first();
}
