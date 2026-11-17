import assert from "node:assert/strict";
import test from "node:test";

import {
  matchRoundProgress,
  nextMatchNote,
  normalizeMatchAlbumId,
} from "../functions/_shared/match-record-game.js";

test("a pick must be one plain Spotify album ID", () => {
  assert.equal(normalizeMatchAlbumId(" albumA "), "albumA");
  assert.equal(normalizeMatchAlbumId("../albumB"), null);
  assert.equal(normalizeMatchAlbumId(""), null);
});

test("a round is solved by both picks and ends on the third miss", () => {
  const board = (picked) => ["a1", "a2", "d1", "d2", "d3", "d4"].map((id) => ({
    isAnswer: id.startsWith("a"),
    pickedAt: picked.includes(id) ? "t" : null,
  }));
  assert.deepEqual(matchRoundProgress(board(["a1", "d1"])), { found: 1, misses: 1, solved: false, finished: false });
  assert.deepEqual(matchRoundProgress(board(["a1", "d1", "a2"])), { found: 2, misses: 1, solved: true, finished: true });
  assert.deepEqual(matchRoundProgress(board(["d1", "d2"])), { found: 0, misses: 2, solved: false, finished: false });
  assert.deepEqual(matchRoundProgress(board(["d1", "d2", "d3"])), { found: 0, misses: 3, solved: false, finished: true });
});

test("a miss unlocks an unfound record's note first, then any left", () => {
  const choices = [
    { spotifyId: "a1", isAnswer: 1, displayOrder: 1, note: "first", pickedAt: "t" },
    { spotifyId: "a2", isAnswer: 1, displayOrder: 5, note: "second" },
    { spotifyId: "d1", isAnswer: 0, displayOrder: 2, note: "" },
  ];
  assert.equal(nextMatchNote(choices).spotifyId, "a2");
  choices[1].noteRevealedAt = "t";
  assert.equal(nextMatchNote(choices).spotifyId, "a1");
  choices[0].noteRevealedAt = "t";
  assert.equal(nextMatchNote(choices), null);
});

test("an unfound record with a note comes before one without", () => {
  const choices = [
    { spotifyId: "a1", isAnswer: 1, displayOrder: 1, note: "" },
    { spotifyId: "a2", isAnswer: 1, displayOrder: 2, note: "has words" },
  ];
  assert.equal(nextMatchNote(choices).spotifyId, "a2");
});
