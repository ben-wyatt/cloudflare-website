import assert from "node:assert/strict";
import test from "node:test";

import { generateWrappedStats } from "../functions/_shared/records-wrapped.js";

function pick(userId, username, spotifyId, name, overrides = {}) {
  return {
    userId,
    username,
    spotifyId,
    name,
    artistName: `${name} Artist`,
    imageUrl: null,
    spotifyUrl: `https://open.spotify.com/album/${spotifyId}`,
    releaseDate: "2020-01-01",
    totalTracks: 10,
    totalDurationMs: 2_400_000,
    metadataEnrichedAt: "2026-07-30T00:00:00.000Z",
    review: "",
    ...overrides,
  };
}

const members = [
  { userId: "alex", username: "alex" },
  { userId: "ben", username: "ben" },
  { userId: "casey", username: "casey" },
];

const picks = [
  pick("alex", "alex", "a", "Alpha", {
    artistName: "Shared Artist",
    releaseDate: "1971-03-01",
    totalDurationMs: 2_000_000,
    review: "Bright, strange, and immediately worth another listen.",
  }),
  pick("alex", "alex", "b", "Beta", {
    releaseDate: "1999-01-01",
    totalDurationMs: 2_500_000,
  }),
  pick("ben", "ben", "a", "Alpha", {
    artistName: "Shared Artist",
    releaseDate: "1971-03-01",
    totalDurationMs: 2_000_000,
    review: "I kept finding new corners in this record every single week all summer long.",
  }),
  pick("ben", "ben", "b", "Beta", {
    releaseDate: "1999-01-01",
    totalDurationMs: 2_500_000,
  }),
  pick("ben", "ben", "c", "Gamma", {
    artistName: "Shared Artist",
    releaseDate: "2024-01-01",
    totalDurationMs: 3_000_000,
  }),
  pick("casey", "casey", "d", "Delta", {
    releaseDate: "2026-01-01",
    totalDurationMs: 4_000_000,
  }),
];

const standouts = [
  {
    userId: "alex",
    username: "alex",
    spotifyId: "track-c",
    name: "Gamma Song",
    artistName: "Shared Artist",
    albumName: "Gamma",
    albumSpotifyId: "c",
    imageUrl: null,
    spotifyUrl: "https://open.spotify.com/track/track-c",
    review: "Huge chorus.",
  },
];

const favorites = [
  {
    userId: "alex",
    username: "alex",
    spotifyAlbumId: "a",
    spotifyTrackId: "favorite-a",
    trackName: "The Shared Song",
    trackArtistName: "Shared Artist",
    trackSpotifyUrl: "https://open.spotify.com/track/favorite-a",
  },
  {
    userId: "ben",
    username: "ben",
    spotifyAlbumId: "a",
    spotifyTrackId: "favorite-a",
    trackName: "The Shared Song",
    trackArtistName: "Shared Artist",
    trackSpotifyUrl: "https://open.spotify.com/track/favorite-a",
  },
];

const albumArtists = [
  {
    spotifyAlbumId: "a",
    spotifyArtistId: "artist-shared",
    artistName: "Shared Artist",
    artistSpotifyUrl: "https://open.spotify.com/artist/artist-shared",
  },
  {
    spotifyAlbumId: "c",
    spotifyArtistId: "artist-shared",
    artistName: "Shared Artist",
    artistSpotifyUrl: "https://open.spotify.com/artist/artist-shared",
  },
];

test("Wrapped finds personable set-based stories without pick order", () => {
  const wrapped = generateWrappedStats({
    season: 2026,
    members,
    picks,
    standouts,
    favorites,
    albumArtists,
  });

  assert.equal(wrapped.room.pickCount, 6);
  assert.equal(wrapped.room.uniqueAlbumCount, 4);
  assert.equal(wrapped.room.durationComplete, true);

  const closest = wrapped.sharedTaste.closestListeners[0];
  assert.deepEqual(closest.listeners.map((listener) => listener.username), ["alex", "ben"]);
  assert.equal(closest.sharedCount, 2);
  assert.equal(closest.similarityPercent, 67);
  assert.deepEqual(new Set(closest.sharedAlbums.map((album) => album.spotifyId)), new Set(["a", "b"]));

  assert.deepEqual(
    new Set(wrapped.sharedTaste.roomRecords.map((entry) => entry.album.spotifyId)),
    new Set(["a", "b"]),
  );
  assert.equal(wrapped.records.longest[0].spotifyId, "d");
  assert.deepEqual(
    wrapped.people.mostWords.map((entry) => entry.person.username),
    ["ben"],
  );
  assert.deepEqual(
    wrapped.people.scouts.map((entry) => entry.person.username),
    ["ben", "casey"],
  );
  assert.equal(wrapped.connections.artistThreads[0].artist.name, "Shared Artist");
  assert.deepEqual(
    wrapped.connections.favoritePileOns[0].listeners.map((listener) => listener.username),
    ["alex", "ben"],
  );
  assert.equal(wrapped.connections.standoutCrossovers[0].standoutListener.username, "alex");
  assert.deepEqual(
    wrapped.connections.standoutCrossovers[0].albumListeners.map((listener) => listener.username),
    ["ben"],
  );
});

test("Wrapped results do not change when unordered picks arrive in another order", () => {
  const forward = generateWrappedStats({
    season: 2026,
    members,
    picks,
    standouts,
    favorites,
    albumArtists,
  });
  const reverse = generateWrappedStats({
    season: 2026,
    members: [...members].reverse(),
    picks: [...picks].reverse(),
    standouts: [...standouts].reverse(),
    favorites: [...favorites].reverse(),
    albumArtists: [...albumArtists].reverse(),
  });

  assert.deepEqual(reverse, forward);
});

test("Wrapped waits for every unique album before naming the longest record", () => {
  const incompletePicks = [
    picks[0],
    { ...picks[1], totalDurationMs: 0, metadataEnrichedAt: null },
  ];
  const wrapped = generateWrappedStats({
    season: 2026,
    members,
    picks: incompletePicks,
  });

  assert.equal(wrapped.room.durationComplete, false);
  assert.deepEqual(wrapped.records.longest, []);
});
