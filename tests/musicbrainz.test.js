import assert from "node:assert/strict";
import test from "node:test";

import { enrichAlbumLanguages, lookupAlbumLanguage } from "../functions/_shared/musicbrainz.js";

function release(title, artist, language, score = 100) {
  return { title, score, "artist-credit": [{ name: artist }], "text-representation": { language } };
}

function answer(releases) {
  return async () => new Response(JSON.stringify({ releases }), { status: 200 });
}

test("the language comes from close matches, by vote", async (t) => {
  t.mock.method(globalThis, "fetch", answer([
    release("Bocanada", "Gustavo Cerati", "spa"),
    release("Bocanada", "Gustavo Cerati", "spa"),
    release("Bocanada", "Gustavo Cerati", "eng"),
    release("Bocanada Live", "Gustavo Cerati", "eng"),
    release("Bocanada", "Someone Else", "eng"),
  ]));
  assert.equal(await lookupAlbumLanguage({ name: "Bocanada (Remastered)", artistName: "Gustavo Cerati" }), "spa");
});

test("a stage name prefix still matches the artist credit", async (t) => {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    seen.push(decodeURIComponent(String(url)));
    return answer([release("The Miseducation of Lauryn Hill", "Lauryn Hill", "eng")])();
  });
  assert.equal(await lookupAlbumLanguage({ name: "The Miseducation of Lauryn Hill", artistName: "Ms. Lauryn Hill" }), "eng");
  assert.match(seen[0], /artist:lauryn OR artist:hill/);
});

test("saving marks only albums not looked up yet", async (t) => {
  t.mock.method(globalThis, "fetch", answer([release("Curió Curió", "Curió Curió", "por")]));
  const updates = [];
  const db = {
    prepare: (sql) => ({
      bind: (...values) => ({
        first: async () => ({ language_fetched_at: values[0] === "done" ? "earlier" : null }),
        run: async () => { updates.push([sql.trim().split(/\s+/)[0], values[0], values[2]]); },
      }),
    }),
  };
  await enrichAlbumLanguages(db, [
    { spotifyId: "done", name: "Old", artistName: "Band" },
    { spotifyId: "new", name: "Curió Curió", artistName: "Curió Curió" },
  ]);
  assert.deepEqual(updates, [["UPDATE", "por", "new"]]);
});
