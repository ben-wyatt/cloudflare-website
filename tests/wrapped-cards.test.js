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

test("Liner Notes pairs its mirror-image awards on one slide each", () => {
  const cards = generateWrappedCards({ season: 2026, picks });
  assert.deepEqual(cards.map((entry) => entry.id), [
    "cast", "shared-records", "same-record-different-reasons", "artist-echo", "music-besties",
    "most-basic", "biggest-tuba", "common-chord", "unexpected-detour", "genre-passport", "time-traveler",
    "fresh-off-press", "word-map", "written-margins", "everyone-lists",
  ]);
  assert.deepEqual(cards.find((entry) => entry.id === "shared-records").records[0].pickers,
    ["alex", "blair"]);

  const basic = cards.find((entry) => entry.id === "most-basic");
  assert.deepEqual(basic.titleLines, ["casey is the Most Basic Bitch.", "alex is Not Like Other Girls."]);
  assert.equal(basic.title, basic.titleLines.join(" "));
  assert.equal(basic.noDefault, true);
  assert.deepEqual(basic.ranking.filter((row) => row.highlight).map((row) => row.name), ["casey", "alex"]);
  assert.equal(basic.axis.scale, "log");
  assert.ok(basic.ranking.every((row) => row.value >= basic.axis.min && row.value <= basic.axis.max));
  assert.deepEqual(basic.ranking.map((row) => row.people), [["casey"], ["blair"], ["alex"]]);

  const tuba = cards.find((entry) => entry.id === "biggest-tuba");
  assert.deepEqual(tuba.titleLines, ["Biggest tuba award.", "Tiniest violin award."]);
  assert.equal(tuba.strip.points.length, 11);
  assert.deepEqual(tuba.strip.points.filter((point) => point.highlight).map((point) => point.value), [20000, 100]);
  assert.deepEqual(tuba.records.map((record) => record.spotifyId), ["c4", "shared"]);
  assert.match(tuba.records[1].caption, /^Tiniest violin · 100 listeners$/);

  const besties = cards.find((entry) => entry.id === "music-besties");
  assert.deepEqual(besties.titleLines, ["Music besties.", "Opposite ends of the couch."]);
  assert.equal(besties.mixes.length, 2);
  assert.equal(besties.strip.points.length, 3);
  const scores = besties.strip.points.map((point) => point.value);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.deepEqual(besties.strip.points[0].view.mixPair.names.length, 2);
  assert.ok(besties.genreMixes.alex.length > 0);

  const chord = cards.find((entry) => entry.id === "common-chord");
  assert.match(chord.ranking.find((row) => row.highlight).name, /rock|electronic/);
  assert.match(chord.fact, /The room’s most-used Last\.fm tags:$/);
  assert.ok(chord.ranking.every((row) => /^\d+ records?/.test(row.sub)));

  const sharedNotes = cards.find((entry) => entry.id === "same-record-different-reasons");
  assert.equal(sharedNotes.notes.length, 2);
  assert.equal(sharedNotes.notes[0].href, "/records/lists/?member=alex#album-note-alex-shared");
  assert.deepEqual(cards.find((entry) => entry.id === "word-map").wordMap[0],
    { word: "echo", count: 2 });
  assert.equal(cards.some((entry) => entry.status === "in construction"), false);
});

test("the unexpected detour counts the other records that share a genre with it", () => {
  const cards = generateWrappedCards({ season: 2026, picks });
  const detour = cards.find((entry) => entry.id === "unexpected-detour");
  // Alex's bluegrass record shares no genre family with alex's three rock and pop records.
  assert.equal(detour.stat.value, "0 of 3");
  assert.equal(detour.records[0].spotifyId, "a4");
  assert.match(detour.fact, /^Bluegrass Turn is country; the rest of the list leans /);
});

const albumFacts = (rows) => rows.map(([spotifyAlbumId, artistName, artistType, country, similar = [], place = null]) => ({
  spotifyAlbumId, artistName, artistType, country, similarJson: JSON.stringify(similar),
  lat: place?.[0] ?? null, lon: place?.[1] ?? null, placeArea: place?.[2] ?? "",
}));
const facts = albumFacts([
  ["shared", "Echo", "Group", "US", [], [40.65, -73.95, "Brooklyn"]],
  ["a2", "Old Band", "Group", "GB", ["Club"], [51.5, -0.12, "London"]],
  ["a3", "Pop Star", "Person", "US", [], [39.8, -98.5]],
  ["a4", "Blue Band", "Group", "US", ["Quartet"], [36.1, -86.8, "Nashville"]],
  ["b2", "Echo", "Group", "US", [], [40.65, -73.95, "Brooklyn"]],
  ["b3", "Club", "Person", "GB", [], [51.5, -0.12, "London"]],
  ["b4", "Quartet", "Group", "FR", [], [48.86, 2.35, "Paris"]],
  ["c1", "MC One", "Person", "US", ["Old Band"], [34.05, -118.24, "Los Angeles"]],
  ["c2", "MC Two", "Person", "US", []],
  ["c3", "Singer", "Person", "JM", [], [18.0, -76.8, "Kingston"]],
  ["c4", "DJ", "Person", "US", [], [39.8, -98.5]],
]);

test("Same neighborhood links records two people did not share, by similar artists", () => {
  const cards = generateWrappedCards({ season: 2026, picks, facts });
  const neighborhood = cards.find((entry) => entry.id === "same-neighborhood");
  assert.deepEqual(neighborhood.ranking[0].people, ["alex", "blair"]);
  assert.deepEqual(neighborhood.chips.sort(), ["Blue Band ↔ Quartet", "Old Band ↔ Club"]);
  assert.equal(neighborhood.fact, "They also share 1 record.");
});

test("Passport stamps pins each artist's hometown and lets a listener focus their own", () => {
  const cards = generateWrappedCards({ season: 2026, picks, facts });
  const stamps = cards.find((entry) => entry.id === "passport-stamps");
  assert.equal(stamps.stat.value, 4);
  const brooklyn = stamps.map.pins.find((pin) => pin.place === "Brooklyn, United States");
  assert.deepEqual(brooklyn.artists, [{ name: "Echo", pickers: ["alex", "blair"] }]);
  // Artists with no known hometown sit on their country, and say so.
  const country = stamps.map.pins.find((pin) => pin.country);
  assert.equal(country.place, "Somewhere in United States");
  assert.deepEqual(country.artists.map((artist) => artist.name).sort(), ["DJ", "Pop Star"]);
  assert.ok(stamps.map.pins.every((pin) => pin.x >= 0 && pin.x <= stamps.map.width && pin.y >= 0 && pin.y <= stamps.map.height));
  assert.equal(stamps.ranking.find((row) => row.name === "blair").view.mapFocus, "blair");
});

test("Band Kid and Solo Stan share one slide, from the artists' MusicBrainz types", () => {
  const cards = generateWrappedCards({ season: 2026, picks, facts });
  const band = cards.find((entry) => entry.id === "band-kid");
  assert.deepEqual(band.titleLines, ["alex and blair are the Band Kids.", "casey is the Solo Stan."]);
  assert.deepEqual(band.ranking.map((row) => row.display), ["75%", "75%", "0%"]);
});

test("record length, explicit tracks and starred tracks each get a slide", () => {
  const timed = picks.map((row, index) => ({ ...row, totalTracks: 10, totalDurationMs: (20 + index * 5) * 60_000,
    explicitTrackCount: row.userId === "casey" ? 8 : row.userId === "blair" ? 2 : 0, metadataEnrichedAt: "2026-11-01" }));
  const favorites = Array.from({ length: 9 }, (_, index) => ({
    userId: "blair", username: "blair", spotifyAlbumId: "b3", spotifyTrackId: `t${index}` }));
  const cards = generateWrappedCards({ season: 2026, picks: timed, favorites });

  const length = cards.find((entry) => entry.id === "bring-snacks");
  assert.deepEqual(length.titleLines, ["Bring snacks award.", "Blink and you’ll miss it award."]);
  // The shared record counts once: 11 different records.
  assert.equal(length.stat.value, "9 hr 10 min");
  assert.equal(length.strip.axis.scale, "log");
  assert.deepEqual(length.records.map((record) => record.caption),
    ["Bring snacks · 1 hr 15 min · 10 tracks", "Blink · 25 min · 10 tracks"]);

  const advisory = cards.find((entry) => entry.id === "parental-advisory");
  assert.deepEqual(advisory.titleLines, ["casey gets the Parental Advisory sticker.", "alex is the Radio Edit."]);
  assert.equal(advisory.fact, "Filthiest record: Big Dance, 8 of 10 tracks explicit.");

  const skips = cards.find((entry) => entry.id === "no-skips");
  assert.equal(skips.stat.value, "9/10");
  assert.equal(skips.records[0].spotifyId, "b3");
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

test("Wrapped closes with one link to each listener's full list", () => {
  const withCovers = picks.map((row) => ({ ...row, imageUrl: `https://img.example/${row.spotifyId}` }));
  const standouts = [{ userId: "drew", username: "drew", spotifyId: "t1", name: "Only A Track" },
    { userId: "alex", username: "alex", spotifyId: "t2", name: "Alex Track" }];
  const cards = generateWrappedCards({ season: 2026, picks: withCovers, standouts });
  const closing = cards.at(-1);
  assert.equal(closing.id, "everyone-lists");
  assert.deepEqual(closing.people.map((entry) => entry.username), ["alex", "blair", "casey", "drew"]);
  const alex = closing.people[0];
  assert.equal(alex.href, "/records/lists/?member=alex");
  assert.equal(alex.albumCount, 4);
  assert.equal(alex.standoutCount, 1);
  assert.equal(alex.covers.length, 4);
  assert.ok(alex.covers.every((cover) => cover.imageUrl.startsWith("https://img.example/")));
  const drew = closing.people[3];
  assert.equal(drew.albumCount, 0);
  assert.equal(drew.standoutCount, 1);
  assert.deepEqual(drew.covers, []);
});

test("the Time Traveller has the widest spread of years, not the widest range", () => {
  // ana: one 1960 record among nine from 2025 (range 65, spread ±19.5).
  // bo: 1970, 1980, 2015, 2025 (range 55, spread ±23.0), so bo travels more.
  const rows = [
    pick("ana", "x0", "Old One", "Elder", ["folk"], 10, "1960-01-01"),
    ...Array.from({ length: 9 }, (_, n) => pick("ana", `x${n + 1}`, `New ${n}`, `Band ${n}`, ["pop"], 10, "2025-01-01")),
    pick("bo", "y1", "Y1", "A", ["rock"], 10, "1970-01-01"),
    pick("bo", "y2", "Y2", "B", ["rock"], 10, "1980-01-01"),
    pick("bo", "y3", "Y3", "C", ["rock"], 10, "2015-01-01"),
    pick("bo", "y4", "Y4", "D", ["rock"], 10, "2025-01-01"),
  ];
  const traveler = generateWrappedCards({ season: 2026, picks: rows }).find((entry) => entry.id === "time-traveler");
  assert.match(traveler.title, /^bo /);
  assert.equal(traveler.stat.value, "±23.0");
  assert.deepEqual(traveler.ranking.map((row) => [row.name, row.display, row.sub]),
    [["bo", "±23.0 yrs", "1970–2025"], ["ana", "±19.5 yrs", "1960–2025"]]);
});

test("Written in the margins says what it counts and shows every note by the top writer", () => {
  const rows = [
    pick("alex", "m1", "One", "A", ["pop"], 10, "2025-01-01", "A long note with many words in it, more than the others by far."),
    pick("alex", "m2", "Two", "B", ["pop"], 10, "2025-01-01", "A second note."),
    pick("alex", "m3", "Three", "C", ["pop"], 10, "2025-01-01"),
    pick("blair", "m4", "Four", "D", ["pop"], 10, "2025-01-01", "Short."),
  ];
  const margins = generateWrappedCards({ season: 2026, picks: rows }).find((entry) => entry.id === "written-margins");
  assert.match(margins.lede, /Most words written in notes/);
  assert.deepEqual(margins.notes.map((note) => note.about), ["One", "Two"]);
  assert.equal(margins.stat.unit, "words across 2 notes");
  assert.deepEqual(margins.ranking.find((row) => row.name === "blair").view.notes.map((note) => note.text), ["Short."]);
});
