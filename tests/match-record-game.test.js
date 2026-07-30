import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMatchGuesses,
  scoreMatchGuesses,
} from "../functions/_shared/match-record-game.js";

test("a match guess requires exactly two distinct Spotify album IDs", () => {
  assert.deepEqual(normalizeMatchGuesses(["albumA", "albumB"]), ["albumA", "albumB"]);
  assert.equal(normalizeMatchGuesses(["albumA"]), null);
  assert.equal(normalizeMatchGuesses(["albumA", "albumA"]), null);
  assert.equal(normalizeMatchGuesses(["albumA", "../albumB"]), null);
});

test("match scoring counts only answers among the two guesses", () => {
  const choices = [
    { spotifyId: "answerA", isAnswer: 1 },
    { spotifyId: "decoyA", isAnswer: 0 },
    { spotifyId: "answerB", isAnswer: 1 },
    { spotifyId: "decoyB", isAnswer: 0 },
  ];

  assert.deepEqual(
    scoreMatchGuesses(choices, ["answerA", "answerB"]),
    { answerIds: ["answerA", "answerB"], correctCount: 2 },
  );
  assert.deepEqual(
    scoreMatchGuesses(choices, ["answerA", "decoyA"]),
    { answerIds: ["answerA", "answerB"], correctCount: 1 },
  );
  assert.deepEqual(
    scoreMatchGuesses(choices, ["decoyA", "decoyB"]),
    { answerIds: ["answerA", "answerB"], correctCount: 0 },
  );
});
