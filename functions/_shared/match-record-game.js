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

// The answer whose note a miss unlocks: one the player has not found yet, and one
// with a note, before the rest. Returns null once every answer's note is shown.
export function nextMatchNote(choices) {
  const rank = (choice) => (choice.pickedAt ? 2 : 0) + (String(choice.note || "").trim() ? 0 : 1);
  return choices
    .filter((choice) => Boolean(choice.isAnswer) && !choice.noteRevealedAt)
    .sort((a, b) => rank(a) - rank(b) || Number(a.displayOrder) - Number(b.displayOrder))[0] || null;
}
