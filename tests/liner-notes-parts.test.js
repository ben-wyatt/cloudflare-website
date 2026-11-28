import assert from "node:assert/strict";
import test from "node:test";

import { coverClusters, coverTraits } from "../functions/_shared/cover-clusters.js";
import { coverTwinsFromRows } from "../functions/_shared/cover-twins.js";
import { MAP_HEIGHT, MAP_WIDTH, project } from "../functions/_shared/equal-earth.js";
import { shareAlbums } from "../functions/_shared/wrapped-albums.js";

const cover = (description, extra = {}) => ({ description, subject: "", objects: [], people: "one person", ...extra });

test("cover traits read the description with word rules", () => {
  assert.deepEqual(coverTraits(cover("A man holds a thin cigarette near his face.")), ["smoking"]);
  // Words inside other words do not count.
  assert.deepEqual(coverTraits(cover("A woman applying lipstick, fingers intertwined.")), ["embrace"]);
  assert.deepEqual(coverTraits(cover("Large green banana leaves fan out behind her.")), []);
  assert.deepEqual(coverTraits(cover("She wears blue sunglasses.")), []);
  assert.deepEqual(coverTraits(cover("He wears round glasses.")), ["glasses"]);
  // Text printed on the cover is not part of the picture.
  assert.deepEqual(coverTraits(cover("Across the top, the words 'coney island baby' appear.")), []);
  assert.deepEqual(coverTraits(cover("Block letters read \"HORSE\".")), []);
  assert.deepEqual(coverTraits(cover("A desert basin.", { people: "none" })), ["nobody"]);
  assert.deepEqual(coverTraits(cover("A dog.", { subject: "a dog's face in close-up" })), ["animals", "face"]);
});

test("a cover cluster needs three covers from at least two people", () => {
  const album = (id, pickers, text) => ({ spotifyId: id, name: id, artistName: "A", pickers, description: cover(text) });
  const clusters = coverClusters([
    album("a", ["ann"], "smoking on a stoop"),
    album("b", ["ann"], "a cigarette in the mouth"),
    album("c", ["bo"], "holds a cigar"),
    album("d", ["ann"], "a horse"),
    album("e", ["ann"], "a horse"),
    album("f", ["ann"], "a horse"),
  ]);
  assert.deepEqual(clusters.map((cluster) => cluster.id), ["smoking"]);
  assert.deepEqual(clusters[0].pickers, ["ann", "bo"]);
});

test("the Cover twins slide is a list of clusters, smoking section first", () => {
  const row = (spotifyId, username, description) => ({ spotifyId, username, name: spotifyId, artistName: "A",
    imageUrl: `https://img/${spotifyId}`, descriptionJson: JSON.stringify(cover(description)) });
  const card = coverTwinsFromRows([
    row("a", "ann", "a cigarette"), row("b", "bo", "smoking"), row("c", "cy", "a cigar"),
    row("d", "ann", "a dog"), row("e", "bo", "a cat"), row("f", "cy", "a goat"),
  ]);
  assert.equal(card.id, "cover-twins");
  assert.equal(card.unranked, true);
  assert.equal(card.artWall, true);
  assert.deepEqual(card.ranking.map((entry) => entry.name), ["Smoking section", "Petting zoo"]);
  assert.equal(card.stat.unit, "covers with a cigarette");
  assert.equal("description" in card.records[0], false);
});

test("the map projection puts 0,0 in the middle and keeps the world on the map", () => {
  const [x] = project(0, 0);
  assert.equal(Math.round(x), MAP_WIDTH / 2);
  for (const [lon, lat] of [[-180, 84], [180, -60], [-74, 40.7], [151.2, -33.9]]) {
    const [px, py] = project(lon, lat);
    assert.ok(px >= -0.5 && px <= MAP_WIDTH + 0.5 && py >= -0.5 && py <= MAP_HEIGHT + 0.5, `${lon},${lat}`);
  }
});

test("album details go out once and slides keep only what differs", () => {
  const album = { spotifyId: "x", name: "X", artistName: "A", imageUrl: "u", spotifyUrl: "s", releaseDate: "2026" };
  const { cards, albums } = shareAlbums([
    { id: "one", records: [{ ...album, pickers: ["ann"], caption: "first" }],
      ranking: [{ view: { records: [{ ...album, pickers: ["bo"] }] } }] },
  ]);
  assert.deepEqual(albums, { x: { name: "X", artistName: "A", imageUrl: "u", spotifyUrl: "s", releaseDate: "2026" } });
  assert.deepEqual(cards[0].records, [{ spotifyId: "x", pickers: ["ann"], caption: "first" }]);
  assert.deepEqual(cards[0].ranking[0].view.records, [{ spotifyId: "x", pickers: ["bo"] }]);
});
