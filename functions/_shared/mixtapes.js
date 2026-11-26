// Mixtapes: Crates with people for groups. Sixteen records, four friends, and each friend's
// four records make one group. A round is drawn fresh from the group's lists every time.

export const MIXTAPE_PEOPLE = 4;
export const MIXTAPE_RECORDS = 4;

function shuffled(items, random) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

// rows: every pick in the player's group except the player's own, as
// { userId, username, spotifyId, title, artist, imageUrl, note }.
// Only records that one friend alone picked can go in a mixtape, so every record fits
// exactly one group; records without a cover are left out too. Returns null when fewer
// than four friends have four such records.
export function buildMixtapes(rows, random = Math.random) {
  const pickers = new Map();
  for (const row of rows) {
    if (!pickers.has(row.spotifyId)) pickers.set(row.spotifyId, new Set());
    pickers.get(row.spotifyId).add(row.userId);
  }
  const people = new Map();
  for (const row of rows) {
    if (pickers.get(row.spotifyId).size !== 1 || !String(row.imageUrl || "").trim()) continue;
    if (!people.has(row.userId)) people.set(row.userId, { username: row.username, records: [] });
    people.get(row.userId).records.push(row);
  }
  const ready = [...people.values()].filter((person) => person.records.length >= MIXTAPE_RECORDS);
  if (ready.length < MIXTAPE_PEOPLE) return null;
  return {
    groups: shuffled(ready, random).slice(0, MIXTAPE_PEOPLE).map((person) => ({
      label: `${person.username}'s mixtape`,
      records: shuffled(person.records, random).slice(0, MIXTAPE_RECORDS).map((record) => ({
        spotifyId: record.spotifyId,
        title: record.title,
        artist: record.artist,
        why: String(record.note || "").trim(),
        imageUrl: record.imageUrl,
      })),
    })),
  };
}
