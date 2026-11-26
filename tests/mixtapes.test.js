import assert from "node:assert/strict";
import test from "node:test";

import { buildMixtapes } from "../functions/_shared/mixtapes.js";

// Picks for some friends: each friend gets `count` records of their own.
function picks(people, count = 5) {
  return people.flatMap((username) => Array.from({ length: count }, (_, index) => ({
    userId: `${username}-id`,
    username,
    spotifyId: `${username}-album-${index}`,
    title: `${username} album ${index}`,
    artist: `${username} artist`,
    imageUrl: `https://covers.example/${username}/${index}.jpg`,
    note: index === 0 ? `  ${username} loved this one ` : "",
  })));
}

test("a mixtapes round is four friends with four of their own records each", () => {
  const puzzle = buildMixtapes(picks(["alex", "bo", "cy", "dee", "eli", "fay"]));
  assert.equal(puzzle.groups.length, 4);
  const ids = new Set();
  for (const group of puzzle.groups) {
    const username = group.label.replace(/'s mixtape$/, "");
    assert.equal(group.records.length, 4);
    for (const record of group.records) {
      assert.ok(record.spotifyId.startsWith(`${username}-album-`), `${record.spotifyId} is in ${group.label}`);
      ids.add(record.spotifyId);
    }
  }
  assert.equal(ids.size, 16);
  assert.equal(new Set(puzzle.groups.map((group) => group.label)).size, 4);
});

test("records two friends picked, or with no cover, never go in a mixtape", () => {
  const rows = picks(["alex", "bo", "cy", "dee"], 4);
  // Bo also picked one of Alex's records, and one of Cy's has no cover: each of them is short.
  rows.push({ ...rows[0], userId: "bo-id", username: "bo" });
  rows.find((row) => row.username === "cy").imageUrl = " ";
  assert.equal(buildMixtapes(rows), null);
  // With two more friends there are four who qualify; Alex and Cy still have only three.
  const puzzle = buildMixtapes([...rows, ...picks(["eli", "fay"], 4)]);
  assert.deepEqual(puzzle.groups.map((group) => group.label).sort(),
    ["bo's mixtape", "dee's mixtape", "eli's mixtape", "fay's mixtape"]);
  const used = puzzle.groups.flatMap((group) => group.records.map((record) => record.spotifyId));
  assert.ok(!used.includes(rows[0].spotifyId), "the shared record is left out");
});

test("a mixtape record carries its picker's note, trimmed", () => {
  const puzzle = buildMixtapes(picks(["alex", "bo", "cy", "dee"], 4));
  const record = puzzle.groups.flatMap((group) => group.records).find((item) => item.spotifyId === "alex-album-0");
  assert.equal(record.why, "alex loved this one");
});
