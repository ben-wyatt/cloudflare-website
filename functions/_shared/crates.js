// Crates: sixteen records, four hidden groups of four, each group a fact the records share
// (Connections-style). Puzzles are written by hand, loaded with scripts/load-crates.mjs, and
// stored in record_cover_puzzles.payload_json.

// Problems with a puzzle, as plain sentences; an empty list means it can be saved.
// knownIds: the Spotify album ids this group picked.
export function checkPuzzle(puzzle, knownIds) {
  const problems = [];
  const name = puzzle?.id || "A puzzle";
  if (!/^[a-z0-9-]{3,64}$/.test(String(puzzle?.id || ""))) problems.push(`${name} needs an id of lowercase letters, digits and dashes.`);
  const groups = Array.isArray(puzzle?.groups) ? puzzle.groups : [];
  if (groups.length !== 4) problems.push(`${name} needs four groups.`);
  const levels = groups.map((group) => Number(group.level)).sort();
  if (levels.join(",") !== "1,2,3,4") problems.push(`${name} needs one group at each level from 1 to 4.`);
  const seen = new Set();
  for (const group of groups) {
    if (!String(group.label || "").trim()) problems.push(`${name} has a group without a label.`);
    const records = Array.isArray(group.records) ? group.records : [];
    if (records.length !== 4) problems.push(`${name}: "${group.label}" needs four records.`);
    for (const record of records) {
      if (seen.has(record.spotifyId)) problems.push(`${name}: ${record.title || record.spotifyId} appears twice.`);
      seen.add(record.spotifyId);
      if (!knownIds.has(record.spotifyId)) problems.push(`${name}: ${record.title || record.spotifyId} is not one of this group's records.`);
      if (!String(record.why || "").trim()) problems.push(`${name}: ${record.title || record.spotifyId} needs a "why".`);
    }
  }
  return problems;
}

// What the page gets: covers, titles and each record's "why", shown once its group is found.
export function publicPuzzle(payload, coversById) {
  return {
    id: payload.id,
    title: payload.title || "",
    groups: (payload.groups || []).map((group) => ({
      level: Number(group.level),
      label: String(group.label || ""),
      records: (group.records || []).map((record) => ({
        spotifyId: record.spotifyId,
        title: record.title,
        artist: record.artist,
        why: record.why,
        imageUrl: coversById.get(record.spotifyId) || null,
      })),
    })).sort((a, b) => a.level - b.level),
  };
}
