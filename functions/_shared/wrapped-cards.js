import { closerThanNow } from "./history-events.js";

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
  detail = "", records = [], notes = [], wordMap = [], links = [], status = "", cast = [],
  stat = null, ranking = [], mix = [], timeline = null, chips = [], fact = "",
} = {}) {
  return { id, title, lede, detail, records, notes, wordMap, links, status, cast,
    stat, ranking, mix, timeline, chips, fact };
}

// `view` holds the slide parts (stat, records, mix, chips, timeline, fact) to show
// when a reader selects this row.
function rankRow(name, value, display, { highlight = false, sub = "", imageUrl = null, view = null } = {}) {
  return { name, value, display, highlight, sub, imageUrl, view };
}

const percent = (value) => `${Math.round(value * 100)}%`;
const thousands = (value) => Math.round(value).toLocaleString("en-US");

const hasNote = (row) => Boolean(String(row.review || "").trim());

function castRoster(members, picks, standouts, favorites) {
  const roster = new Map();
  const entry = (row) => {
    if (!row.userId) return null;
    if (!roster.has(row.userId)) {
      roster.set(row.userId, { userId: row.userId, username: row.username || "", records: 0, tracks: 0, notes: 0 });
    }
    return roster.get(row.userId);
  };
  for (const member of members) entry(member);
  for (const row of picks) {
    const listener = entry(row);
    if (!listener) continue;
    listener.records += 1;
    if (hasNote(row)) listener.notes += 1;
  }
  for (const row of standouts) {
    const listener = entry(row);
    if (!listener) continue;
    listener.tracks += 1;
    if (hasNote(row)) listener.notes += 1;
  }
  for (const row of favorites) {
    const listener = entry(row);
    if (listener) listener.tracks += 1;
  }
  return [...roster.values()].sort((a, b) => byName(a.username, b.username));
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

export function generateWrappedCards({
  season, members = [], picks = [], standouts = [], favorites = [], albumArtists = [],
}) {
  const cards = [];
  if (!picks.length) return cards;
  cards.push(card("cast", "The cast.", "", { cast: castRoster(members, picks, standouts, favorites) }));
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

  const pickersFor = (row) => names(byAlbum.get(row.spotifyId).map(person));
  const pickersOf = (row) => byAlbum.get(row.spotifyId).map((pick) => pick.username).sort(byName);
  const picked = (row) => ({ ...album(row), pickers: pickersOf(row) });
  const listenersOf = (row) => number(row.lastfmListeners);

  const shared = [...byAlbum.values()].filter((rows) => rows.length >= 2)
    .sort((a, b) => b.length - a.length || byName(a[0].name, b[0].name));
  if (shared.length) {
    cards.push(card("shared-records", "The records that found more than one home.",
      "",
      { stat: { value: shared.length, unit: shared.length === 1 ? "record" : "records" },
        records: shared.map((rows) => ({
          ...album(rows[0]), pickers: rows.map((row) => row.username).sort(byName),
        })) }));
    const withNotes = shared.find((rows) => rows.filter((row) => row.review?.trim()).length >= 2);
    if (withNotes) {
      const noteRows = withNotes.filter((row) => row.review?.trim());
      cards.push(card("same-record-different-reasons", "Same record, different reasons.",
        "",
        { records: [album(withNotes[0])],
          notes: noteRows.map((row) => ({
            author: row.username, text: row.review.trim(), href: noteHref(row),
          })) }));
    }
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
      "",
      { stat: { value: entry.albumIds.size, unit: `${entry.name} records` },
        records: ordered([...entry.albumIds].map((id) => albumRows.get(id))).map(picked),
        ranking: artistEchoes.length >= 2 ? artistEchoes.slice(0, 5).map((echo) =>
          rankRow(echo.name, echo.albumIds.size, `${echo.albumIds.size} records`, {
            highlight: echo === entry, sub: names([...echo.people.values()]),
            view: { stat: { value: echo.albumIds.size, unit: `${echo.name} records` },
              records: ordered([...echo.albumIds].map((id) => albumRows.get(id))).map(picked) },
          })) : [] }));
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
  const mixFor = (a, b) => [a, b].map((listener) => {
    const own = genreVectors.get(listener.id);
    const other = genreVectors.get((listener === a ? b : a).id).vector;
    return { name: listener.username, tagged: own.tagged,
      genres: [...own.vector].sort((x, y) => y[1] - x[1] || byName(x[0], y[0])).slice(0, 5)
        .map(([genre, share]) => ({ genre, share, shared: other.has(genre) })) };
  });
  const pairRecords = (pair) => {
    const overlap = [...genreVectors.get(pair.left.id).vector.keys()]
      .filter((genre) => genreVectors.get(pair.right.id).vector.has(genre));
    return [pair.left, pair.right].flatMap((listener) => {
      const rows = byPerson.get(listener.id);
      const preferred = rows.filter((row) => genreByAlbum.get(row.spotifyId).some((genre) => overlap.includes(genre)));
      return ordered(preferred.length ? preferred : rows).slice(0, 3)
        .map((row) => ({ ...album(row), pickers: [listener.username] }));
    });
  };
  const pairRanking = (sorted, winner) => sorted.slice(0, 5).map((pair) =>
    rankRow(`${pair.left.username} + ${pair.right.username}`, pair.score, percent(pair.score),
      { highlight: pair === winner,
        view: { stat: { value: percent(pair.score), unit: "genre match" },
          mix: mixFor(pair.left, pair.right), records: pairRecords(pair) } }));
  if (pairs.length) {
    const best = top(pairs, (entry) => entry.score)[0];
    const worst = top(pairs, (entry) => entry.score, false)[0];
    const overlap = [...genreVectors.get(best.left.id).vector.keys()]
      .filter((genre) => genreVectors.get(best.right.id).vector.has(genre));
    const byScore = [...pairs].sort((a, b) => b.score - a.score || byName(a.label, b.label));
    if (best.score > 0) cards.push(card("music-besties", "Music besties.",
      "",
      { stat: { value: percent(best.score), unit: "genre match" },
        mix: mixFor(best.left, best.right),
        ranking: pairs.length >= 2 ? pairRanking(byScore, best) : [],
        records: [best.left, best.right].flatMap((listener) =>
          ordered(byPerson.get(listener.id).filter((row) =>
            genreByAlbum.get(row.spotifyId).some((genre) => overlap.includes(genre)))).slice(0, 3)
            .map((row) => ({ ...album(row), pickers: [listener.username] }))) }));
    if (pairs.length >= 2 && worst.score < best.score) cards.push(card("opposite-ends", "Opposite ends of the couch.",
      "",
      { stat: { value: percent(worst.score), unit: "genre match" },
        mix: mixFor(worst.left, worst.right),
        ranking: pairRanking([...byScore].reverse(), worst),
        records: [worst.left, worst.right].flatMap((listener) =>
          ordered(byPerson.get(listener.id).filter((row) =>
            genreByAlbum.get(row.spotifyId).length)).slice(0, 3)
            .map((row) => ({ ...album(row), pickers: [listener.username] }))) }));
  }

  const audiencePeople = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const audiences = rows.map(listenersOf).filter((value) => value > 0);
    return { ...listener, label: listener.username, rows, median: audiences.length ? median(audiences) : null };
  }).filter((entry) => entry.rows.length >= 3 && entry.median !== null
    && entry.rows.filter((row) => listenersOf(row) > 0).length / entry.rows.length >= 0.8);
  const basic = top(audiencePeople, (entry) => entry.median);
  const obscure = top(audiencePeople, (entry) => entry.median, false);
  const withCount = (row) => ({ ...album(row), pickers: pickersOf(row), caption: `${thousands(listenersOf(row))} listeners` });
  const audienceRanking = (descending, winners) => [...audiencePeople]
    .sort((a, b) => (descending ? b.median - a.median : a.median - b.median) || byName(a.label, b.label))
    .slice(0, 6)
    .map((entry) => rankRow(entry.username, entry.median, thousands(entry.median),
      { highlight: winners.includes(entry),
        view: { stat: { value: thousands(entry.median), unit: "median Last.fm listeners" },
          records: [...entry.rows].sort((a, b) => descending ? listenersOf(b) - listenersOf(a) : listenersOf(a) - listenersOf(b))
            .slice(0, 4).map(withCount) } }));
  if (audiencePeople.length >= 2 && basic[0].median > obscure[0].median) {
    cards.push(card("most-basic", "Most basic bitch.",
      "",
      { stat: { value: thousands(basic[0].median), unit: "median Last.fm listeners" },
        ranking: audienceRanking(true, basic),
        records: [...basic[0].rows].sort((a, b) => listenersOf(b) - listenersOf(a)).slice(0, 4).map(withCount) }));
    cards.push(card("not-like-other-girls", "Not like other girls.",
      "",
      { stat: { value: thousands(obscure[0].median), unit: "median Last.fm listeners" },
        ranking: audienceRanking(false, obscure),
        records: [...obscure[0].rows].sort((a, b) => listenersOf(a) - listenersOf(b)).slice(0, 4).map(withCount) }));
  }

  const withAudience = unique.filter((row) => listenersOf(row) > 0);
  const tiniest = top(withAudience.map((row) => ({ row, label: row.name })), (entry) => listenersOf(entry.row), false);
  const biggest = top(withAudience.map((row) => ({ row, label: row.name })), (entry) => listenersOf(entry.row));
  const albumRanking = (descending, winners) => [...withAudience]
    .sort((a, b) => (descending ? listenersOf(b) - listenersOf(a) : listenersOf(a) - listenersOf(b))
      || byName(a.name, b.name))
    .slice(0, 5)
    .map((row) => rankRow(row.name, listenersOf(row), thousands(listenersOf(row)), {
      highlight: winners.some((entry) => entry.row === row), sub: pickersFor(row),
      imageUrl: row.imageUrl || null,
      view: { stat: { value: thousands(listenersOf(row)), unit: "Last.fm listeners" }, records: [picked(row)] } }));
  if (withAudience.length >= 2 && listenersOf(biggest[0].row) > listenersOf(tiniest[0].row)) {
    cards.push(card("tiniest-violin", "Tiniest violin award.",
      "",
      { stat: { value: thousands(listenersOf(tiniest[0].row)), unit: "Last.fm listeners" },
        ranking: albumRanking(false, tiniest),
        records: tiniest.map((entry) => picked(entry.row)) }));
    cards.push(card("biggest-tuba", "Biggest tuba award.",
      "",
      { stat: { value: thousands(listenersOf(biggest[0].row)), unit: "Last.fm listeners" },
        ranking: albumRanking(true, biggest),
        records: biggest.map((entry) => picked(entry.row)) }));
  }

  const genrePeople = new Map();
  for (const listener of contributors) {
    for (const genre of genreVectors.get(listener.id).vector.keys()) {
      if (!genrePeople.has(genre)) genrePeople.set(genre, new Set());
      genrePeople.get(genre).add(listener.id);
    }
  }
  const genreRows = [...genrePeople].map(([genre, people]) =>
    ({ genre, people, label: genre, count: people.size }));
  const common = top(genreRows, (entry) => entry.count);
  if (common.length && common[0].count >= 2) {
    cards.push(card("common-chord", "The common chord.",
      "",
      { stat: { value: common[0].count, unit: "listeners" },
        ranking: [...genreRows].sort((a, b) => b.count - a.count || byName(a.genre, b.genre)).slice(0, 6)
          .map((entry) => rankRow(entry.genre, entry.count, String(entry.count),
            { highlight: common.includes(entry),
              view: { stat: { value: entry.count, unit: "listeners" },
                records: contributors.map((listener) => ordered(byPerson.get(listener.id).filter((row) =>
                  genreByAlbum.get(row.spotifyId).includes(entry.genre)))[0]).filter(Boolean).slice(0, 6).map(picked) } })),
        records: contributors.map((listener) => ordered(byPerson.get(listener.id).filter((row) =>
          common.some((entry) => genreByAlbum.get(row.spotifyId).includes(entry.genre))))[0])
          .filter(Boolean).slice(0, 6).map(picked) }));
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
  const detourWinners = [];
  for (const entry of top(detours, (item) => item.score)) {
    if (!detourWinners.some((item) => item.listener.id === entry.listener.id)) detourWinners.push(entry);
  }
  const detour = detourWinners[0];
  if (detour && detour.score > 0) {
    const bestPerListener = new Map();
    for (const entry of [...detours].sort((a, b) => b.score - a.score || byName(a.label, b.label))) {
      if (!bestPerListener.has(entry.listener.id)) bestPerListener.set(entry.listener.id, entry);
    }
    const detourRecord = (entry) => ({ ...album(entry.row), pickers: [entry.listener.username],
      caption: genreByAlbum.get(entry.row.spotifyId).join(" · ") });
    cards.push(card("unexpected-detour", "Unexpected detour.",
      "",
      { stat: { value: percent(detour.score), unit: "off course" },
        records: detourWinners.map(detourRecord),
        ranking: bestPerListener.size > detourWinners.length ? [...bestPerListener.values()].slice(0, 6).map((entry) =>
          rankRow(entry.listener.username, entry.score, percent(entry.score), {
            highlight: detourWinners.includes(entry), sub: entry.row.name, imageUrl: entry.row.imageUrl || null,
            view: { stat: { value: percent(entry.score), unit: "off course" }, records: [detourRecord(entry)] },
          })) : [] }));
  }

  const passports = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const genres = new Set(rows.flatMap((row) => genreByAlbum.get(row.spotifyId) || []));
    const tagged = genreVectors.get(listener.id).tagged;
    return { listener, genres: [...genres].sort(byName), tagged, rows, label: listener.username };
  }).filter((entry) => entry.rows.length >= 3 && entry.tagged >= 3
    && entry.tagged / entry.rows.length >= 0.5);
  const passport = top(passports, (entry) => entry.genres.length);
  if (passports.length >= 2 && passport.length) cards.push(card("genre-passport", "Genre passport.",
    "",
    { stat: { value: passport[0].genres.length, unit: "genres" },
      chips: passport[0].genres,
      ranking: [...passports].sort((a, b) => b.genres.length - a.genres.length || byName(a.label, b.label))
        .slice(0, 6).map((entry) => rankRow(entry.label, entry.genres.length, String(entry.genres.length),
          { highlight: passport.includes(entry),
            view: { stat: { value: entry.genres.length, unit: "genres" }, chips: entry.genres,
              records: ordered(entry.rows).slice(0, 6).map(album) } })),
      records: ordered(passport[0].rows).slice(0, 6).map(album) }));

  const travelers = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const years = rows.map((row) => year(row.releaseDate)).filter(Boolean);
    return { listener, rows, first: Math.min(...years), last: Math.max(...years),
      span: Math.max(...years) - Math.min(...years), label: listener.username };
  }).filter((entry) => entry.rows.length >= 3 && Number.isFinite(entry.span) && entry.span > 0);
  const travelersTop = top(travelers, (entry) => entry.span);
  if (travelersTop.length) {
    const travelView = (entry) => {
      const echo = closerThanNow(entry.first, entry.last);
      return {
        stat: { value: entry.span, unit: "years" },
        fact: echo ? `${entry.first} was closer to ${echo.event} (${echo.year}) than to ${entry.last}.` : "",
        timeline: {
          from: entry.first, to: entry.last, echo,
          points: ordered(entry.rows.filter((row) => year(row.releaseDate)))
            .map((row) => ({ year: year(row.releaseDate), name: row.name, artistName: row.artistName })),
        },
        records: ordered(entry.rows.filter((row) => [entry.first, entry.last].includes(year(row.releaseDate))))
          .sort((a, b) => year(a.releaseDate) - year(b.releaseDate))
          .map((row) => ({ ...album(row), pickers: [entry.label] })),
      };
    };
    const traveler = travelersTop[0];
    cards.push(card("time-traveler", "The time traveler.",
      "",
      { ...travelView(traveler),
        ranking: travelers.length >= 2 ? [...travelers].sort((a, b) => b.span - a.span || byName(a.label, b.label))
          .slice(0, 5).map((entry) => rankRow(entry.label, entry.span, `${entry.first}–${entry.last}`,
            { highlight: travelersTop.includes(entry), view: travelView(entry) })) : [] }));
  }

  const fresh = picks.filter((row) => year(row.releaseDate) === season);
  if (picks.length && fresh.length) {
    const freshPeople = contributors.map((listener) => {
      const rows = byPerson.get(listener.id);
      const count = rows.filter((row) => year(row.releaseDate) === season).length;
      return { listener, rows, count, share: count / rows.length, label: listener.username };
    }).filter((entry) => entry.rows.length >= 3);
    const freshest = top(freshPeople, (entry) => entry.share).filter((entry) => entry.count > 0);
    cards.push(card("fresh-off-press", "Fresh off the press.",
      "",
      { stat: { value: `${fresh.length}/${picks.length}`, unit: `picks released in ${season}` },
        ranking: [...freshPeople].sort((a, b) => b.share - a.share || byName(a.label, b.label)).slice(0, 6)
          .map((entry) => rankRow(entry.label, entry.share, `${entry.count}/${entry.rows.length}`,
            { highlight: freshest.includes(entry),
              view: { records: ordered(entry.rows.filter((row) => year(row.releaseDate) === season)).slice(0, 6).map(picked) } })),
        records: ordered([...new Map(fresh.map((row) => [row.spotifyId, row])).values()])
          .slice(0, 6).map(picked) }));
  }

  const wordCount = (value) => (String(value || "").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const noteRows = [...picks, ...standouts].filter((row) => row.userId && wordCount(row.review));
  const wordMap = noteWordMap(noteRows);
  if (wordMap.length) cards.push(card("word-map", "A map of the margins.",
    "Sized by how many notes use each word.",
    { stat: { value: noteRows.length, unit: "notes" }, wordMap }));

  cards.push(card("hill-worth-dying-on", "A hill worth dying on.",
    "A future Jev rerank will surface a note that makes the strongest case for a record.",
    { status: "in construction",
      links: [{ href: "/records/lists/", label: "Read the notes for now →" }] }));
  cards.push(card("one-sentence-liner-note", "One-sentence liner note.",
    "A future Jev rerank will look for a brief note that says more than its word count suggests.",
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
  const writerRows = [...noteTotals.values()].map((entry) => ({ ...entry, label: entry.listener.username }));
  const writers = top(writerRows, (entry) => entry.words);
  if (writers.length) {
    const longest = [...noteRows].sort((a, b) =>
      wordCount(b.review) - wordCount(a.review) || byName(a.username, b.username))[0];
    const isAlbum = albumRows.has(longest.spotifyId);
    const noteFor = (row) => ({ author: row.username, text: String(row.review).trim(), about: row.name,
      href: noteHref(row, albumRows.has(row.spotifyId) ? "album" : "track") });
    const longestBy = (userId) => noteFor([...noteRows].filter((row) => row.userId === userId)
      .sort((a, b) => wordCount(b.review) - wordCount(a.review) || byName(a.name || "", b.name || ""))[0]);
    cards.push(card("written-margins", "Written in the margins.",
      "",
      { stat: { value: thousands(writers[0].words), unit: "words" },
        ranking: writerRows.length >= 2 ? [...writerRows].sort((a, b) => b.words - a.words || byName(a.label, b.label))
          .slice(0, 6).map((entry) => rankRow(entry.label, entry.words, thousands(entry.words), {
            highlight: writers.includes(entry), sub: `${entry.count} ${entry.count === 1 ? "note" : "notes"}`,
            view: { stat: { value: thousands(entry.words), unit: "words" },
              notes: [longestBy(entry.listener.id)], records: ordered(entry.records).slice(0, 3) },
          })) : [],
        notes: [noteFor(longest)],
        records: ordered(writers[0].records).slice(0, 3),
        links: isAlbum ? [] : [{ href: `https://open.spotify.com/track/${encodeURIComponent(longest.spotifyId)}`,
          label: "Play the track on Spotify ↗", external: true }] }));
  }

  return cards;
}
