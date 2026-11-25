import assert from "node:assert/strict";
import test from "node:test";
import {
  answerFor,
  buildJevRequest,
  cardsToTurnDown,
  compact,
  isNotYesNo,
  judgmentsFrom,
  listenerFacts,
  onlyOneBoard,
  onlyOneResult,
  recordFacts,
} from "../functions/_shared/question-games.js";
import { coverTwinsCard, insertBeforeLast } from "../functions/_shared/cover-twins.js";
import { isLabUser, labGroup, labViewGroup } from "../functions/_shared/dev-lab.js";
import { clusterIndexes, lookAlikePairs, makePuzzles, puzzleMargin } from "../scripts/lib/cover-puzzles.mjs";

test("the secret card's probability picks the answer", () => {
  assert.equal(answerFor(0.95).answer, "yes");
  assert.equal(answerFor(0.6).answer, "probably");
  assert.equal(answerFor(0.5).answer, "unsure");
  assert.equal(answerFor(0.4).answer, "probably-not");
  assert.equal(answerFor(0.05).answer, "no");
});

test("only clear disagreements turn over, and never the secret", () => {
  const judgments = [{ id: "secret", p: 0.9 }, { id: "a", p: 0.1 }, { id: "b", p: 0.5 }, { id: "c", p: null }];
  assert.deepEqual(cardsToTurnDown("yes", judgments, "secret"), ["a"]);
  assert.deepEqual(cardsToTurnDown("unsure", judgments, "secret"), []);
  // Even if the secret's own number disagreed with the answer, it stays up.
  assert.deepEqual(cardsToTurnDown("no", [{ id: "secret", p: 0.9 }, { id: "a", p: 0.8 }], "secret"), ["a"]);
});

test("a message is refused only when it is clearly not a yes/no question", () => {
  assert.equal(isNotYesNo({ probabilities: { yes_no: 0.1, open: 0.9, other: 0 } }), true);
  assert.equal(isNotYesNo({ probabilities: { yes_no: 0.6, open: 0.4, other: 0 } }), false);
  assert.equal(isNotYesNo(undefined), false);
});

test("Only One is solved when the target fits and nothing else does", () => {
  assert.equal(onlyOneResult("t", [{ id: "t", p: 0.9 }, { id: "a", p: 0.1 }]).solved, true);
  const maybe = onlyOneResult("t", [{ id: "t", p: 0.9 }, { id: "a", p: 0.5 }]);
  assert.equal(maybe.solved, false);
  assert.equal(maybe.alsoFit, 1);
  assert.equal(onlyOneResult("t", [{ id: "t", p: 0.3 }, { id: "a", p: 0.1 }]).targetFits, false);
});

test("Only One's board holds the target, look-alikes and random records", () => {
  const ids = Array.from({ length: 30 }, (_, n) => `r${n}`);
  const board = onlyOneBoard("r0", ids, ["r5", "r6", "r0", "missing"], () => 0.3);
  assert.equal(board.length, 12);
  assert.ok(board.includes("r0") && board.includes("r5") && board.includes("r6"));
  assert.equal(new Set(board).size, 12);
});

test("record facts carry the looked-up facts and drop empty ones", () => {
  const facts = recordFacts({
    name: "Album", artistName: "Artist", releaseDate: "2025-03-01", albumType: "single", totalTracks: 5,
    totalDurationMs: 1_200_000, explicitTrackCount: null, language: "spa", lastfmListeners: 1200,
    lastfmTagsJson: JSON.stringify([{ name: "indie pop", count: 100 }, { name: "3", count: 50 }]),
    factsJson: JSON.stringify({ artist: { name: "Artist", type: "Person", gender: "Female", area: "Chile", activeSince: 1999 } }),
    descriptionJson: JSON.stringify({ description: "A red room.", subject: "a chair", palette: ["red"] }),
  }, { picks: [{ username: "ana", review: "Loved it" }, { username: "bo", review: "" }] });
  assert.equal(facts.kind, "EP");
  assert.equal(facts.lyrics_language, "Spanish");
  assert.deepEqual(facts.genre_tags, ["indie pop"]);
  assert.equal(facts.artist_facts.born, 1999);
  assert.deepEqual(facts.picked_by, ["ana", "bo"]);
  assert.deepEqual(facts.notes, [{ by: "ana", note: "Loved it" }]);
  assert.equal("explicit_tracks" in facts, false);
});

test("listener facts include exact year summaries", () => {
  const facts = listenerFacts("ana", [
    { name: "A", artistName: "X", releaseDate: "1975-01-01", language: "eng" },
    { name: "B", artistName: "Y", releaseDate: "2025-01-01", language: "spa", review: "hi" },
  ]);
  assert.equal(facts.oldest_record_year, 1975);
  assert.equal(facts.newest_record_year, 2025);
  assert.deepEqual(facts.decades_picked, ["1970s", "2020s"]);
  assert.equal(facts.notes_written, 1);
});

test("the Jev request has one question per card, plus the kind check", () => {
  const request = buildJevRequest("record", "Is it loud?", [{ id: "x", facts: { title: "X" } }, { id: "y", facts: { title: "Y" } }]);
  assert.deepEqual(Object.keys(request.questions), ["c0", "c1", "kind"]);
  assert.equal(request.state.question, "Is it loud?");
  assert.deepEqual(request.questions.c1.instructions.album, { title: "Y" });
  const onlyOne = buildJevRequest("only-one", "red", [{ id: "x", facts: {} }]);
  assert.equal(onlyOne.state.description, "red");
  assert.equal("kind" in onlyOne.questions, false);
  assert.deepEqual(judgmentsFrom([{ id: "x" }, { id: "y" }], { c0: { noul: 0.81234 } }), [{ id: "x", p: 0.812 }, { id: "y", p: null }]);
});

test("compact removes empty values all the way down", () => {
  assert.deepEqual(compact({ a: "", b: [], c: { d: null }, e: 0, f: ["x", ""] }), { e: 0, f: ["x"] });
});

test("only Record Club owners are lab users, and only known groups can be read", () => {
  assert.equal(isLabUser({ username: "ben_dev", groupId: "development" }), true);
  assert.equal(isLabUser({ username: "Ben", groupId: "badabing" }), true);
  assert.equal(isLabUser({ username: "graham", groupId: "badabing" }), false);
  assert.equal(isLabUser(null), false);
  assert.equal(labGroup("development"), "development");
  assert.equal(labGroup("ey-mt-juniors"), "badabing");
  assert.equal(labViewGroup("nope"), null);
});

test("cover twins goes just before the last slide", () => {
  const cards = [{ id: "cast" }, { id: "everyone-lists" }];
  assert.deepEqual(insertBeforeLast(cards, { id: "cover-twins" }).map((card) => card.id), ["cast", "cover-twins", "everyone-lists"]);
  assert.equal(insertBeforeLast(cards, null), cards);
  assert.equal(typeof coverTwinsCard, "function");
});

// Sixteen points in four tight, well-separated families of four.
function families() {
  const vectors = [];
  for (let family = 0; family < 4; family += 1) {
    for (let member = 0; member < 4; member += 1) {
      const vector = new Float32Array(8);
      vector[family] = 1;
      vector[4 + member % 4] = 0.15;
      const norm = Math.hypot(...vector);
      vectors.push(vector.map((value) => value / norm));
    }
  }
  const matrix = vectors.map((a) => vectors.map((b) => a.reduce((sum, value, index) => sum + value * b[index], 0)));
  return matrix;
}

test("puzzles group look-alikes and keep the groups apart", () => {
  const matrix = families();
  const indexes = [...matrix.keys()];
  const clusters = clusterIndexes(matrix, indexes, 4);
  assert.deepEqual(clusters.map((cluster) => cluster.length), [4, 4, 4, 4]);
  const [puzzle] = makePuzzles(matrix, indexes, { count: 1, clusters: 4 });
  assert.ok(puzzle);
  for (const group of puzzle.groups) assert.equal(new Set(group.map((index) => Math.floor(index / 4))).size, 1);
  assert.ok(puzzleMargin(matrix, puzzle.groups) > 0.5);
});

test("look-alike pairs skip records picked by the same people", () => {
  const matrix = families();
  const pickers = new Map(matrix.map((_, index) => [index, new Set([index < 2 ? "ana" : `p${index}`])]));
  const pairs = lookAlikePairs(matrix, [0, 1, 2, 3], pickers, 2);
  assert.ok(pairs.every((pair) => !(pair.i < 2 && pair.j < 2)));
});
