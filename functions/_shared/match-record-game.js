export const MATCH_RECORD_ANSWER_COUNT = 2;
export const MATCH_RECORD_CHOICE_COUNT = 8;

export function normalizeMatchGuesses(value) {
  if (!Array.isArray(value) || value.length !== MATCH_RECORD_ANSWER_COUNT) return null;

  const albumIds = value.map((albumId) => String(albumId || "").trim());
  if (
    new Set(albumIds).size !== MATCH_RECORD_ANSWER_COUNT
    || albumIds.some((albumId) => !/^[A-Za-z0-9]+$/.test(albumId) || albumId.length > 128)
  ) {
    return null;
  }
  return albumIds;
}

export function scoreMatchGuesses(choices, guessedAlbumIds) {
  const answerIds = choices
    .filter((choice) => Boolean(choice.isAnswer))
    .map((choice) => choice.spotifyId);
  const guessedIds = new Set(guessedAlbumIds);

  return {
    answerIds,
    correctCount: answerIds.filter((albumId) => guessedIds.has(albumId)).length,
  };
}
