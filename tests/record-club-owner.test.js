import assert from "node:assert/strict";
import test from "node:test";

import { isRecordClubOwner } from "../functions/_shared/auth.js";

test("only Ben's Record Club accounts can use owner-only features", () => {
  assert.equal(isRecordClubOwner({ username: "ben" }), true);
  assert.equal(isRecordClubOwner({ username: "BEN_DEV" }), true);
  assert.equal(isRecordClubOwner({ username: "alex" }), false);
  assert.equal(isRecordClubOwner(null), false);
});
