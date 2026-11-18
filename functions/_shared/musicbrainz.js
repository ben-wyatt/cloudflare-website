// Album language from MusicBrainz (ISO 639-3: eng, spa, jpn; zxx = no lyrics; qaa = invented).
// MusicBrainz allows about one request a second, so callers look albums up one at a time.
const USER_AGENT = "record-club-language-lookup/0.1";

const luceneText = (value) => String(value).replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1");
const plain = (value) => String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// "Album (Deluxe Edition)" and "Album - Remastered" search as "Album".
const baseTitle = (name) => String(name).replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/\s+-\s+.*$/, "").trim() || String(name);
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// "Ms. Lauryn Hill" and "Lauryn Hill", or "Denzel Curry, Kenny Beats" and
// "Denzel Curry & Kenny Beats", share a distinctive word.
function sameArtist(credit, artistName) {
  const words = new Set(credit.split(" ").filter((word) => word.length >= 3));
  return plain(artistName).split(" ").some((word) => word.length >= 3 && words.has(word));
}

// Returns a language code, or null when MusicBrainz has no answer.
// Throws when MusicBrainz stays busy, so the album can be tried again later.
export async function lookupAlbumLanguage({ name, artistName }, { retries = 5, backoffMs = 4000 } = {}) {
  const title = baseTitle(name);
  // A compilation credits its composers, so it is searched by title alone.
  const compilation = /^various artists$/i.test(String(artistName).trim());
  const artistWords = plain(artistName).split(" ").filter((word) => word.length >= 3);
  const query = `release:"${luceneText(title)}"`
    + (compilation || !artistWords.length ? "" : ` AND (${artistWords.map((word) => `artist:${luceneText(word)}`).join(" OR ")})`);
  const url = `https://musicbrainz.org/ws/2/release/?fmt=json&limit=25&query=${encodeURIComponent(query)}`;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
    if (response.status === 503 || response.status === 429) {
      await wait(backoffMs * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`MusicBrainz answered ${response.status}`);
    const releases = (await response.json()).releases || [];
    // Count the languages of close matches: same title and a matching artist credit.
    const votes = new Map();
    for (const release of releases) {
      if (Number(release.score) < 85 || plain(baseTitle(release.title)) !== plain(title)) continue;
      const credit = plain((release["artist-credit"] || []).map((part) => `${part.name}${part.joinphrase || ""}`).join(""));
      if (!compilation && !sameArtist(credit, artistName)) continue;
      const language = release["text-representation"]?.language;
      if (language) votes.set(language, (votes.get(language) || 0) + 1);
    }
    return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  throw new Error("MusicBrainz stayed busy");
}

// Looks up and saves the language of albums not looked up yet, one a second.
// A busy MusicBrainz leaves an album unmarked, so the next save tries it again.
export async function enrichAlbumLanguages(db, albums) {
  let asked = 0;
  for (const album of albums) {
    const existing = await db.prepare(
      "SELECT language_fetched_at FROM record_albums WHERE spotify_id = ?",
    ).bind(album.spotifyId).first();
    if (!existing || existing.language_fetched_at) continue;
    if (asked > 0) await wait(1100);
    asked += 1;
    try {
      const language = await lookupAlbumLanguage(album, { retries: 2, backoffMs: 2000 });
      await db.prepare(
        `UPDATE record_albums SET language = ?, language_fetched_at = ?
         WHERE spotify_id = ? AND language_fetched_at IS NULL`,
      ).bind(language, new Date().toISOString(), album.spotifyId).run();
    } catch {
      console.warn("MusicBrainz language lookup failed", album.spotifyId);
    }
  }
}
