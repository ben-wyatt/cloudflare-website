const GENRES = [
  ["hip-hop", /hip.?hop|rap|boom bap|trap|drumless|plugg/i],
  ["r&b", /r.?n.?b|rhythm and blues|neo.?soul/i],
  ["jazz", /jazz|bebop|fusion/i],
  ["country", /country|bluegrass|americana/i],
  ["rock", /rock|post.?punk|punk|metal|grunge|krautrock|avant.?prog/i],
  ["pop", /pop|hyperpop|synthpop|electropop|bubblegum bass/i],
  ["electronic", /electronic|electronica|house|techno|garage|ambient|downtempo|trip.?hop|disco|dance|acid/i],
  ["folk", /folk|singer.?songwriter/i],
  ["funk", /funk/i],
  ["reggae", /reggae|dub|ska/i],
  ["classical", /classical|orchestral/i],
  ["psychedelia", /psychedelic|neo.?psychedelia/i],
  ["world", /worldbeat|mpb|bossa nova|afrobeat|raga/i],
];

const byName = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" });
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const year = (value) => Number(String(value || "").slice(0, 4)) || null;
const person = (row) => ({ id: row.userId, username: row.username });
const names = (people) => people.map((item) => item.username).sort(byName).join(", ");
const album = (row) => ({
  spotifyId: row.spotifyId,
  name: row.name,
  artistName: row.artistName,
  imageUrl: row.imageUrl || null,
  spotifyUrl: row.spotifyUrl || null,
  releaseDate: row.releaseDate || null,
  totalTracks: number(row.totalTracks),
  totalDurationMs: number(row.totalDurationMs),
});
const ordered = (rows) => [...rows].sort((a, b) =>
  byName(a.artistName || "", b.artistName || "") || byName(a.name || "", b.name || ""));

function genresFor(row) {
  let tags;
  try {
    tags = JSON.parse(row.lastfmTagsJson || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(tags)) return [];
  const found = new Set();
  for (const tag of tags) {
    if (number(tag.count) < 3) continue;
    const name = String(tag.name || "").trim();
    // Ignore dates, arbitrary personal tags and auto-generated labels.
    if (!name || /^\d{4}( releases)?$/i.test(name) || name === "auto-tagged") continue;
    for (const [family, pattern] of GENRES) {
      if (pattern.test(name)) found.add(family);
    }
  }
  return [...found].sort(byName);
}

function vectorFor(rows, genreByAlbum) {
  const vector = new Map();
  let tagged = 0;
  for (const row of rows) {
    const genres = genreByAlbum.get(row.spotifyId) || [];
    if (!genres.length) continue;
    tagged += 1;
    for (const genre of genres) vector.set(genre, (vector.get(genre) || 0) + 1 / genres.length);
  }
  if (tagged) for (const [genre, value] of vector) vector.set(genre, value / tagged);
  return { vector, tagged };
}

function similarity(left, right) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  let dot = 0;
  let a = 0;
  let b = 0;
  for (const key of keys) {
    const l = left.get(key) || 0;
    const r = right.get(key) || 0;
    dot += l * r;
    a += l * l;
    b += r * r;
  }
  return a && b ? dot / Math.sqrt(a * b) : null;
}

function tasteMix(vector) {
  return [...vector].sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))
    .slice(0, 2)
    .map(([genre, share]) => `${genre} ${Math.round(share * 100)}%`)
    .join(", ");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function top(rows, score, descending = true) {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) =>
    (descending ? score(b) - score(a) : score(a) - score(b)) || byName(a.label, b.label));
  return sorted.filter((row) => score(row) === score(sorted[0]));
}

function card(id, title, lede, {
  detail = "", records = [], notes = [], wordMap = [], links = [], status = "",
} = {}) {
  return { id, title, lede, detail, records, notes, wordMap, links, status };
}

const noteHref = (row, kind = "album") =>
  `/records/lists/#${kind}-note-${encodeURIComponent(row.userId)}-${encodeURIComponent(row.spotifyId)}`;

const NOTE_STOP_WORDS = new Set((
  "about after again album albums also always and are back been being best but can cant could " +
  "did didnt does dont each even every feel felt first for from get got good great had has have " +
  "here how into its it's just last like listen listening love loved many more most much music " +
  "not now only our out over really record records she should song songs still than that thats " +
  "the their them there these they this those through time too track tracks very was were what " +
  "when where which while who why will with would your you"
).split(" "));

function noteWordMap(rows) {
  const counts = new Map();
  for (const row of rows) {
    const words = new Set((String(row.review || "").toLocaleLowerCase()
      .match(/[\p{L}][\p{L}\p{N}'’-]*/gu) || [])
      .map((word) => word.replace(/^[’']+|[’']+$/g, ""))
      .filter((word) => word.length >= 4 && !NOTE_STOP_WORDS.has(word)));
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))
    .slice(0, 16)
    .map(([word, count]) => ({ word, count }));
}

export function generateWrappedCards({ season, members = [], picks = [], standouts = [], albumArtists = [] }) {
  const cards = [];
  if (!picks.length) return cards;
  picks = [...picks].sort((a, b) => byName(a.username || "", b.username || "")
    || byName(a.artistName || "", b.artistName || "")
    || byName(a.name || "", b.name || "")
    || byName(a.spotifyId || "", b.spotifyId || ""));
  standouts = [...standouts].sort((a, b) => byName(a.username || "", b.username || "")
    || byName(a.name || "", b.name || ""));
  const byPerson = new Map();
  const byAlbum = new Map();
  const albumRows = new Map();
  for (const row of picks) {
    if (!row.userId || !row.spotifyId) continue;
    if (!byPerson.has(row.userId)) byPerson.set(row.userId, []);
    if (!byAlbum.has(row.spotifyId)) byAlbum.set(row.spotifyId, []);
    byPerson.get(row.userId).push(row);
    byAlbum.get(row.spotifyId).push(row);
    albumRows.set(row.spotifyId, row);
  }
  const contributors = [...byPerson.values()].map((rows) => person(rows[0]))
    .sort((a, b) => byName(a.username, b.username));
  const unique = [...albumRows.values()];
  const genreByAlbum = new Map(unique.map((row) => [row.spotifyId, genresFor(row)]));
  const genreVectors = new Map([...byPerson].map(([id, rows]) =>
    [id, vectorFor(rows, genreByAlbum)]));
  const releaseYears = unique.map((row) => year(row.releaseDate)).filter(Boolean);

  cards.push(card("room", "The room in one breath.",
    `${contributors.length} listeners brought ${picks.length} picks and ${unique.length} different records to ${season}.`,
    { detail: releaseYears.length
      ? `The shelves stretch from ${Math.min(...releaseYears)} to ${Math.max(...releaseYears)}.`
      : "" }));

  const shared = [...byAlbum.values()].filter((rows) => rows.length >= 2)
    .sort((a, b) => b.length - a.length || byName(a[0].name, b[0].name));
  if (shared.length) {
    cards.push(card("shared-records", "The records that found more than one home.",
      `${shared.length} ${shared.length === 1 ? "record appears" : "records appear"} on at least two lists.`,
      { records: shared.map((rows) => ({
        ...album(rows[0]), caption: `Picked by ${names(rows.map(person))}`,
      })) }));
    const withNotes = shared.find((rows) => rows.filter((row) => row.review?.trim()).length >= 2);
    const rows = withNotes || shared[0];
    const noteRows = rows.filter((row) => row.review?.trim());
    cards.push(card("same-record-different-reasons", "Same record, different reasons.",
      withNotes
        ? `${noteRows.length} people wrote about ${rows[0].name}; each heard something of their own.`
        : `${rows[0].name} found more than one home. Its notes are still waiting for two different takes.`,
      { records: [album(rows[0])],
        notes: withNotes ? noteRows.map((row) => ({
          author: row.username, text: row.review.trim(), href: noteHref(row),
        })) : [],
        links: [{ href: "/records/lists/", label: "Explore the full lists →" }] }));
  }

  const artistNames = new Map();
  for (const row of albumArtists) {
    if (!albumRows.has(row.spotifyAlbumId)) continue;
    if (!artistNames.has(row.spotifyAlbumId)) artistNames.set(row.spotifyAlbumId, new Set());
    artistNames.get(row.spotifyAlbumId).add(row.artistName);
  }
  const artistGroups = new Map();
  for (const row of unique) {
    const namesForAlbum = new Set(artistNames.get(row.spotifyId) || []);
    namesForAlbum.add(String(row.artistName || "").split(",")[0].trim());
    for (const artistName of namesForAlbum) {
      if (!artistName || /^various artists$/i.test(artistName)) continue;
      const key = artistName.toLocaleLowerCase("en");
      if (!artistGroups.has(key)) artistGroups.set(key, { name: artistName, albumIds: new Set(), people: new Map() });
      const group = artistGroups.get(key);
      group.albumIds.add(row.spotifyId);
      for (const pick of byAlbum.get(row.spotifyId)) group.people.set(pick.userId, person(pick));
    }
  }
  const artistEchoes = [...artistGroups.values()]
    .filter((entry) => entry.albumIds.size >= 2 && entry.people.size >= 2)
    .sort((a, b) => b.people.size - a.people.size || b.albumIds.size - a.albumIds.size || byName(a.name, b.name));
  if (artistEchoes.length) {
    const entry = artistEchoes[0];
    cards.push(card("artist-echo", "Same artist, different door.",
      `${names([...entry.people.values()])} brought ${entry.albumIds.size} different ${entry.name} records.`,
      { records: ordered([...entry.albumIds].map((id) => albumRows.get(id))).map(album) }));
  }

  const eligibleTaste = contributors.filter((listener) => {
    const rows = byPerson.get(listener.id);
    const tagged = genreVectors.get(listener.id).tagged;
    return rows.length >= 3 && tagged >= 2 && tagged / rows.length >= 0.5;
  });
  const pairs = [];
  for (let i = 0; i < eligibleTaste.length; i++) {
    for (let j = i + 1; j < eligibleTaste.length; j++) {
      const left = eligibleTaste[i];
      const right = eligibleTaste[j];
      const score = similarity(genreVectors.get(left.id).vector, genreVectors.get(right.id).vector);
      if (score !== null) pairs.push({ left, right, score, label: `${left.username}/${right.username}` });
    }
  }
  if (pairs.length) {
    const best = top(pairs, (entry) => entry.score)[0];
    const worst = top(pairs, (entry) => entry.score, false)[0];
    const overlap = [...genreVectors.get(best.left.id).vector.keys()]
      .filter((genre) => genreVectors.get(best.right.id).vector.has(genre));
    if (best.score > 0) cards.push(card("music-besties", "Music besties.",
      `${best.left.username} and ${best.right.username} kept reaching for similar sounds.`,
      { detail: `Their common ground: ${overlap.join(", ")}.`,
        records: [best.left, best.right].flatMap((listener) =>
          ordered(byPerson.get(listener.id).filter((row) =>
            genreByAlbum.get(row.spotifyId).some((genre) => overlap.includes(genre)))).slice(0, 3).map(album)) }));
    const leftTaste = genreVectors.get(worst.left.id);
    const rightTaste = genreVectors.get(worst.right.id);
    const sharedGenres = [...leftTaste.vector.keys()]
      .filter((genre) => rightTaste.vector.has(genre));
    if (pairs.length >= 2 && worst.score < best.score) cards.push(card("opposite-ends", "Opposite ends of the couch.",
      `${worst.left.username} and ${worst.right.username} have the least similar genre mix among the listeners with enough tagged picks.`,
      { detail: `Weighted mix: ${worst.left.username} leans ${tasteMix(leftTaste.vector)} (${leftTaste.tagged} tagged records); ${worst.right.username} leans ${tasteMix(rightTaste.vector)} (${rightTaste.tagged} tagged records). ${sharedGenres.length ? `They still share ${sharedGenres.join(" and ")}. ` : ""}Similarity score: ${worst.score.toFixed(2)} (0 = no overlap, 1 = identical mix).`,
        records: [worst.left, worst.right].flatMap((listener) =>
          ordered(byPerson.get(listener.id).filter((row) =>
            genreByAlbum.get(row.spotifyId).length)).slice(0, 3).map(album)) }));
  }

  const audiencePeople = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const audiences = rows.map((row) => number(row.lastfmListeners)).filter((value) => value > 0);
    return { ...listener, label: listener.username, rows, median: audiences.length ? median(audiences) : null };
  }).filter((entry) => entry.rows.length >= 3 && entry.median !== null
    && entry.rows.filter((row) => number(row.lastfmListeners) > 0).length / entry.rows.length >= 0.8);
  const basic = top(audiencePeople, (entry) => entry.median);
  const obscure = top(audiencePeople, (entry) => entry.median, false);
  if (audiencePeople.length >= 2 && basic[0].median > obscure[0].median) cards.push(card("most-basic", "Most basic bitch.",
    `${names(basic)} brought the biggest crowds, by median Last.fm audience size.`,
    { detail: `Median audience size: ${Math.round(basic[0].median).toLocaleString()} listeners per album.`,
      records: [...basic[0].rows].sort((a, b) => number(b.lastfmListeners) - number(a.lastfmListeners)).slice(0, 4).map(album) }));
  if (audiencePeople.length >= 2 && basic[0].median > obscure[0].median) cards.push(card("not-like-other-girls", "Not like other girls.",
    `${names(obscure)} dug furthest into the little rooms of Last.fm.`,
    { detail: `Median audience size: ${Math.round(obscure[0].median).toLocaleString()} listeners per album.`,
      records: [...obscure[0].rows].sort((a, b) => number(a.lastfmListeners) - number(b.lastfmListeners)).slice(0, 4).map(album) }));

  const withAudience = unique.filter((row) => number(row.lastfmListeners) > 0);
  const tiniest = top(withAudience.map((row) => ({ row, label: row.name })), (entry) => number(entry.row.lastfmListeners), false);
  const biggest = top(withAudience.map((row) => ({ row, label: row.name })), (entry) => number(entry.row.lastfmListeners));
  if (withAudience.length >= 2 && number(biggest[0].row.lastfmListeners) > number(tiniest[0].row.lastfmListeners)) cards.push(card("tiniest-violin", "Tiniest violin award.",
    `${tiniest[0].row.name} has the smallest Last.fm audience in the room: ${number(tiniest[0].row.lastfmListeners).toLocaleString()} listeners.`,
    { records: tiniest.map((entry) => album(entry.row)) }));
  if (withAudience.length >= 2 && number(biggest[0].row.lastfmListeners) > number(tiniest[0].row.lastfmListeners)) cards.push(card("biggest-tuba", "Biggest tuba award.",
    `${biggest[0].row.name} has the largest Last.fm audience in the room: ${number(biggest[0].row.lastfmListeners).toLocaleString()} listeners.`,
    { records: biggest.map((entry) => album(entry.row)) }));

  const genrePeople = new Map();
  for (const listener of contributors) {
    for (const genre of genreVectors.get(listener.id).vector.keys()) {
      if (!genrePeople.has(genre)) genrePeople.set(genre, new Set());
      genrePeople.get(genre).add(listener.id);
    }
  }
  const common = top([...genrePeople].map(([genre, people]) =>
    ({ genre, people, label: genre, count: people.size })), (entry) => entry.count);
  if (common.length && common[0].count >= 2) {
    cards.push(card("common-chord", "The common chord.",
      `${common.map((entry) => entry.genre).join(" and ")} reached ${common[0].count} different listeners.`,
      { detail: "Counted by people, so one person's many records cannot decide the room's sound.",
        records: contributors.map((listener) => ordered(byPerson.get(listener.id).filter((row) =>
          common.some((entry) => genreByAlbum.get(row.spotifyId).includes(entry.genre))))[0])
          .filter(Boolean).slice(0, 6).map(album) }));
  }

  const detours = [];
  for (const listener of contributors) {
    const rows = byPerson.get(listener.id);
    if (rows.length < 4 || genreVectors.get(listener.id).tagged < 3) continue;
    for (const row of rows) {
      if (!genreByAlbum.get(row.spotifyId).length) continue;
      const rest = vectorFor(rows.filter((item) => item.spotifyId !== row.spotifyId), genreByAlbum);
      if (rest.tagged < 2) continue;
      const own = vectorFor([row], genreByAlbum);
      detours.push({ listener, row, score: 1 - similarity(own.vector, rest.vector),
        label: `${listener.username}/${row.name}` });
    }
  }
  const detour = top(detours, (entry) => entry.score)[0];
  if (detour && detour.score > 0) cards.push(card("unexpected-detour", "Unexpected detour.",
    `${detour.listener.username} took a turn with ${detour.row.name}.`,
    { detail: `Its ${genreByAlbum.get(detour.row.spotifyId).join(", ")} tags sit furthest from their other picks.`,
      records: [album(detour.row)] }));

  const passports = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const genres = new Set(rows.flatMap((row) => genreByAlbum.get(row.spotifyId) || []));
    const tagged = genreVectors.get(listener.id).tagged;
    return { listener, genres: [...genres].sort(byName), tagged, rows, label: listener.username };
  }).filter((entry) => entry.rows.length >= 3 && entry.tagged >= 3
    && entry.tagged / entry.rows.length >= 0.5);
  const passport = top(passports, (entry) => entry.genres.length);
  if (passports.length >= 2 && passport.length) cards.push(card("genre-passport", "Genre passport.",
    `${names(passport.map((entry) => entry.listener))} visited ${passport[0].genres.length} sound families.`,
    { detail: passport[0].genres.join(", ") + ".",
      records: ordered(passport[0].rows).slice(0, 5).map(album) }));

  const travelers = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const years = rows.map((row) => year(row.releaseDate)).filter(Boolean);
    return { listener, rows, first: Math.min(...years), last: Math.max(...years),
      span: Math.max(...years) - Math.min(...years), label: listener.username };
  }).filter((entry) => entry.rows.length >= 3 && Number.isFinite(entry.span) && entry.span > 0);
  const travelersTop = top(travelers, (entry) => entry.span);
  if (travelersTop.length) cards.push(card("time-traveler", "The time traveler.",
    `${names(travelersTop.map((entry) => entry.listener))} traveled ${travelersTop[0].span} years across their picks.`,
    { detail: `From ${travelersTop[0].first} to ${travelersTop[0].last}.`,
      records: ordered(travelersTop[0].rows.filter((row) =>
        [travelersTop[0].first, travelersTop[0].last].includes(year(row.releaseDate)))).map(album) }));

  const fresh = picks.filter((row) => year(row.releaseDate) === season);
  if (picks.length && fresh.length) {
    const freshPeople = contributors.map((listener) => {
      const rows = byPerson.get(listener.id);
      return { listener, rows, count: rows.filter((row) => year(row.releaseDate) === season).length,
        share: rows.filter((row) => year(row.releaseDate) === season).length / rows.length,
        label: listener.username };
    }).filter((entry) => entry.rows.length >= 3);
    const freshest = top(freshPeople, (entry) => entry.share).filter((entry) => entry.count > 0);
    cards.push(card("fresh-off-press", "Fresh off the press.",
      `${fresh.length} of ${picks.length} picks were released in ${season}.`,
      { detail: freshest.length
        ? `${names(freshest.map((entry) => entry.listener))} had the largest share of new releases.`
        : "",
        records: ordered([...new Map(fresh.map((row) => [row.spotifyId, row])).values()])
          .slice(0, 6).map(album) }));
  }

  const wordCount = (value) => (String(value || "").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const noteRows = [...picks, ...standouts].filter((row) => row.userId && wordCount(row.review));
  const wordMap = noteWordMap(noteRows);
  if (wordMap.length) cards.push(card("word-map", "A map of the margins.",
    `A few words from the room’s ${noteRows.length} notes, sized by how many notes use them.`,
    { detail: "Choose a word to find the notes that used it.", wordMap }));

  cards.push(card("hill-worth-dying-on", "A hill worth dying on.",
    "In construction. A future Jev rerank will surface a note that makes the strongest case for a record.",
    { status: "in construction",
      links: [{ href: "/records/lists/", label: "Read the notes for now →" }] }));
  cards.push(card("one-sentence-liner-note", "One-sentence liner note.",
    "In construction. A future Jev rerank will look for a brief note that says more than its word count suggests.",
    { status: "in construction",
      links: [{ href: "/records/lists/", label: "Read the notes for now →" }] }));
  const noteTotals = new Map();
  for (const row of noteRows) {
    const entry = noteTotals.get(row.userId) || { listener: person(row), words: 0, count: 0,
      records: [] };
    entry.words += wordCount(row.review);
    entry.count++;
    if (row.spotifyId && albumRows.has(row.spotifyId)) entry.records.push(album(row));
    noteTotals.set(row.userId, entry);
  }
  const writers = top([...noteTotals.values()].map((entry) =>
    ({ ...entry, label: entry.listener.username })), (entry) => entry.words);
  if (writers.length) {
    const longest = [...noteRows].sort((a, b) =>
      wordCount(b.review) - wordCount(a.review) || byName(a.username, b.username))[0];
    cards.push(card("written-margins", "Written in the margins.",
      `${names(writers.map((entry) => entry.listener))} left ${writers[0].words} words across ${writers[0].count} ${writers[0].count === 1 ? "note" : "notes"}.`,
      { detail: `The longest single note was ${longest.username}'s ${wordCount(longest.review)}-word take on ${longest.name}.`,
        records: ordered(writers[0].records).slice(0, 3),
        links: [
          { href: noteHref(longest, albumRows.has(longest.spotifyId) ? "album" : "track"),
            label: "Read that note →" },
          ...(albumRows.has(longest.spotifyId) ? [] :
            [{ href: `https://open.spotify.com/track/${encodeURIComponent(longest.spotifyId)}`,
              label: "Play the track on Spotify ↗", external: true }]),
        ] }));
  }

  return cards;
}
