import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet } from "../functions/api/group-lists.js";

test("full lists stay in the signed-in owner's group", async () => {
  const queries = [];
  const db = {
    prepare(sql) {
      const query = { sql, values: [], bind(...values) { this.values = values; return this; },
        async first() { return { id: "owner", username: "ben", groupId: "badabing" }; } };
      queries.push(query);
      return query;
    },
    async batch(statements) {
      assert.equal(statements.length, 4);
      return statements.map(() => ({ results: [] }));
    },
  };
  const request = new Request("https://example.com/api/group-lists", {
    headers: { cookie: "record_session=test-session" },
  });
  const response = await onRequestGet({ request, env: { DB: db } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).groupId, "badabing");
  assert.equal(queries.length, 5);
  for (const query of queries.slice(1)) {
    assert.match(query.sql, /group_id = \?/);
    assert.ok(query.values.includes("badabing"));
  }
});

test("full lists require a session", async () => {
  const response = await onRequestGet({ request: new Request("https://example.com/api/group-lists"), env: {} });
  assert.equal(response.status, 401);
});
