import assert from "node:assert/strict";
import test from "node:test";

import {
  matchRoundProgress,
  nextMatchNote,
  normalizeMatchAlbumId,
  visibleMatchNotes,
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

test("a miss unlocks an unfound record's note, never a found one", () => {
  const choices = [
    { spotifyId: "a1", isAnswer: 1, displayOrder: 1, note: "first", pickedAt: "t" },
    { spotifyId: "a2", isAnswer: 1, displayOrder: 5, note: "second" },
    { spotifyId: "d1", isAnswer: 0, displayOrder: 2, note: "" },
  ];
  assert.equal(nextMatchNote(choices).spotifyId, "a2");
  choices[1].noteRevealedAt = "t";
  assert.equal(nextMatchNote(choices), null);
});

test("visible notes name their record only once it is found", () => {
  const choices = [
    { spotifyId: "a1", isAnswer: true, displayOrder: 1, note: "first" },
    { spotifyId: "a2", isAnswer: true, displayOrder: 5, note: "second", noteRevealedAt: "0001" },
    { spotifyId: "d1", isAnswer: false, displayOrder: 2, note: "", pickedAt: "0001" },
  ];
  assert.deepEqual(visibleMatchNotes(choices), [{ note: "second" }]);
  choices[0].pickedAt = "0002";
  assert.deepEqual(visibleMatchNotes(choices), [{ note: "second" }, { note: "first", spotifyId: "a1" }]);
  choices[1].pickedAt = "0003";
  assert.deepEqual(visibleMatchNotes(choices).map((item) => item.spotifyId), ["a2", "a1"]);
  delete choices[0].pickedAt;
  delete choices[1].pickedAt;
  assert.deepEqual(visibleMatchNotes(choices, true).map((item) => item.spotifyId), ["a2", "a1"]);
});

test("an unfound record with a note comes before one without", () => {
  const choices = [
    { spotifyId: "a1", isAnswer: 1, displayOrder: 1, note: "" },
    { spotifyId: "a2", isAnswer: 1, displayOrder: 2, note: "has words" },
  ];
  assert.equal(nextMatchNote(choices).spotifyId, "a2");
});
