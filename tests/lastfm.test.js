import assert from "node:assert/strict";
import test from "node:test";

import { getLastFmAlbum } from "../functions/_shared/lastfm.js";

test("Last.fm album lookup keeps audience and tags only for the requested album", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => Response.json(String(url).includes("album.gettoptags")
    ? { toptags: { tag: [{ name: "bluegrass", count: 100 }, { name: "country", count: 8 }] } }
    : {
      album: {
        name: "The Grass Is Blue",
        artist: "Dolly Parton",
        listeners: "30548",
        playcount: "314455",
        url: "https://www.last.fm/music/Dolly+Parton/The+Grass+Is+Blue",
        tags: { tag: [{ name: "bluegrass" }] },
      },
    });
  const album = await getLastFmAlbum({ LASTFM_API_KEY: "test-key" }, {
    name: "The Grass Is Blue",
    artistName: "Dolly Parton",
  });
  assert.equal(album.listeners, 30548);
  assert.equal(album.playcount, 314455);
  assert.deepEqual(album.tags, [
    { name: "bluegrass", count: 100 },
    { name: "country", count: 8 },
  ]);

  const mismatch = await getLastFmAlbum({ LASTFM_API_KEY: "test-key" }, {
    name: "Different Album",
    artistName: "Dolly Parton",
  });
  assert.equal(mismatch, null);
});
