// Liner Notes slides show the same records again and again (every dot and ranking row can
// carry its own view), so the payload sends each album's details once, in `albums`, and the
// slides keep only what differs: the id, who picked it, and a caption. The page puts them
// back together.
const ALBUM_FIELDS = ["name", "artistName", "imageUrl", "spotifyUrl", "releaseDate", "totalTracks", "totalDurationMs"];

export function shareAlbums(cards) {
  const albums = {};
  const slim = (record) => {
    if (!record?.spotifyId) return record;
    if (!albums[record.spotifyId]) {
      albums[record.spotifyId] = Object.fromEntries(ALBUM_FIELDS.filter((field) => record[field] !== undefined)
        .map((field) => [field, record[field]]));
    }
    const rest = Object.fromEntries(Object.entries(record).filter(([field]) => !ALBUM_FIELDS.includes(field)));
    return rest;
  };
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const copy = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = key === "records" && Array.isArray(item) ? item.map(slim) : visit(item);
    }
    return copy;
  };
  return { cards: visit(cards || []), albums };
}
