import assert from "node:assert/strict";
import test from "node:test";

import { generateWrappedCards } from "../functions/_shared/wrapped-cards.js";
import { closerThanNow } from "../functions/_shared/history-events.js";

function pick(userId, spotifyId, name, artistName, genres, audience, releaseDate, review = "") {
  return {
    userId,
    username: userId,
    spotifyId,
    name,
    artistName,
    spotifyUrl: `https://open.spotify.com/album/${spotifyId}`,
    releaseDate,
    lastfmListeners: audience,
    lastfmTagsJson: JSON.stringify(genres.map((genre) => ({ name: genre, count: 100 }))),
    review,
  };
}

const picks = [
  pick("alex", "shared", "Shared", "Echo", ["indie rock", "2026"], 100, "2026-01-01", "An echo from my favorite summer."),
  pick("alex", "a2", "Old Rock", "Old Band", ["classic rock"], 200, "1980-01-01"),
  pick("alex", "a3", "Pop Turn", "Pop Star", ["pop"], 300, "2025-01-01"),
  pick("alex", "a4", "Bluegrass Turn", "Blue Band", ["bluegrass"], 400, "2026-01-01"),
  pick("blair", "shared", "Shared", "Echo", ["indie rock", "2026"], 100, "2026-01-01", "That echo sounds like home."),
  pick("blair", "b2", "Another Door", "Echo", ["psychedelic rock"], 1000, "2024-01-01"),
  pick("blair", "b3", "Dance Turn", "Club", ["house"], 2000, "2026-01-01"),
  pick("blair", "b4", "Jazz Turn", "Quartet", ["jazz"], 3000, "2025-01-01"),
  pick("casey", "c1", "First Rap", "MC One", ["hip hop"], 10000, "2026-01-01"),
  pick("casey", "c2", "Second Rap", "MC Two", ["trap"], 12000, "2026-01-01"),
  pick("casey", "c3", "Soul Turn", "Singer", ["neo-soul"], 15000, "2025-01-01"),
  pick("casey", "c4", "Big Dance", "DJ", ["house"], 20000, "2026-01-01"),
];

test("Wrapped includes note stories and clearly unfinished editorial awards", () => {
  const cards = generateWrappedCards({ season: 2026, picks });
  assert.deepEqual(cards.map((entry) => entry.id), [
    "cast", "shared-records", "same-record-different-reasons", "artist-echo", "music-besties", "opposite-ends",
    "most-basic", "not-like-other-girls", "biggest-tuba", "tiniest-violin",
    "common-chord", "unexpected-detour", "genre-passport", "time-traveler",
    "fresh-off-press", "word-map", "hill-worth-dying-on", "one-sentence-liner-note", "written-margins",
  ]);
  assert.deepEqual(cards.find((entry) => entry.id === "shared-records").records[0].pickers,
    ["alex", "blair"]);
  assert.equal(cards.find((entry) => entry.id === "not-like-other-girls").ranking.find((row) => row.highlight).name, "alex");
  assert.equal(cards.find((entry) => entry.id === "most-basic").ranking.find((row) => row.highlight).name, "casey");
  const smallestAudience = cards.find((entry) => entry.id === "tiniest-violin");
  const biggestAudience = cards.find((entry) => entry.id === "biggest-tuba");
  assert.equal(smallestAudience.lede, "Least popular single record.");
  assert.deepEqual(smallestAudience.records[0].pickers, ["alex", "blair"]);
  assert.equal(biggestAudience.lede, "Most popular single record.");
  assert.deepEqual(biggestAudience.records[0].pickers, ["casey"]);
  assert.match(cards.find((entry) => entry.id === "common-chord").ranking.find((row) => row.highlight).name, /rock|electronic/);
  const opposite = cards.find((entry) => entry.id === "opposite-ends");
  assert.equal(opposite.ranking.find((row) => row.highlight).value, Math.min(...opposite.ranking.map((row) => row.value)));
  assert.equal(opposite.mix.length, 2);
  assert.match(opposite.stat.value, /^\d+%$/);
  const sharedNotes = cards.find((entry) => entry.id === "same-record-different-reasons");
  assert.equal(sharedNotes.notes.length, 2);
  assert.equal(sharedNotes.notes[0].href, "/records/lists/#album-note-alex-shared");
  assert.deepEqual(cards.find((entry) => entry.id === "word-map").wordMap[0],
    { word: "echo", count: 2 });
  assert.equal(cards.find((entry) => entry.id === "hill-worth-dying-on").status, "in construction");
  assert.equal(cards.find((entry) => entry.id === "one-sentence-liner-note").status, "in construction");
});

test("shared record card includes every record picked by at least two people", () => {
  const extra = pick("casey", "b2", "Another Door", "Echo", ["psychedelic rock"], 1000, "2024-01-01");
  const cards = generateWrappedCards({ season: 2026, picks: [...picks, extra] });
  const shared = cards.find((entry) => entry.id === "shared-records");
  assert.equal(shared.records.length, 2);
  assert.deepEqual(shared.records.map((record) => record.spotifyId), ["b2", "shared"]);
});

test("no unsupported taste awards appear from sparse or noisy tags", () => {
  const sparse = [
    pick("alex", "a", "One", "Artist", ["2026", "auto-tagged"], 100, "2026-01-01"),
    pick("blair", "b", "Two", "Artist", [], 200, "2026-01-01"),
  ];
  const cards = generateWrappedCards({ season: 2026, picks: sparse });
  assert.equal(cards.some((entry) => entry.id === "music-besties"), false);
  assert.equal(cards.some((entry) => entry.id === "opposite-ends"), false);
  assert.equal(cards.some((entry) => entry.id === "genre-passport"), false);
});

test("card winners do not depend on database row order", () => {
  const forward = generateWrappedCards({ season: 2026, picks });
  const reverse = generateWrappedCards({ season: 2026, picks: [...picks].reverse() });
  assert.deepEqual(reverse, forward);
});

test("time traveler comparison finds the earliest landmark the old year is closer to", () => {
  assert.deepEqual(closerThanNow(1967, 2026), { year: 1912, event: "the sinking of the Titanic" });
  assert.equal(closerThanNow(2025, 2026), null);
  assert.equal(closerThanNow(2026, 2026), null);
});

test("the Polyglot slide counts records not in English, leaving out instrumentals", () => {
  const withLanguages = picks.map((row) => ({
    ...row,
    language: { b2: "spa", b3: "fra", c1: "jpn", a2: "zxx", a3: "eng" }[row.spotifyId] || null,
  }));
  const cards = generateWrappedCards({ season: 2026, picks: withLanguages });
  const polyglot = cards.find((entry) => entry.id === "polyglot");
  assert.equal(polyglot.title, "blair is the Polyglot.");
  assert.equal(polyglot.lede, "Most records not in English.");
  assert.deepEqual(polyglot.stat, { value: 2, unit: "records not in English" });
  assert.deepEqual(polyglot.chips, ["French", "Spanish"]);
  assert.deepEqual(polyglot.ranking.map((row) => [row.name, row.value, row.highlight]),
    [["blair", 2, true], ["casey", 1, false]]);
  assert.match(polyglot.fact, /4 languages: English, French, Japanese, Spanish/);
  assert.equal(generateWrappedCards({ season: 2026, picks }).some((entry) => entry.id === "polyglot"), false);
});
