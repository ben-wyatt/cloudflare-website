export const WRAPPED_ALGORITHM_VERSION = 1;

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), "en", { sensitivity: "base" });
}

function countWords(value) {
  return (String(value || "").match(/[\p{L}\p{N}]+(?:['’’-][\p{L}\p{N}]+)*/gu) || []).length;
}

function person(row) {
  return { id: row.userId, username: row.username };
}

function album(row) {
  return {
    spotifyId: row.spotifyId,
    name: row.name,
    artistName: row.artistName,
    imageUrl: row.imageUrl || null,
    spotifyUrl: row.spotifyUrl,
    releaseDate: row.releaseDate || null,
    totalTracks: Math.max(0, Number(row.totalTracks || 0)),
    totalDurationMs: Math.max(0, Number(row.totalDurationMs || 0)),
  };
}

function uniqueBy(values, keyFor) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function topTies(values, valueFor) {
  if (!values.length) return [];
  const topValue = valueFor(values[0]);
  return values.filter((value) => valueFor(value) === topValue);
}

function releaseYear(value) {
  const match = String(value || "").match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function generateWrappedStats({
  season,
  members = [],
  picks = [],
  standouts = [],
  favorites = [],
  albumArtists = [],
}) {
  const peopleById = new Map();
  for (const member of members) peopleById.set(member.userId, person(member));
  for (const row of [...picks, ...standouts, ...favorites]) {
    if (row.userId && !peopleById.has(row.userId)) peopleById.set(row.userId, person(row));
  }

  const uniquePicks = uniqueBy(
    picks.filter((row) => row.userId && row.spotifyId),
    (row) => `${row.userId}\u0000${row.spotifyId}`,
  );
  const albumsById = new Map();
  const picksByAlbum = new Map();
  const picksByPerson = new Map();
  for (const row of uniquePicks) {
    if (!albumsById.has(row.spotifyId)) albumsById.set(row.spotifyId, album(row));
    if (!picksByAlbum.has(row.spotifyId)) picksByAlbum.set(row.spotifyId, []);
    if (!picksByPerson.has(row.userId)) picksByPerson.set(row.userId, []);
    picksByAlbum.get(row.spotifyId).push(row);
    picksByPerson.get(row.userId).push(row);
  }

  const contributors = [...picksByPerson.keys()]
    .map((userId) => peopleById.get(userId))
    .filter(Boolean)
    .sort((left, right) => compareText(left.username, right.username));
  const uniqueAlbums = [...albumsById.values()];
  const enrichedAlbums = uniqueAlbums.filter((item) => item.totalDurationMs > 0);

  const notesByPerson = new Map();
  const noteRows = [
    ...uniquePicks.map((row) => ({ ...row, noteType: "album", subject: album(row) })),
    ...standouts
      .filter((row) => row.userId && row.spotifyId)
      .map((row) => ({
        ...row,
        noteType: "track",
        subject: {
          spotifyId: row.spotifyId,
          name: row.name,
          artistName: row.artistName,
          imageUrl: row.imageUrl || null,
          spotifyUrl: row.spotifyUrl,
          albumName: row.albumName || null,
        },
      })),
  ].map((row) => ({ ...row, wordCount: countWords(row.review) }))
    .filter((row) => row.wordCount > 0);
  for (const row of noteRows) {
    const tally = notesByPerson.get(row.userId) || { wordCount: 0, noteCount: 0 };
    tally.wordCount += row.wordCount;
    tally.noteCount += 1;
    notesByPerson.set(row.userId, tally);
  }
  const writerTallies = [...notesByPerson.entries()]
    .map(([userId, tally]) => ({ person: peopleById.get(userId), ...tally }))
    .filter((entry) => entry.person)
    .sort((left, right) => (
      right.wordCount - left.wordCount
      || right.noteCount - left.noteCount
      || compareText(left.person.username, right.person.username)
    ));
  const longestNotes = noteRows
    .map((row) => ({
      person: peopleById.get(row.userId),
      wordCount: row.wordCount,
      noteType: row.noteType,
      subject: row.subject,
    }))
    .filter((entry) => entry.person)
    .sort((left, right) => (
      right.wordCount - left.wordCount
      || compareText(left.person.username, right.person.username)
      || compareText(left.subject.name, right.subject.name)
    ));

  const listenerIds = [...picksByPerson.keys()].sort((leftId, rightId) => (
    compareText(peopleById.get(leftId)?.username, peopleById.get(rightId)?.username)
  ));
  const listenerSets = new Map(
    listenerIds.map((userId) => [userId, new Set(picksByPerson.get(userId).map((row) => row.spotifyId))]),
  );
  const listenerPairs = [];
  for (let leftIndex = 0; leftIndex < listenerIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < listenerIds.length; rightIndex += 1) {
      const leftId = listenerIds[leftIndex];
      const rightId = listenerIds[rightIndex];
      const leftSet = listenerSets.get(leftId);
      const rightSet = listenerSets.get(rightId);
      const sharedIds = [...leftSet].filter((spotifyId) => rightSet.has(spotifyId));
      if (!sharedIds.length) continue;
      const unionSize = new Set([...leftSet, ...rightSet]).size;
      listenerPairs.push({
        listeners: [peopleById.get(leftId), peopleById.get(rightId)],
        sharedAlbums: sharedIds
          .map((spotifyId) => albumsById.get(spotifyId))
          .sort((left, right) => compareText(left.artistName, right.artistName) || compareText(left.name, right.name)),
        sharedCount: sharedIds.length,
        similarityScore: sharedIds.length / unionSize,
        similarityPercent: Math.round((sharedIds.length / unionSize) * 100),
        exactMatch: leftSet.size === rightSet.size && sharedIds.length === leftSet.size,
      });
    }
  }
  listenerPairs.sort((left, right) => (
    right.similarityScore - left.similarityScore
    || right.sharedCount - left.sharedCount
    || compareText(left.listeners[0].username, right.listeners[0].username)
    || compareText(left.listeners[1].username, right.listeners[1].username)
  ));

  const sharedRecords = [...picksByAlbum.entries()]
    .filter(([, rows]) => rows.length >= 2)
    .map(([spotifyId, rows]) => ({
      album: albumsById.get(spotifyId),
      listeners: rows
        .map((row) => peopleById.get(row.userId))
        .filter(Boolean)
        .sort((left, right) => compareText(left.username, right.username)),
      listenerCount: rows.length,
    }))
    .sort((left, right) => (
      right.listenerCount - left.listenerCount
      || compareText(left.album.artistName, right.album.artistName)
      || compareText(left.album.name, right.album.name)
    ));

  const scoutTallies = listenerIds.map((userId) => {
    const soloAlbums = picksByPerson.get(userId)
      .filter((row) => picksByAlbum.get(row.spotifyId).length === 1)
      .map((row) => albumsById.get(row.spotifyId))
      .sort((left, right) => compareText(left.artistName, right.artistName) || compareText(left.name, right.name));
    return { person: peopleById.get(userId), count: soloAlbums.length, albums: soloAlbums };
  }).filter((entry) => entry.count > 0)
    .sort((left, right) => (
      right.count - left.count || compareText(left.person.username, right.person.username)
    ));

  const datedAlbums = uniqueAlbums.filter((item) => releaseYear(item.releaseDate) !== null)
    .sort((left, right) => (
      String(left.releaseDate).localeCompare(String(right.releaseDate))
      || compareText(left.artistName, right.artistName)
      || compareText(left.name, right.name)
    ));
  const timeSpans = listenerIds.map((userId) => {
    const years = picksByPerson.get(userId)
      .map((row) => releaseYear(row.releaseDate))
      .filter((year) => year !== null);
    if (years.length < 2) return null;
    const earliestYear = Math.min(...years);
    const latestYear = Math.max(...years);
    return {
      person: peopleById.get(userId),
      earliestYear,
      latestYear,
      spanYears: latestYear - earliestYear,
    };
  }).filter((entry) => entry && entry.spanYears > 0)
    .sort((left, right) => (
      right.spanYears - left.spanYears || compareText(left.person.username, right.person.username)
    ));

  const artistsByAlbum = new Map();
  for (const row of albumArtists) {
    if (!row.spotifyAlbumId || !row.spotifyArtistId || !albumsById.has(row.spotifyAlbumId)) continue;
    if (!artistsByAlbum.has(row.spotifyAlbumId)) artistsByAlbum.set(row.spotifyAlbumId, []);
    artistsByAlbum.get(row.spotifyAlbumId).push(row);
  }
  const artistThreadsById = new Map();
  for (const [spotifyAlbumId, artistRows] of artistsByAlbum) {
    for (const artistRow of artistRows) {
      if (!artistThreadsById.has(artistRow.spotifyArtistId)) {
        artistThreadsById.set(artistRow.spotifyArtistId, {
          artist: {
            spotifyId: artistRow.spotifyArtistId,
            name: artistRow.artistName,
            spotifyUrl: artistRow.artistSpotifyUrl || null,
          },
          albumIds: new Set(),
          listenerIds: new Set(),
        });
      }
      const thread = artistThreadsById.get(artistRow.spotifyArtistId);
      thread.albumIds.add(spotifyAlbumId);
      for (const pick of picksByAlbum.get(spotifyAlbumId) || []) thread.listenerIds.add(pick.userId);
    }
  }
  const artistThreads = [...artistThreadsById.values()]
    .filter((thread) => thread.albumIds.size >= 2 && thread.listenerIds.size >= 2)
    .map((thread) => ({
      artist: thread.artist,
      albums: [...thread.albumIds].map((spotifyId) => albumsById.get(spotifyId))
        .sort((left, right) => compareText(left.name, right.name)),
      listeners: [...thread.listenerIds].map((userId) => peopleById.get(userId))
        .filter(Boolean)
        .sort((left, right) => compareText(left.username, right.username)),
      albumCount: thread.albumIds.size,
      listenerCount: thread.listenerIds.size,
    }))
    .sort((left, right) => (
      right.listenerCount - left.listenerCount
      || right.albumCount - left.albumCount
      || compareText(left.artist.name, right.artist.name)
    ));

  const favoriteGroups = new Map();
  for (const row of uniqueBy(
    favorites.filter((item) => item.userId && item.spotifyAlbumId && item.spotifyTrackId),
    (item) => `${item.userId}\u0000${item.spotifyAlbumId}\u0000${item.spotifyTrackId}`,
  )) {
    const key = `${row.spotifyAlbumId}\u0000${row.spotifyTrackId}`;
    if (!favoriteGroups.has(key)) favoriteGroups.set(key, []);
    favoriteGroups.get(key).push(row);
  }
  const favoritePileOns = [...favoriteGroups.values()]
    .filter((rows) => new Set(rows.map((row) => row.userId)).size >= 2)
    .map((rows) => ({
      track: {
        spotifyId: rows[0].spotifyTrackId,
        name: rows[0].trackName || "A shared favorite track",
        artistName: rows[0].trackArtistName || albumsById.get(rows[0].spotifyAlbumId)?.artistName || "",
        spotifyUrl: rows[0].trackSpotifyUrl || null,
      },
      album: albumsById.get(rows[0].spotifyAlbumId) || null,
      listeners: uniqueBy(
        rows.map((row) => peopleById.get(row.userId)).filter(Boolean),
        (item) => item.id,
      ).sort((left, right) => compareText(left.username, right.username)),
    }))
    .sort((left, right) => (
      right.listeners.length - left.listeners.length
      || compareText(left.track.name, right.track.name)
    ));

  const standoutCrossovers = [];
  for (const row of standouts) {
    if (!row.albumSpotifyId || !picksByAlbum.has(row.albumSpotifyId)) continue;
    const otherListeners = uniqueBy(
      picksByAlbum.get(row.albumSpotifyId)
        .filter((pick) => pick.userId !== row.userId)
        .map((pick) => peopleById.get(pick.userId))
        .filter(Boolean),
      (item) => item.id,
    ).sort((left, right) => compareText(left.username, right.username));
    if (!otherListeners.length) continue;
    standoutCrossovers.push({
      track: {
        spotifyId: row.spotifyId,
        name: row.name,
        artistName: row.artistName,
        albumName: row.albumName,
        imageUrl: row.imageUrl || null,
        spotifyUrl: row.spotifyUrl,
      },
      standoutListener: peopleById.get(row.userId),
      albumListeners: otherListeners,
    });
  }
  standoutCrossovers.sort((left, right) => (
    right.albumListeners.length - left.albumListeners.length
    || compareText(left.track.artistName, right.track.artistName)
    || compareText(left.track.name, right.track.name)
  ));

  const durationComplete = uniqueAlbums.length > 0 && enrichedAlbums.length === uniqueAlbums.length;
  const longestRecords = (durationComplete ? [...enrichedAlbums] : [])
    .sort((left, right) => (
      right.totalDurationMs - left.totalDurationMs
      || compareText(left.artistName, right.artistName)
      || compareText(left.name, right.name)
    ));

  return {
    algorithmVersion: WRAPPED_ALGORITHM_VERSION,
    season,
    room: {
      memberCount: peopleById.size,
      contributorCount: contributors.length,
      contributors,
      pickCount: uniquePicks.length,
      uniqueAlbumCount: uniqueAlbums.length,
      standoutCount: standouts.length,
      favoriteSelectionCount: favorites.length,
      noteWordCount: noteRows.reduce((total, row) => total + row.wordCount, 0),
      totalDurationMs: enrichedAlbums.reduce((total, item) => total + item.totalDurationMs, 0),
      durationAlbumCount: enrichedAlbums.length,
      durationComplete,
    },
    sharedTaste: {
      closestListeners: topTies(listenerPairs, (entry) => entry.similarityScore),
      roomRecords: topTies(sharedRecords, (entry) => entry.listenerCount),
    },
    people: {
      mostWords: topTies(writerTallies, (entry) => entry.wordCount),
      longestNotes: topTies(longestNotes, (entry) => entry.wordCount),
      scouts: topTies(scoutTallies, (entry) => entry.count),
      widestTimeSpans: topTies(timeSpans, (entry) => entry.spanYears),
    },
    records: {
      longest: topTies(longestRecords, (entry) => entry.totalDurationMs),
      oldest: datedAlbums.length ? [datedAlbums[0]] : [],
      newest: datedAlbums.length ? [datedAlbums[datedAlbums.length - 1]] : [],
    },
    connections: {
      artistThreads: artistThreads.slice(0, 5),
      favoritePileOns: favoritePileOns.slice(0, 5),
      standoutCrossovers: standoutCrossovers.slice(0, 5),
    },
  };
}
