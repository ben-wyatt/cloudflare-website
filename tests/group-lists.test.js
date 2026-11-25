import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet } from "../functions/api/group-lists.js";
import { WRAPPED_UNLOCK_ROUNDS } from "../functions/_shared/records-config.js";

// A stand-in for D1. The session lookup returns the user; the plays count returns `played`;
// any other single-row query (does the group have game rounds?) finds one.
function fakeDb(user, { played = WRAPPED_UNLOCK_ROUNDS } = {}) {
  const queries = [];
  const batched = [];
  const db = {
    queries,
    batched,
    prepare(sql) {
      const query = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first(column) {
          if (sql.includes("FROM record_game_plays")) return column ? played : { count: played };
          if (sql.includes("FROM record_sessions")) return user;
          return { ready: 1 };
        },
      };
      queries.push(query);
      return query;
    },
    async batch(statements) {
      batched.push(...statements);
      return statements.map(() => ({ results: [] }));
    },
  };
  return db;
}

const request = () => new Request("https://example.com/api/group-lists", {
  headers: { cookie: "record_session=test-session" },
});

test("full lists stay in the signed-in owner's group", async () => {
  const db = fakeDb({ id: "owner", username: "ben", groupId: "badabing" });
  const response = await onRequestGet({ request: request(), env: { DB: db } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).groupId, "badabing");
  assert.equal(db.batched.length, 4);
  for (const query of db.batched) {
    assert.match(query.sql, /group_id = \?/);
    assert.ok(query.values.includes("badabing"));
  }
});

test("full lists require a session", async () => {
  const response = await onRequestGet({ request: new Request("https://example.com/api/group-lists"), env: {} });
  assert.equal(response.status, 401);
});

test("full lists stay closed to a friend before the release", async () => {
  const db = fakeDb({ id: "u1", username: "alex", groupId: "badabing" });
  const response = await onRequestGet({ request: request(), env: { DB: db } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "games_not_open");
  assert.equal(db.batched.length, 0);
});

test("full lists stay closed until a released friend has played enough rounds", async () => {
  const friend = { id: "u1", username: "alex", groupId: "badabing" };
  const env = (db) => ({ DB: db, RECORD_CLUB_RELEASE: "all" });

  const locked = fakeDb(friend, { played: WRAPPED_UNLOCK_ROUNDS - 1 });
  const lockedResponse = await onRequestGet({ request: request(), env: env(locked) });
  assert.equal(lockedResponse.status, 403);
  assert.equal((await lockedResponse.json()).error.code, "wrapped_locked");
  assert.equal(locked.batched.length, 0);

  const unlocked = fakeDb(friend, { played: WRAPPED_UNLOCK_ROUNDS });
  const unlockedResponse = await onRequestGet({ request: request(), env: env(unlocked) });
  assert.equal(unlockedResponse.status, 200);
});
