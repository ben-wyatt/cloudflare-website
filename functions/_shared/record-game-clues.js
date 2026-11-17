// Who Picked It? clues. A round starts with only the cover.
//   Clue 1 (first miss): the album itself (name, artist, year, genres and so on).
//   Clue 2 (second miss): every listener's top tracks and note.
// A listener the player has already found shows their tracks and note at once.
export function isAlbumClueVisible(clueLevel) {
  return (Number(clueLevel) || 0) >= 1;
}

export function getListenerClueVisibility(userId, clueLevel, foundUserIds = new Set()) {
  const shown = foundUserIds.has(userId) || (Number(clueLevel) || 0) >= 2;
  return { favoriteTracks: shown, review: shown };
}

// Last.fm tags, cleaned into a short genre list: no years, personal tags or artist names.
const IGNORED_TAGS = /^(\d{4}s?( releases)?|albums? i own|seen live|favou?rites?|favou?rite albums?|auto-tagged|best of \d{4}|aoty|spotify)$/i;

export function genreTags(tagsJson, artistName = "", limit = 4) {
  let tags;
  try {
    tags = JSON.parse(tagsJson || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(tags)) return [];
  const artist = String(artistName || "").trim().toLowerCase();
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    if (Number(tag?.count) < 3) continue;
    const name = String(tag?.name || "").trim().toLowerCase();
    if (!name || name.length > 32 || IGNORED_TAGS.test(name) || name === artist || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= limit) break;
  }
  return result;
}

export function albumClue(round) {
  const year = Number(String(round.releaseDate || "").slice(0, 4)) || null;
  const spotifyUrl = /^https:\/\/open\.spotify\.com\/album\/[A-Za-z0-9]+$/.test(String(round.spotifyUrl || ""))
    ? round.spotifyUrl
    : `https://open.spotify.com/album/${round.spotifyAlbumId}`;
  return {
    name: String(round.albumName || ""),
    artistName: String(round.artistName || ""),
    spotifyUrl,
    year,
    albumType: String(round.albumType || ""),
    totalTracks: Number(round.totalTracks) || 0,
    totalDurationMs: Number(round.totalDurationMs) || 0,
    listeners: Number(round.lastfmListeners) || 0,
    genres: genreTags(round.lastfmTagsJson, round.artistName),
  };
}

// A short fingerprint of "this listener picked this round's album". The page gets one per
// picker so it can mark a guess right or wrong at once, while the server still keeps score.
export async function answerKey(roundId, userId) {
  const bytes = new TextEncoder().encode(`${roundId}:${userId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
