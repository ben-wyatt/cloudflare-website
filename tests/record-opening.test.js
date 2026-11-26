import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/records/_middleware.js";

const COUNTDOWN = '<section id="opening" data-opens-at="" data-server-now="">countdown</section>';
const hourFromNow = () => new Date(Date.now() + 3_600_000).toISOString();
const secondAgo = () => new Date(Date.now() - 1000).toISOString();

// A request through the /records middleware, signed in as `user` (or signed out).
async function visit(path, env, user = null) {
  const fetched = [];
  const db = {
    prepare() {
      return { bind() { return this; }, async first() { return user; } };
    },
  };
  const headers = user ? { cookie: "record_session=token" } : {};
  const response = await onRequest({
    request: new Request(`https://ben-wyatt.com${path}`, { headers }),
    env: {
      DB: db,
      ASSETS: {
        async fetch(url) {
          fetched.push(new URL(url).pathname);
          return new Response(COUNTDOWN, { headers: { "content-type": "text/html", etag: '"abc"' } });
        },
      },
      ...env,
    },
    next: async () => (path === "/records/opening/"
      ? new Response(COUNTDOWN, { headers: { "content-type": "text/html" } })
      : new Response("the game")),
  });
  return { response, body: await response.text(), fetched };
}

const friend = { id: "u1", username: "alex", groupId: "badabing" };

test("before the opening, friends and signed-out visitors see the countdown", async () => {
  const opensAt = hourFromNow();
  for (const user of [friend, null]) {
    const { response, body, fetched } = await visit("/records/guess/", { RECORD_CLUB_OPENS_AT: opensAt }, user);
    assert.equal(response.status, 403);
    assert.deepEqual(fetched, ["/records/opening/"]);
    assert.match(body, new RegExp(`data-opens-at="${new Date(opensAt).toISOString()}"`));
    assert.match(body, /data-server-now="\d{4}-\d\d-\d\dT[\d:.]+Z"/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("etag"), null);
  }
});

test("owners play before the opening; everyone in a group plays after it", async () => {
  assert.equal((await visit("/records/games/", { RECORD_CLUB_OPENS_AT: hourFromNow() }, { ...friend, username: "ben" })).body, "the game");
  assert.equal((await visit("/records/games/", { RECORD_CLUB_OPENS_AT: secondAgo() }, friend)).body, "the game");
  // Signed out after the opening: the page's own sign-in prompt.
  assert.equal((await visit("/records/games/", { RECORD_CLUB_OPENS_AT: secondAgo() })).body, "the game");
});

test("with no opening time, or after it for an account without a group, the plain refusal stays", async () => {
  const noTime = await visit("/records/games/", {}, friend);
  assert.equal(noTime.response.status, 403);
  assert.equal(noTime.body, "The Record Club minigames are not open yet.");
  const noGroup = await visit("/records/games/", { RECORD_CLUB_OPENS_AT: secondAgo() }, { ...friend, groupId: null });
  assert.equal(noGroup.body, "The Record Club minigames are not open yet.");
  assert.deepEqual(noGroup.fetched, []);
});

test("the countdown page itself gets the times, and other pages pass through", async () => {
  const { response, body } = await visit("/records/opening/", { RECORD_CLUB_OPENS_AT: hourFromNow() });
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /data-opens-at=""/);
  assert.equal((await visit("/records/", { RECORD_CLUB_OPENS_AT: hourFromNow() })).body, "the game");
});

test("the session tells a closed member when the minigames open, and no one else", async () => {
  const { onRequestGet } = await import("../functions/api/auth/me.js");
  const me = async (user, opensAt) => {
    const db = {
      prepare(sql) {
        return {
          bind() { return this; },
          async first(column) {
            if (sql.includes("record_sessions")) return user;
            if (sql.includes("record_game_plays")) return column ? 12 : { count: 12 };
            return { ready: 1 };
          },
        };
      },
    };
    const request = new Request("https://ben-wyatt.com/api/auth/me", { headers: { cookie: "record_session=token" } });
    const payload = await (await onRequestGet({ request, env: { DB: db, RECORD_CLUB_OPENS_AT: opensAt } })).json();
    return payload.user.recordClub;
  };
  const future = hourFromNow();
  assert.deepEqual(await me(friend, future), { gamesOpen: false, opensAt: new Date(future).toISOString(), wrappedUnlock: null });
  assert.equal((await me({ ...friend, username: "ben" }, future)).opensAt, null);
  const opened = await me(friend, secondAgo());
  assert.equal(opened.gamesOpen, true);
  assert.equal(opened.opensAt, null);
});
