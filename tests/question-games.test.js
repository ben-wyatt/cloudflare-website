import assert from "node:assert/strict";
import test from "node:test";
import {
  answerFor,
  buildJevRequest,
  cardsToTurnDown,
  compact,
  isNotYesNo,
  judgmentsFrom,
  recordFacts,
} from "../functions/_shared/question-games.js";
import { coverTwinsCard, insertBeforeLast } from "../functions/_shared/cover-twins.js";
import { lookAlikePairs } from "../scripts/lib/cover-neighbors.mjs";
import { checkPuzzle, publicPuzzle } from "../functions/_shared/crates.js";

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
  assert.equal("researched" in facts, false);
});

test("the researched write-up joins the facts, without empty sections or fact numbers", () => {
  const facts = recordFacts({
    name: "Album", artistName: "Artist",
    researchJson: JSON.stringify({
      sound: "Horn-driven samba (facts 3, 4) with strings (fact 9).",
      mood_and_themes: "Not found in the sources.",
      story: "Their debut, recorded in Ingolstadt.",
      reception: "",
      artist: "A duo from Rio and Bavaria.",
    }),
  });
  assert.deepEqual(facts.researched, {
    sound: "Horn-driven samba with strings.",
    story_of_the_record: "Their debut, recorded in Ingolstadt.",
    artist_background: "A duo from Rio and Bavaria.",
  });
});

test("the Jev request has one question per record, plus the kind check", () => {
  const request = buildJevRequest("Is it loud?", [{ id: "x", facts: { title: "X" } }, { id: "y", facts: { title: "Y" } }], "2026-11-25");
  assert.deepEqual(Object.keys(request.questions), ["c0", "c1", "kind"]);
  assert.equal(request.state.question, "Is it loud?");
  // Jev knows today's date, so "this year" means 2026.
  assert.equal(request.state.today, "2026-11-25");
  assert.match(request.questions.c0.instructions.task, /`today`/);
  assert.deepEqual(request.questions.c1.instructions.album, { title: "Y" });
  // The player's words are state, never part of the instructions.
  assert.equal(JSON.stringify(request.questions).includes("Is it loud?"), false);
  assert.deepEqual(judgmentsFrom([{ id: "x" }, { id: "y" }], { c0: { noul: 0.81234 } }), [{ id: "x", p: 0.812 }, { id: "y", p: null }]);
});

test("compact removes empty values all the way down", () => {
  assert.deepEqual(compact({ a: "", b: [], c: { d: null }, e: 0, f: ["x", ""] }), { e: 0, f: ["x"] });
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

// A well-formed Crates puzzle: four groups of four, levels 1-4, sixteen different records.
function cratesPuzzle() {
  return {
    id: "badabing-trivia-01",
    title: "",
    groups: [1, 2, 3, 4].map((level) => ({
      level,
      label: `Group ${level}`,
      records: [1, 2, 3, 4].map((n) => ({ spotifyId: `r${level}${n}`, title: `T${level}${n}`, artist: "A", why: "Because.", source: "data:released" })),
    })),
    red_herrings: ["One looks like another."],
    confidence: "high",
    doubts: "",
  };
}

test("a Crates puzzle needs four groups of four different records that the group picked", () => {
  const known = new Set(cratesPuzzle().groups.flatMap((group) => group.records.map((record) => record.spotifyId)));
  assert.deepEqual(checkPuzzle(cratesPuzzle(), known), []);
  const repeated = cratesPuzzle();
  repeated.groups[1].records[0].spotifyId = "r11";
  assert.match(checkPuzzle(repeated, known).join(" "), /appears twice/);
  const short = cratesPuzzle();
  short.groups[2].records.pop();
  assert.match(checkPuzzle(short, known).join(" "), /four records/);
  const stranger = cratesPuzzle();
  stranger.groups[0].records[0].spotifyId = "nope";
  assert.match(checkPuzzle(stranger, known).join(" "), /not one of this group's records/);
});

test("players see the puzzle with covers; review notes only for owners", () => {
  const covers = new Map([["r11", "https://i.scdn.co/image/a"]]);
  const payload = { ...cratesPuzzle(), status: "draft" };
  const forOwner = publicPuzzle(payload, covers, { owner: true });
  assert.equal(forOwner.groups[0].records[0].imageUrl, "https://i.scdn.co/image/a");
  assert.equal(forOwner.groups[0].records[0].why, "Because.");
  assert.deepEqual(forOwner.review.redHerrings, ["One looks like another."]);
  assert.equal("review" in publicPuzzle(payload, covers, { owner: false }), false);
  assert.equal("source" in forOwner.groups[0].records[0], false);
});

test("look-alike pairs skip records picked by the same people", () => {
  const matrix = families();
  const pickers = new Map(matrix.map((_, index) => [index, new Set([index < 2 ? "ana" : `p${index}`])]));
  const pairs = lookAlikePairs(matrix, [0, 1, 2, 3], pickers, 2);
  assert.ok(pairs.every((pair) => !(pair.i < 2 && pair.j < 2)));
});
