import assert from "node:assert/strict";
import test from "node:test";

import {
  albumClue,
  genreTags,
  getListenerClueVisibility,
  isAlbumClueVisible,
} from "../functions/_shared/record-game-clues.js";

test("a round starts with only the cover", () => {
  assert.equal(isAlbumClueVisible(0), false);
  assert.deepEqual(
    getListenerClueVisibility("listener-a", 0, new Set()),
    { favoriteTracks: false, review: false },
  );
});

test("the first miss reveals the album, the second the tracks and notes", () => {
  assert.equal(isAlbumClueVisible(1), true);
  assert.deepEqual(
    getListenerClueVisibility("listener-a", 1, new Set()),
    { favoriteTracks: false, review: false },
  );
  assert.deepEqual(
    getListenerClueVisibility("listener-a", 2, new Set()),
    { favoriteTracks: true, review: true },
  );
});

test("a correctly found listener shows tracks and note without revealing the others", () => {
  const foundUserIds = new Set(["listener-a"]);
  assert.deepEqual(
    getListenerClueVisibility("listener-a", 0, foundUserIds),
    { favoriteTracks: true, review: true },
  );
  assert.deepEqual(
    getListenerClueVisibility("listener-b", 0, foundUserIds),
    { favoriteTracks: false, review: false },
  );
});

test("genre tags drop years, personal tags, weak tags and the artist's name", () => {
  const tags = JSON.stringify([
    { name: "Indie Rock", count: 100 }, { name: "2026", count: 90 }, { name: "seen live", count: 80 },
    { name: "Phoebe Bridgers", count: 70 }, { name: "folk", count: 60 }, { name: "rare", count: 1 },
  ]);
  assert.deepEqual(genreTags(tags, "Phoebe Bridgers"), ["indie rock", "folk"]);
  assert.deepEqual(genreTags("not json"), []);
});

test("the album clue carries a safe Spotify link and the year", () => {
  const clue = albumClue({ spotifyAlbumId: "abc123", albumName: "Punisher", artistName: "Phoebe Bridgers",
    spotifyUrl: "javascript:alert(1)", releaseDate: "2020-06-18", totalTracks: 11 });
  assert.equal(clue.spotifyUrl, "https://open.spotify.com/album/abc123");
  assert.equal(clue.year, 2020);
  assert.equal(clue.totalTracks, 11);
});
