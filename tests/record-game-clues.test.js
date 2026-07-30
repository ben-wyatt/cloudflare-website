import assert from "node:assert/strict";
import test from "node:test";

import { getListenerClueVisibility } from "../functions/_shared/record-game-clues.js";

test("locked listeners stay hidden before any misses", () => {
  assert.deepEqual(
    getListenerClueVisibility("listener-a", 0, new Set()),
    { favoriteTracks: false, review: false },
  );
});

test("a correctly found listener gets both clues without revealing the others", () => {
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

test("miss-based clues still apply to every listener", () => {
  const foundUserIds = new Set(["listener-a"]);

  assert.deepEqual(
    getListenerClueVisibility("listener-b", 1, foundUserIds),
    { favoriteTracks: true, review: false },
  );
  assert.deepEqual(
    getListenerClueVisibility("listener-b", 2, foundUserIds),
    { favoriteTracks: true, review: true },
  );
});
