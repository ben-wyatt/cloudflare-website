import assert from "node:assert/strict";
import test from "node:test";

import { isRecordClubOwner } from "../functions/_shared/auth.js";

test("only Ben's Record Club accounts can use owner-only features", () => {
  assert.equal(isRecordClubOwner({ username: "ben" }), true);
  assert.equal(isRecordClubOwner({ username: "BEN_DEV" }), true);
  assert.equal(isRecordClubOwner({ username: "alex" }), false);
  assert.equal(isRecordClubOwner(null), false);
});

test("the Record Club page gate covers every game, the new ones included", async () => {
  const { onRequest } = await import("../functions/records/_middleware.js");
  const visit = async (path) => {
    let passedThrough = false;
    const response = await onRequest({
      request: new Request(`https://example.com${path}`),
      env: {},
      next: () => { passedThrough = true; return new Response("page"); },
    });
    return passedThrough ? "open" : response.status;
  };
  for (const path of ["/records/game/", "/records/match/", "/records/wrapped/", "/records/guess/", "/records/crates"]) {
    assert.equal(await visit(path), 403, path);
  }
  assert.equal(await visit("/records/"), "open");
});
