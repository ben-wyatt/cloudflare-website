import assert from "node:assert/strict";
import test from "node:test";

import {
  canPlayRecordGames,
  getWrappedUnlock,
  isAnyGroupReleased,
  parseRelease,
  requireWrappedAccess,
  wrappedUnlockAfterRound,
} from "../functions/_shared/record-access.js";
import { WRAPPED_UNLOCK_ROUNDS } from "../functions/_shared/records-config.js";

const friend = { id: "u1", username: "alex", groupId: "badabing" };

// A stand-in for D1: answers the plays count and whether the group has game rounds.
function fakeDb({ played = 0, gameReady = true } = {}) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async first(column) {
          if (sql.includes("FROM record_game_plays")) return column ? played : { count: played };
          return gameReady ? { ready: 1, userId: "u2", username: "sam" } : null;
        },
      };
    },
  };
}

test("the release flag reads off, all, or a list of groups", () => {
  assert.deepEqual([...parseRelease("").groups], []);
  assert.equal(parseRelease(undefined).all, false);
  assert.equal(parseRelease(" OFF ").all, false);
  assert.equal(parseRelease("all").all, true);
  assert.deepEqual([...parseRelease("development, badabing,").groups], ["development", "badabing"]);
  assert.equal(isAnyGroupReleased({ RECORD_CLUB_RELEASE: "" }), false);
  assert.equal(isAnyGroupReleased({ RECORD_CLUB_RELEASE: "development" }), true);
});

test("games open for owners always, and for friends only in a released group", () => {
  assert.equal(canPlayRecordGames({}, { username: "ben", groupId: "badabing" }), true);
  assert.equal(canPlayRecordGames({}, friend), false);
  assert.equal(canPlayRecordGames({ RECORD_CLUB_RELEASE: "development" }, friend), false);
  assert.equal(canPlayRecordGames({ RECORD_CLUB_RELEASE: "badabing" }, friend), true);
  assert.equal(canPlayRecordGames({ RECORD_CLUB_RELEASE: "all" }, friend), true);
  assert.equal(canPlayRecordGames({ RECORD_CLUB_RELEASE: "all" }, null), false);
  assert.equal(canPlayRecordGames({ RECORD_CLUB_RELEASE: "all" }, { ...friend, groupId: null }), false);
});

test("Wrapped stays locked until enough rounds are finished", async () => {
  const short = await getWrappedUnlock(fakeDb({ played: WRAPPED_UNLOCK_ROUNDS - 1 }), friend);
  assert.deepEqual(short, { required: WRAPPED_UNLOCK_ROUNDS, played: WRAPPED_UNLOCK_ROUNDS - 1, unlocked: false });
  const done = await getWrappedUnlock(fakeDb({ played: WRAPPED_UNLOCK_ROUNDS }), friend);
  assert.equal(done.unlocked, true);
});

test("a group with nothing to play gets its Wrapped without the games", async () => {
  const unlock = await getWrappedUnlock(fakeDb({ played: 0, gameReady: false }), friend);
  assert.equal(unlock.unlocked, true);
  assert.equal(unlock.noGames, true);
  assert.equal((await wrappedUnlockAfterRound(fakeDb({ played: 0, gameReady: false }), friend)).justUnlocked, false);
});

test("only the round that reaches the goal is marked as the unlock", async () => {
  const at = (played) => wrappedUnlockAfterRound(fakeDb({ played }), friend);
  assert.equal((await at(WRAPPED_UNLOCK_ROUNDS - 1)).justUnlocked, false);
  assert.equal((await at(WRAPPED_UNLOCK_ROUNDS)).justUnlocked, true);
  assert.equal((await at(WRAPPED_UNLOCK_ROUNDS + 1)).justUnlocked, false);
});

test("the Wrapped and lists APIs refuse a locked or unreleased member", async () => {
  const env = { RECORD_CLUB_RELEASE: "all" };
  await assert.rejects(requireWrappedAccess(fakeDb({ played: 3 }), env, friend), { code: "wrapped_locked", status: 403 });
  await assert.rejects(requireWrappedAccess(fakeDb({ played: 99 }), {}, friend), { code: "games_not_open", status: 403 });
  const unlock = await requireWrappedAccess(fakeDb({ played: WRAPPED_UNLOCK_ROUNDS }), env, friend);
  assert.equal(unlock.unlocked, true);
});
