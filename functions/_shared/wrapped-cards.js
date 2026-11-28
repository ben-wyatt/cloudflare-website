import { MAP_HEIGHT, MAP_WIDTH, project } from "./equal-earth.js";
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

// MusicBrainz language codes (ISO 639-3). zxx means no lyrics, mul several languages,
// und unknown; none of those count as "not English".
const LANGUAGES = {
  ara: "Arabic", ben: "Bengali", cat: "Catalan", ces: "Czech", dan: "Danish", deu: "German",
  ell: "Greek", fin: "Finnish", fra: "French", gle: "Irish", heb: "Hebrew", hin: "Hindi",
  hun: "Hungarian", ind: "Indonesian", isl: "Icelandic", ita: "Italian", jpn: "Japanese",
  kor: "Korean", lat: "Latin", nld: "Dutch", nor: "Norwegian", pol: "Polish", por: "Portuguese",
  ron: "Romanian", rus: "Russian", spa: "Spanish", swe: "Swedish", tha: "Thai", tur: "Turkish",
  ukr: "Ukrainian", vie: "Vietnamese", yor: "Yoruba", zho: "Chinese", amh: "Amharic",
  swa: "Swahili", wol: "Wolof", tgl: "Tagalog", hau: "Hausa", ibo: "Igbo", zul: "Zulu",
  // MusicBrainz uses qaa for made-up languages.
  qaa: "Invented",
};
const NOT_FOREIGN = new Set(["eng", "zxx", "mul", "und", "mis"]);
const languageOf = (row) => String(row.language || "").trim().toLowerCase();
const isNotEnglish = (row) => Boolean(languageOf(row)) && !NOT_FOREIGN.has(languageOf(row));
const languageName = (code) => LANGUAGES[code] || code.toUpperCase();

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
const uniqueBy = (rows, keyFor) => [...new Map(rows.map((row) => [keyFor(row), row])).values()];
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

// Slide parts beyond the basics:
//   titleLines  a two-award slide's headline, one award per line (`title` joins them).
//   axis        draws the ranking as dots on one shared scale instead of bars.
//   strip       every item (record, pair) as a dot on one scale; a dot can carry a view.
//   map         pins on the world outline map; a ranking row's view may set mapFocus.
//   mixes       several genre mixes, each with a heading; a view's mixPair names two
//               listeners whose mixes (from genreMixes) the page shows side by side.
//   unranked    the ranking is a list of choices, so it shows no rank numbers.
//   noDefault   no ranking row is selected at first; the slide's own parts show instead.
//   awards      named winners under a chart: { heading, sub, mix | records } each.
//   artWall     records show as big linked covers only.
function card(id, title, lede, {
  detail = "", records = [], notes = [], wordMap = [], links = [], status = "", cast = [],
  stat = null, ranking = [], mix = [], timeline = null, chips = [], fact = "", people = [],
  titleLines = [], axis = null, strip = null, map = null, mixes = [], unranked = false, noDefault = false,
  genreMixes = null, awards = [], artWall = false,
} = {}) {
  return { id, title, lede, detail, records, notes, wordMap, links, status, cast,
    stat, ranking, mix, timeline, chips, fact, people, titleLines, axis, strip, map, mixes, unranked, noDefault,
    awards, artWall, ...(genreMixes ? { genreMixes } : {}) };
}

// `view` holds the slide parts (stat, records, mix, chips, timeline, fact) to show
// when a reader selects this row. `people` names the listeners a row is about, so the
// page can mark the reader's own rows.
function rankRow(name, value, display, { highlight = false, sub = "", imageUrl = null, view = null, people = [] } = {}) {
  return { name, value, display, highlight, sub, imageUrl, view, people };
}

// Two awards on one slide: the headline names both, one per line.
function twoAwards(id, lines, lede, options) {
  return card(id, lines.join(" "), lede, { ...options, titleLines: lines });
}

const compact = (value) => {
  const number = Math.round(Number(value) || 0);
  if (number >= 1e6) return `${+(number / 1e6).toFixed(number >= 1e7 ? 0 : 1)}M`;
  if (number >= 1e3) return `${+(number / 1e3).toFixed(number >= 1e4 ? 0 : 1)}K`;
  return String(number);
};

// Axes carry their own ticks, so the page only has to place things on them.
function logAxis(values) {
  const low = Math.floor(Math.log10(Math.max(1, Math.min(...values))));
  const high = Math.max(low + 1, Math.ceil(Math.log10(Math.max(...values))));
  const ticks = [];
  for (let power = low; power <= high; power++) ticks.push({ value: 10 ** power, label: compact(10 ** power) });
  return { scale: "log", min: 10 ** low, max: 10 ** high, ticks };
}

function percentAxis(values) {
  const max = Math.max(...values) <= 0.5 ? 0.5 : 1;
  const step = max === 0.5 ? 0.1 : 0.25;
  const ticks = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push({ value, label: `${Math.round(value * 100)}%` });
  return { scale: "linear", min: 0, max, ticks };
}

// Running times bunch up around 30–60 minutes, with the odd three-hour soundtrack, so
// they go on a log scale with round ticks.
const MINUTE_TICKS = [5, 10, 15, 30, 60, 120, 240, 480, 960];
const minuteLabel = (value) => (value % 60 ? `${value} min` : `${value / 60} hr`);
function minutesAxis(values) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const min = [...MINUTE_TICKS].reverse().find((tick) => tick <= low) || MINUTE_TICKS[0];
  const max = MINUTE_TICKS.find((tick) => tick >= high) || MINUTE_TICKS.at(-1);
  return { scale: "log", min, max,
    ticks: MINUTE_TICKS.filter((tick) => tick >= min && tick <= max).map((value) => ({ value, label: minuteLabel(value) })) };
}

function formatDuration(durationMs) {
  const totalMinutes = Math.max(0, Math.round(Number(durationMs || 0) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return `${hours} hr${minutes ? ` ${minutes} min` : ""}`;
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();
const countryName = (code) => {
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
};

// MusicBrainz artist types: a band is anything with more than one member.
const BAND_TYPES = new Set(["group", "orchestra", "choir"]);

// "ben is the Most Basic Bitch." / "ben and eman are the Most Basic Bitches."
function crown(winners, singular, plural = singular) {
  const people = winners.map((name) => String(name || "")).filter(Boolean);
  if (people.length <= 1) return `${people[0] || "Someone"} ${singular}.`;
  const list = people.length === 2 ? people.join(" and ")
    : `${people.slice(0, -1).join(", ")} and ${people.at(-1)}`;
  return `${list} ${plural}.`;
}

const percent = (value) => `${Math.round(value * 100)}%`;
const plural = (count, singular, pluralForm = `${singular}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? singular : pluralForm}`;
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

// Each listener's full list has its own page; notes link into it by anchor.
export const listHref = (username) =>
  `/records/lists/?member=${encodeURIComponent(username)}`;

const noteHref = (row, kind = "album") =>
  `${listHref(row.username)}#${kind}-note-${encodeURIComponent(row.userId)}-${encodeURIComponent(row.spotifyId)}`;

const NOTE_STOP_WORDS = new Set((
  "about above after again album albums also always another anything around because before being " +
  "been best both cant come could didnt does doesnt dont down each even ever every everything feel " +
  "felt first from gets give going gonna good great have here i'd i'll i'm i've into it'd it'll it's " +
  "just know last less like listen listening little lots love loved made make many maybe more most " +
  "much music never next nothing once only other over pretty probably quite rather really record " +
  "records same said seems should since some something song songs sort still such sure take than " +
  "that that's thats their them then there there's these they thing things think this those though " +
  "through time took track tracks very want wasn't were what when where which while whole will with " +
  "within without would yeah year years your you're you've"
).split(" "));

function noteWordMap(rows, limit = 40) {
  const notes = new Map();
  const uses = new Map();
  for (const row of rows) {
    const words = (String(row.review || "").toLocaleLowerCase().replace(/’/g, "'")
      .match(/[\p{L}][\p{L}\p{N}'-]*/gu) || [])
      .map((word) => word.replace(/^'+|'+$/g, ""))
      .filter((word) => word.length >= 4 && !NOTE_STOP_WORDS.has(word));
    for (const word of words) uses.set(word, (uses.get(word) || 0) + 1);
    for (const word of new Set(words)) notes.set(word, (notes.get(word) || 0) + 1);
  }
  // Size is the number of notes using a word; total uses and length only break ties.
  return [...notes]
    .sort((a, b) => b[1] - a[1] || uses.get(b[0]) - uses.get(a[0])
      || b[0].length - a[0].length || byName(a[0], b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function fineTagsFor(row) {
  let tags;
  try {
    tags = JSON.parse(row.lastfmTagsJson || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag) => number(tag.count) >= 3)
    .map((tag) => String(tag.name || "").trim().toLocaleLowerCase("en"))
    .filter((name) => name && !/^\d{4}( releases)?$/.test(name) && name !== "auto-tagged");
}


export function generateWrappedCards({
  season, members = [], picks = [], standouts = [], favorites = [], albumArtists = [], facts = [],
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
    cards.push(card("shared-records", "Album polycules.",
      "",
      { stat: { value: shared.length,
        unit: `${shared.length === 1 ? "record" : "records"} selected by multiple people` },
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
    const echoUnit = (echo) => `unique ${echo.name} albums were chosen by listeners`;
    cards.push(card("artist-echo", "Repeating artists.",
      "",
      { stat: { value: entry.albumIds.size, unit: echoUnit(entry) },
        records: ordered([...entry.albumIds].map((id) => albumRows.get(id))).map(picked),
        ranking: artistEchoes.length >= 2 ? artistEchoes.slice(0, 5).map((echo) =>
          rankRow(echo.name, echo.albumIds.size, `${echo.albumIds.size} records`, {
            highlight: echo === entry, sub: names([...echo.people.values()]),
            people: [...echo.people.values()].map((item) => item.username),
            view: { stat: { value: echo.albumIds.size, unit: echoUnit(echo) },
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
  // Both awards on one slide: every pair is a dot, the two ends are the winners.
  if (pairs.length >= 2) {
    const byScore = [...pairs].sort((a, b) => b.score - a.score || byName(a.label, b.label));
    const best = byScore[0];
    const worst = byScore.at(-1);
    const pairName = (pair) => `${pair.left.username} + ${pair.right.username}`;
    if (best.score > worst.score) cards.push(card("music-besties", "Listener pairs by genre similarity.", "", {
      awards: [
        { heading: "Music besties.", sub: `${pairName(best)} · ${percent(best.score)} alike`, mix: mixFor(best.left, best.right) },
        { heading: "Opposite ends of the couch.", sub: `${pairName(worst)} · ${percent(worst.score)} alike`, mix: mixFor(worst.left, worst.right) },
      ],
      strip: {
        axis: percentAxis([1]), you: "pairs", unit: "genre match",
        points: byScore.map((pair) => ({
          value: pair.score, display: `${percent(pair.score)} alike`, label: pairName(pair),
          people: [pair.left.username, pair.right.username], highlight: pair === best || pair === worst,
          view: { mixPair: { heading: `${pairName(pair)} · ${percent(pair.score)} alike`,
            names: [pair.left.username, pair.right.username] } },
        })),
      },
      // Every listener's genre mix once; the page builds a pair's mix from two of them.
      genreMixes: Object.fromEntries(eligibleTaste.map((listener) => [listener.username,
        [...genreVectors.get(listener.id).vector].sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))
          .map(([genre, share]) => ({ genre, share: Math.round(share * 1000) / 1000 }))])) }));
  }

  // Who made each record and where they are from (MusicBrainz, with gaps filled from the
  // researched write-ups), for Passport stamps and Band Kid.
  const factByAlbum = new Map(facts.map((row) => [row.spotifyAlbumId, row]));
  const artistOf = (row) => factByAlbum.get(row.spotifyId)?.artistName
    || String(row.artistName || "").split(",")[0].trim();

  const audiencePeople = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const audiences = rows.map(listenersOf).filter((value) => value > 0);
    return { ...listener, label: listener.username, rows, median: audiences.length ? median(audiences) : null };
  }).filter((entry) => entry.rows.length >= 3 && entry.median !== null
    && entry.rows.filter((row) => listenersOf(row) > 0).length / entry.rows.length >= 0.8);
  const basic = top(audiencePeople, (entry) => entry.median);
  const obscure = top(audiencePeople, (entry) => entry.median, false);
  const withCount = (row, label = "") => ({ ...album(row), pickers: pickersOf(row),
    caption: label ? `${label} · ${compact(listenersOf(row))} listeners` : `${thousands(listenersOf(row))} listeners` });
  const byAudience = (rows, descending) => [...rows].sort((a, b) =>
    (descending ? listenersOf(b) - listenersOf(a) : listenersOf(a) - listenersOf(b)) || byName(a.name, b.name));
  // Both awards on one slide: everyone on one log-scale axis, a crown at each end.
  if (audiencePeople.length >= 2 && basic[0].median > obscure[0].median) {
    const sorted = [...audiencePeople].sort((a, b) => b.median - a.median || byName(a.label, b.label));
    cards.push(twoAwards("most-basic", [
      crown(basic.map((entry) => entry.username), "is the Most Basic Bitch", "are the Most Basic Bitches"),
      crown(obscure.map((entry) => entry.username), "is Not Like Other Girls", "are Not Like Other Girls"),
    ], "Each list’s median Last.fm listeners, on a log scale.", {
      stat: { value: `${thousands(basic[0].median / obscure[0].median)}×`,
        unit: `more listeners on ${basic[0].username}’s typical record than on ${obscure[0].username}’s` },
      axis: logAxis(sorted.map((entry) => entry.median)),
      noDefault: true,
      ranking: sorted.map((entry) => rankRow(entry.username, entry.median, thousands(entry.median), {
        highlight: basic.includes(entry) || obscure.includes(entry), people: [entry.username],
        view: { stat: { value: thousands(entry.median), unit: `median Last.fm listeners on ${entry.username}’s records` },
          records: byAudience(entry.rows, true).map((row) => withCount(row)) } })),
      records: [
        ...byAudience(basic[0].rows, true).slice(0, 2).map((row) => withCount(row, "Most Basic")),
        ...byAudience(obscure[0].rows, false).slice(0, 2).map((row) => withCount(row, "Not Like Other Girls")),
      ] }));
  }

  // Both record awards on one slide: every record on one log-scale strip.
  const withAudience = unique.filter((row) => listenersOf(row) > 0);
  if (withAudience.length >= 2) {
    const sorted = byAudience(withAudience, true);
    const biggest = sorted[0];
    const tiniest = sorted.at(-1);
    if (listenersOf(biggest) > listenersOf(tiniest)) {
      cards.push(card("biggest-tuba", "Records by Last.fm listeners.", "", {
        stat: { value: `${thousands(listenersOf(biggest) / listenersOf(tiniest))}×`,
          unit: "more listeners on the biggest record than on the tiniest" },
        strip: {
          axis: logAxis(sorted.map(listenersOf)), you: "records", unit: "Last.fm listeners",
          points: sorted.map((row) => ({
            value: listenersOf(row), display: `${thousands(listenersOf(row))} listeners`,
            label: `${row.name} · ${row.artistName}`, people: pickersOf(row),
            highlight: row === biggest || row === tiniest,
            view: { records: [withCount(row)] },
          })),
        },
        awards: [
          { heading: "Biggest tuba award.", sub: `${thousands(listenersOf(biggest))} listeners`, records: [picked(biggest)] },
          { heading: "Tiniest violin award.", sub: `${thousands(listenersOf(tiniest))} listeners`, records: [picked(tiniest)] },
        ] }));
    }
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
  const familyPattern = new Map(GENRES);
  const familyRecords = (genre) => unique.filter((row) => genreByAlbum.get(row.spotifyId).includes(genre));
  // The Last.fm tags behind a genre family (or the whole room), most-used first.
  const tagTally = (rows, keep) => {
    const counts = new Map();
    for (const row of rows) {
      for (const tag of new Set(fineTagsFor(row))) if (keep(tag)) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts].filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || byName(a[0], b[0])).map(([tag, count]) => `${tag} ×${count}`);
  };
  if (common.length && common[0].count >= 2) {
    const sortedGenres = [...genreRows].sort((a, b) => b.count - a.count || byName(a.genre, b.genre));
    const lists = contributors.length;
    cards.push(card("common-chord", "The common chord.",
      "Most common genre, by how many lists it shows up on.",
      { stat: { value: `${common[0].count} of ${lists}`, unit: "lists share the most common genre" },
        ranking: sortedGenres.slice(0, 8).map((entry) => rankRow(entry.genre, entry.count, `${entry.count} lists`, {
          highlight: common.includes(entry),
          sub: [plural(familyRecords(entry.genre).length, "record"),
            ...tagTally(familyRecords(entry.genre), (tag) => familyPattern.get(entry.genre).test(tag))
              .slice(0, 3).map((tag) => tag.replace(/ ×\d+$/, ""))].join(" · ") })) }));
  }

  const passports = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const genres = new Set(rows.flatMap((row) => genreByAlbum.get(row.spotifyId) || []));
    const tagged = genreVectors.get(listener.id).tagged;
    return { listener, genres: [...genres].sort(byName), tagged, rows, label: listener.username };
  }).filter((entry) => entry.rows.length >= 3 && entry.tagged >= 3
    && entry.tagged / entry.rows.length >= 0.5);
  const passport = top(passports, (entry) => entry.genres.length);
  if (passports.length >= 2 && passport.length) cards.push(card("genre-passport",
    crown(passport.map((entry) => entry.label), "earned their Genre Passport", "earned their Genre Passports"),
    "Most genres represented.",
    { stat: { value: passport[0].genres.length, unit: "genres" },
      chips: passport[0].genres,
      ranking: [...passports].sort((a, b) => b.genres.length - a.genres.length || byName(a.label, b.label))
        .slice(0, 6).map((entry) => rankRow(entry.label, entry.genres.length, String(entry.genres.length),
          { highlight: passport.includes(entry), people: [entry.label],
            view: { stat: { value: entry.genres.length, unit: "genres" }, chips: entry.genres,
              records: ordered(entry.rows).slice(0, 6).map(album) } })),
      records: ordered(passport[0].rows).slice(0, 6).map(album) }));

  // Passport stamps: one pin per artist, at their MusicBrainz begin area (or their country).
  const placeOf = (row) => {
    const place = factByAlbum.get(row.spotifyId);
    return place?.country && place.lat !== null && place.lat !== undefined && place.lon !== null && place.lon !== undefined
      ? place : null;
  };
  const countriesOf = (rows) => {
    const counts = new Map();
    for (const row of rows) {
      const country = placeOf(row)?.country;
      if (country) counts.set(country, (counts.get(country) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || byName(countryName(a[0]), countryName(b[0])));
  };
  const stamped = unique.filter(placeOf);
  const roomCountries = countriesOf(unique);
  if (stamped.length >= 3 && roomCountries.length >= 2) {
    // Pins that land on the same spot merge; an artist with no known hometown sits on their
    // country instead, and says so.
    const pins = new Map();
    for (const row of stamped) {
      const place = placeOf(row);
      const [x, y] = project(Number(place.lon), Number(place.lat));
      const key = `${place.placeArea ? "" : "country:"}${Math.round(x)},${Math.round(y)}`;
      if (!pins.has(key)) {
        pins.set(key, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, country: !place.placeArea,
          countryName: countryName(place.country), areas: new Map(), artists: [], people: [] });
      }
      const pin = pins.get(key);
      if (place.placeArea) pin.areas.set(place.placeArea, (pin.areas.get(place.placeArea) || 0) + 1);
      const name = artistOf(row);
      const artist = pin.artists.find((item) => item.name === name);
      if (artist) artist.pickers = [...new Set([...artist.pickers, ...pickersOf(row)])].sort(byName);
      else pin.artists.push({ name, pickers: pickersOf(row) });
      pin.people = [...new Set([...pin.people, ...pickersOf(row)])].sort(byName);
    }
    // Pins a few pixels apart would cover each other, so nearby places merge into the
    // biggest one nearby (New York takes in Rhinebeck), keeping every artist.
    const MERGE_DISTANCE = 5;
    const merged = [];
    for (const pin of [...pins.values()].sort((a, b) => b.artists.length - a.artists.length || a.x - b.x)) {
      const near = merged.find((other) => other.country === pin.country
        && Math.hypot(other.x - pin.x, other.y - pin.y) < MERGE_DISTANCE);
      if (!near) {
        merged.push(pin);
        continue;
      }
      for (const [area, count] of pin.areas) near.areas.set(area, (near.areas.get(area) || 0) + count);
      for (const artist of pin.artists) {
        const same = near.artists.find((item) => item.name === artist.name);
        if (same) same.pickers = [...new Set([...same.pickers, ...artist.pickers])].sort(byName);
        else near.artists.push(artist);
      }
      near.people = [...new Set([...near.people, ...pin.people])].sort(byName);
    }
    pins.clear();
    merged.forEach((pin, index) => pins.set(index, pin));
    for (const pin of pins.values()) {
      const areas = [...pin.areas].sort((a, b) => b[1] - a[1] || byName(a[0], b[0])).map(([area]) => area);
      pin.place = pin.country ? `Somewhere in ${pin.countryName}` : `${areas.slice(0, 2).join(" / ")}, ${pin.countryName}`;
      delete pin.areas;
      delete pin.countryName;
    }
    const pinList = [...pins.values()].sort((a, b) => b.artists.length - a.artists.length || byName(a.place, b.place));
    const busiest = pinList.find((pin) => !pin.country);
    const travellers = contributors.map((listener) => ({ listener, label: listener.username,
      countries: countriesOf(byPerson.get(listener.id)).map(([country]) => country) }))
      .filter((entry) => entry.countries.length)
      .sort((a, b) => b.countries.length - a.countries.length || byName(a.label, b.label));
    const mostTravelled = travellers.filter((entry) => entry.countries.length === travellers[0].countries.length);
    cards.push(card("passport-stamps", "Passport stamps.",
      "Where the artists are from: a pin on each artist’s hometown.",
      { stat: { value: roomCountries.length, unit: "countries the room’s artists come from" },
        fact: busiest?.artists.length >= 2
          ? `Most-stamped place: ${busiest.place}, home to ${busiest.artists.length} of the artists.` : "",
        map: { width: MAP_WIDTH, height: MAP_HEIGHT, src: "/assets/images/world-outline.svg", pins: pinList },
        noDefault: true,
        ranking: travellers.slice(0, 8).map((entry) => rankRow(entry.label, entry.countries.length,
          plural(entry.countries.length, "country", "countries"), {
            highlight: mostTravelled.includes(entry), sub: entry.countries.map(countryName).join(", "),
            people: [entry.label],
            view: { mapFocus: entry.label, chips: entry.countries.map(countryName), fact: "",
              stat: { value: entry.countries.length,
                unit: `${entry.countries.length === 1 ? "country" : "countries"} on ${entry.label}’s list` } },
          })) }));
  }

  // Who reaches furthest past English. Albums without a known language are left out.
  const languagePeople = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const foreign = ordered(rows.filter(isNotEnglish));
    const languages = [...new Set(foreign.map(languageOf))].map(languageName).sort(byName);
    return { listener, rows, foreign, languages, label: listener.username };
  }).filter((entry) => entry.foreign.length > 0);
  const polyglots = top(languagePeople, (entry) => entry.foreign.length);
  if (polyglots.length) {
    const groupLanguages = [...new Set(unique.filter(isNotEnglish).map(languageOf))].map(languageName).sort(byName);
    const polyglotView = (entry) => ({
      stat: { value: entry.foreign.length,
        unit: `${entry.foreign.length === 1 ? "record" : "records"} not in English` },
      chips: entry.languages,
      records: entry.foreign.slice(0, 12).map(picked),
    });
    cards.push(card("polyglot",
      crown(polyglots.map((entry) => entry.label), "is the Polyglot", "are the Polyglots"),
      "Most records not in English.",
      { ...polyglotView(polyglots[0]),
        fact: `The group picked records in ${groupLanguages.length + 1} languages: English, ${groupLanguages.join(", ")}.`,
        ranking: languagePeople.length >= 2 ? [...languagePeople]
          .sort((a, b) => b.foreign.length - a.foreign.length || byName(a.label, b.label)).slice(0, 6)
          .map((entry) => rankRow(entry.label, entry.foreign.length, String(entry.foreign.length),
            { highlight: polyglots.includes(entry), people: [entry.label], view: polyglotView(entry) })) : [] }));
  }

  // Band Kid and Solo Stan: the share of each list made by bands (MusicBrainz artist type).
  const typeOf = (row) => String(factByAlbum.get(row.spotifyId)?.artistType || "").toLowerCase();
  const isBand = (row) => BAND_TYPES.has(typeOf(row));
  const isSolo = (row) => typeOf(row) === "person";
  const lineups = contributors.map((listener) => {
    const rows = byPerson.get(listener.id).filter((row) => isBand(row) || isSolo(row));
    const bands = rows.filter(isBand).length;
    return { listener, rows, bands, share: rows.length ? bands / rows.length : 0, label: listener.username };
  }).filter((entry) => entry.rows.length >= 3);
  if (lineups.length >= 2) {
    const sorted = [...lineups].sort((a, b) => b.share - a.share || b.rows.length - a.rows.length || byName(a.label, b.label));
    const bandKids = sorted.filter((entry) => entry.share === sorted[0].share);
    const soloStans = sorted.filter((entry) => entry.share === sorted.at(-1).share);
    const typed = (row) => ({ ...album(row), pickers: pickersOf(row), caption: isBand(row) ? "band" : "solo artist" });
    const allTyped = unique.filter((row) => isBand(row) || isSolo(row));
    if (sorted[0].share > sorted.at(-1).share) cards.push(twoAwards("band-kid", [
      crown(bandKids.map((entry) => entry.label), "is the Band Kid", "are the Band Kids"),
      crown(soloStans.map((entry) => entry.label), "is the Solo Stan", "are the Solo Stans"),
    ], "Share of each list by bands rather than solo artists.", {
      stat: { value: percent(allTyped.filter(isBand).length / allTyped.length), unit: "of the room’s records are by bands" },
      axis: percentAxis([1]), noDefault: true,
      ranking: sorted.map((entry) => rankRow(entry.label, entry.share, percent(entry.share), {
        highlight: bandKids.includes(entry) || soloStans.includes(entry),
        sub: `${entry.bands} of ${entry.rows.length} by bands`, people: [entry.label],
        view: { stat: { value: percent(entry.share), unit: `of ${entry.label}’s records are by bands` },
          records: [...entry.rows].sort((a, b) => Number(isBand(b)) - Number(isBand(a)) || byName(a.name, b.name)).map(typed) },
      })),
      records: [...ordered(bandKids[0].rows.filter(isBand)).slice(0, 3),
        ...ordered(soloStans[0].rows.filter(isSolo)).slice(0, 3)].map(typed) }));
  }

  // The Time Traveller has the widest spread of release years: the standard deviation, i.e.
  // how far a typical record sits from that listener's average year. Unlike oldest-to-newest,
  // one stray old record among recent ones does not win it.
  const travelers = contributors.map((listener) => {
    const rows = byPerson.get(listener.id);
    const years = rows.map((row) => year(row.releaseDate)).filter(Boolean);
    const mean = years.reduce((sum, value) => sum + value, 0) / (years.length || 1);
    const spread = Math.sqrt(years.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (years.length || 1));
    return { listener, rows, first: Math.min(...years), last: Math.max(...years),
      spread: Math.round(spread * 10) / 10, label: listener.username };
  }).filter((entry) => entry.rows.length >= 3 && Number.isFinite(entry.spread) && entry.spread > 0);
  const travelersTop = top(travelers, (entry) => entry.spread);
  if (travelersTop.length) {
    // Every listener shares one axis (the group's oldest to newest record) so the
    // slide keeps its shape when a reader clicks through the ranking.
    const axisFrom = Math.min(...releaseYears);
    const axisTo = Math.max(...releaseYears);
    const travelView = (entry) => {
      const echo = closerThanNow(entry.first, entry.last);
      const dated = ordered(entry.rows.filter((row) => year(row.releaseDate)));
      const ends = [entry.first, entry.last].map((end) => dated.find((row) => year(row.releaseDate) === end));
      return {
        stat: { value: `±${entry.spread.toFixed(1)}`, unit: "years from their average release year" },
        fact: echo ? `${entry.first} was closer to ${echo.event} (${echo.year}) than to ${entry.last}.` : "",
        timeline: {
          from: entry.first, to: entry.last, axisFrom, axisTo,
          points: dated.map((row) => ({ year: year(row.releaseDate), name: row.name, artistName: row.artistName })),
        },
        records: ends.map((row) => ({ ...album(row), pickers: [entry.label] })),
      };
    };
    cards.push(card("time-traveler",
      crown(travelersTop.map((entry) => entry.label), "is the Time Traveller", "are the Time Travellers"),
      "Widest spread of release years (standard deviation).",
      { ...travelView(travelersTop[0]),
        ranking: travelers.length >= 2 ? [...travelers].sort((a, b) => b.spread - a.spread || byName(a.label, b.label))
          .slice(0, 5).map((entry) => rankRow(entry.label, entry.spread, `±${entry.spread.toFixed(1)} yrs`,
            { highlight: travelersTop.includes(entry), people: [entry.label], sub: `${entry.first}–${entry.last}`, view: travelView(entry) })) : [] }));
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
            { highlight: freshest.includes(entry), people: [entry.label],
              view: { records: ordered(entry.rows.filter((row) => year(row.releaseDate) === season)).slice(0, 6).map(picked) } })),
        records: ordered([...new Map(fresh.map((row) => [row.spotifyId, row])).values()])
          .slice(0, 6).map(picked) }));
  }

  // Bring snacks and Blink: every record by running time.
  const timed = unique.filter((row) => number(row.totalDurationMs) > 0);
  const minutesOf = (row) => number(row.totalDurationMs) / 60_000;
  if (timed.length >= 2) {
    const sorted = [...timed].sort((a, b) => minutesOf(b) - minutesOf(a) || byName(a.name, b.name));
    const longest = sorted[0];
    const shortest = sorted.at(-1);
    const lengthCaption = (row, label = "") =>
      `${label ? `${label} · ` : ""}${formatDuration(row.totalDurationMs)} · ${plural(number(row.totalTracks), "track")}`;
    const total = timed.reduce((sum, row) => sum + number(row.totalDurationMs), 0);
    if (minutesOf(longest) > minutesOf(shortest)) cards.push(twoAwards("bring-snacks",
      ["Bring snacks award.", "Blink and you’ll miss it award."],
      "Every record, by running time, on a log scale.", {
        stat: { value: formatDuration(total), unit: timed.length === unique.length
          ? "to play every record back to back" : `to play ${timed.length} of the ${unique.length} records back to back` },
        strip: {
          axis: minutesAxis(sorted.map(minutesOf)), you: "records", unit: "running time",
          lowLabel: `${formatDuration(shortest.totalDurationMs)} · ${shortest.name}`,
          highLabel: `${formatDuration(longest.totalDurationMs)} · ${longest.name}`,
          points: sorted.map((row) => ({
            value: minutesOf(row), display: lengthCaption(row), label: `${row.name} · ${row.artistName}`,
            people: pickersOf(row), highlight: row === longest || row === shortest,
            view: { records: [{ ...picked(row), caption: lengthCaption(row) }] },
          })),
        },
        records: [{ ...picked(longest), caption: lengthCaption(longest, "Bring snacks") },
          { ...picked(shortest), caption: lengthCaption(shortest, "Blink") }] }));
  }

  // Parental Advisory and Radio Edit: the share of each list's tracks Spotify marks explicit.
  const explicitOf = (row) => number(row.explicitTrackCount);
  const hasTrackData = (row) => Boolean(row.metadataEnrichedAt) && number(row.totalTracks) > 0;
  const explicitCaption = (row) => `${explicitOf(row)} of ${plural(number(row.totalTracks), "track")} explicit`;
  const explicitShare = (row) => explicitOf(row) / number(row.totalTracks);
  const mouths = contributors.map((listener) => {
    const rows = byPerson.get(listener.id).filter(hasTrackData);
    const explicit = rows.reduce((sum, row) => sum + explicitOf(row), 0);
    const tracks = rows.reduce((sum, row) => sum + number(row.totalTracks), 0);
    return { listener, rows, explicit, tracks, share: tracks ? explicit / tracks : 0, label: listener.username };
  }).filter((entry) => entry.rows.length >= 3);
  if (mouths.length >= 2) {
    const sorted = [...mouths].sort((a, b) => b.share - a.share || byName(a.label, b.label));
    const dirty = sorted.filter((entry) => entry.share === sorted[0].share);
    const clean = sorted.filter((entry) => entry.share === sorted.at(-1).share);
    const roomRows = unique.filter(hasTrackData);
    const roomExplicit = roomRows.reduce((sum, row) => sum + explicitOf(row), 0);
    const roomTracks = roomRows.reduce((sum, row) => sum + number(row.totalTracks), 0);
    const filthiest = [...roomRows].sort((a, b) => explicitShare(b) - explicitShare(a)
      || explicitOf(b) - explicitOf(a) || byName(a.name, b.name))[0];
    const withExplicit = (row) => ({ ...album(row), pickers: pickersOf(row), caption: explicitCaption(row) });
    if (sorted[0].share > sorted.at(-1).share) cards.push(twoAwards("parental-advisory", [
      crown(dirty.map((entry) => entry.label), "gets the Parental Advisory sticker", "get the Parental Advisory sticker"),
      crown(clean.map((entry) => entry.label), "is the Radio Edit", "are the Radio Edits"),
    ], "Share of each list’s tracks that Spotify marks explicit.", {
      stat: { value: percent(roomExplicit / roomTracks), unit: "of all the room’s tracks are explicit" },
      fact: explicitOf(filthiest)
        ? `Filthiest record: ${filthiest.name}, ${explicitOf(filthiest) === number(filthiest.totalTracks)
          ? `all ${explicitOf(filthiest)} tracks explicit` : explicitCaption(filthiest)}.` : "",
      axis: percentAxis(sorted.map((entry) => entry.share)), noDefault: true,
      ranking: sorted.map((entry) => rankRow(entry.label, entry.share, percent(entry.share), {
        highlight: dirty.includes(entry) || clean.includes(entry), people: [entry.label],
        sub: `${entry.explicit} of ${plural(entry.tracks, "track")}`,
        view: { stat: { value: percent(entry.share), unit: `of ${entry.label}’s tracks are explicit` },
          records: [...entry.rows].sort((a, b) => explicitShare(b) - explicitShare(a) || byName(a.name, b.name)).map(withExplicit) },
      })),
      records: explicitOf(filthiest) ? [withExplicit(filthiest)] : [] }));
  }

  // No skips: the most of one record's tracks a listener starred.
  const starCounts = new Map();
  for (const row of uniqueBy(favorites.filter((item) => item.userId && item.spotifyAlbumId && item.spotifyTrackId),
    (item) => `${item.userId}\u0000${item.spotifyAlbumId}\u0000${item.spotifyTrackId}`)) {
    const key = `${row.userId}\u0000${row.spotifyAlbumId}`;
    starCounts.set(key, (starCounts.get(key) || 0) + 1);
  }
  const starred = picks.map((row) => {
    const stars = starCounts.get(`${row.userId}\u0000${row.spotifyId}`) || 0;
    const total = number(row.totalTracks);
    return { row, stars, total, share: total ? Math.min(1, stars / total) : 0, label: `${row.username}/${row.name}` };
  }).filter((entry) => entry.stars && entry.total >= 5)
    .sort((a, b) => b.share - a.share || b.stars - a.stars || byName(a.label, b.label));
  if (starred.length && starred[0].share >= 0.5) {
    const winners = starred.filter((entry) => entry.share === starred[0].share && entry.stars === starred[0].stars);
    const starRecord = (entry) => ({ ...album(entry.row), pickers: [entry.row.username],
      caption: `${entry.stars} of ${entry.total} tracks starred` });
    const starView = (entry) => ({
      stat: { value: `${entry.stars}/${entry.total}`, unit: `tracks on ${entry.row.name} starred by ${entry.row.username}` },
      records: [starRecord(entry)],
    });
    cards.push(card("no-skips", "No skips.", "The most of one record’s tracks starred as favorites.",
      { ...starView(winners[0]), records: winners.map(starRecord),
        ranking: starred.length > 1 ? starred.slice(0, 6).map((entry) => rankRow(entry.row.username, entry.share,
          `${entry.stars}/${entry.total}`, {
            highlight: winners.includes(entry), sub: entry.row.name, imageUrl: entry.row.imageUrl || null,
            people: [entry.row.username], view: starView(entry),
          })) : [] }));
  }

  const wordCount = (value) => (String(value || "").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  const noteRows = [...picks, ...standouts].filter((row) => row.userId && wordCount(row.review));
  const wordMap = noteWordMap(noteRows);
  if (wordMap.length) cards.push(card("word-map", "A map of the margins.",
    "Sized by how many notes use each word.",
    { stat: { value: noteRows.length, unit: "notes" }, wordMap }));

  const noteTotals = new Map();
  for (const row of noteRows) {
    const entry = noteTotals.get(row.userId) || { listener: person(row), words: 0, count: 0 };
    entry.words += wordCount(row.review);
    entry.count++;
    noteTotals.set(row.userId, entry);
  }
  const writerRows = [...noteTotals.values()].map((entry) => ({ ...entry, label: entry.listener.username }));
  const writers = top(writerRows, (entry) => entry.words);
  if (writers.length) {
    const noteFor = (row) => ({ author: row.username, text: String(row.review).trim(), about: row.name,
      href: noteHref(row, albumRows.has(row.spotifyId) ? "album" : "track") });
    // Everything a listener wrote, longest note first, so the slide shows how much it was.
    const notesBy = (userId) => [...noteRows].filter((row) => row.userId === userId)
      .sort((a, b) => wordCount(b.review) - wordCount(a.review) || byName(a.name || "", b.name || ""))
      .map(noteFor);
    const statFor = (entry) => ({ value: thousands(entry.words),
      unit: `words across ${entry.count} ${entry.count === 1 ? "note" : "notes"}` });
    cards.push(card("written-margins", "Written in the margins.",
      "Most words written in notes, on album picks and standout tracks. Here is all of it.",
      { stat: statFor(writers[0]),
        ranking: writerRows.length >= 2 ? [...writerRows].sort((a, b) => b.words - a.words || byName(a.label, b.label))
          .slice(0, 6).map((entry) => rankRow(entry.label, entry.words, thousands(entry.words), {
            highlight: writers.includes(entry), people: [entry.label], sub: `${entry.count} ${entry.count === 1 ? "note" : "notes"}`,
            view: { stat: statFor(entry), notes: notesBy(entry.listener.id) },
          })) : [],
        notes: notesBy(writers[0].listener.id) }));
  }

  // The last slide is navigation, not a story: one door per listener's full list.
  const listeners = new Map(contributors.map((listener) => [listener.id, listener]));
  const standoutCounts = new Map();
  for (const row of standouts) {
    if (!row.userId) continue;
    if (!listeners.has(row.userId)) listeners.set(row.userId, person(row));
    standoutCounts.set(row.userId, (standoutCounts.get(row.userId) || 0) + 1);
  }
  const shelves = [...listeners.values()].sort((a, b) => byName(a.username, b.username))
    .map((listener) => {
      const rows = ordered(byPerson.get(listener.id) || []);
      return {
        username: listener.username,
        href: listHref(listener.username),
        albumCount: rows.length,
        standoutCount: standoutCounts.get(listener.id) || 0,
        covers: rows.filter((row) => row.imageUrl).slice(0, 4)
          .map((row) => ({ imageUrl: row.imageUrl, name: row.name })),
      };
    });
  cards.push(card("everyone-lists", "Everyone’s lists.",
    "That was the room. Now read it one shelf at a time: every record, note, and favorite track, listener by listener.",
    { people: shelves }));

  return cards;
}
