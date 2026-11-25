import { genreTags } from "./record-game-clues.js";

// The question games: the player types plain questions (or, in Only One, a description) and
// Jev answers one yes/no judgment per card on the board. Everything Jev needs is written into
// each card's facts, so it reads what the friends picked instead of recalling new albums.
// This file is pure: the facts each card carries, the questions sent, and the rules that turn
// probabilities into answers and turned-down cards. The rules live here, not in prompts.

export const VARIANTS = ["record", "listener", "only-one"];
export const RECORD_BOARD_SIZE = 24;
export const ONLY_ONE_BOARD_SIZE = 12;
export const ONLY_ONE_LOOKALIKES = 6;
export const LISTENER_MIN_RECORDS = 3;
export const MAX_TURNS = 40;
export const MAX_TEXT_LENGTH = 200;

// ---- Answer rules ----------------------------------------------------------------------
// The secret card's probability decides the answer. A card turns down only when its own
// probability clearly disagrees, and the secret card always agrees with itself, so the
// secret can never be turned down: a wrong judgment makes a round easier or harder, never lost.
const BANDS = [
  { answer: "yes", label: "Yes", min: 0.7, turnDown: (p) => p <= 0.3 },
  { answer: "probably", label: "Probably", min: 0.55, turnDown: (p) => p <= 0.1 },
  { answer: "unsure", label: "Hard to say", min: 0.45, turnDown: () => false },
  { answer: "probably-not", label: "Probably not", min: 0.3, turnDown: (p) => p >= 0.9 },
  { answer: "no", label: "No", min: -Infinity, turnDown: (p) => p >= 0.7 },
];

export function answerFor(secretProbability) {
  const p = Number(secretProbability);
  const band = BANDS.find((entry) => p >= entry.min) || BANDS.at(-1);
  return { answer: band.answer, label: band.label };
}

// judgments: [{ id, p }] for the cards still up. Returns the ids to turn down.
export function cardsToTurnDown(answer, judgments, secretId) {
  const band = BANDS.find((entry) => entry.answer === answer);
  if (!band) return [];
  return judgments
    .filter((judgment) => judgment.id !== secretId && judgment.p !== null && band.turnDown(judgment.p))
    .map((judgment) => judgment.id);
}

// A message that is not a yes/no question gets no answer, if Jev is fairly sure of that.
export function isNotYesNo(kindAnswer) {
  const probabilities = kindAnswer?.probabilities || {};
  return Number(probabilities.yes_no ?? 1) < 0.4;
}

// Only One: the description must fit the target and nothing else on the board.
export const FITS = 0.6;
export const MISFITS = 0.4;
export function fitLevel(p) {
  if (p === null || p === undefined) return "no";
  return p >= FITS ? "fits" : p > MISFITS ? "maybe" : "no";
}

export function onlyOneResult(targetId, judgments) {
  const levels = judgments.map((judgment) => ({ id: judgment.id, level: fitLevel(judgment.p) }));
  const target = levels.find((entry) => entry.id === targetId);
  const others = levels.filter((entry) => entry.id !== targetId);
  const targetFits = target?.level === "fits";
  const alsoFit = others.filter((entry) => entry.level !== "no").length;
  return { levels, targetFits, alsoFit, solved: targetFits && alsoFit === 0 };
}

// ---- Facts each card carries -----------------------------------------------------------
const LANGUAGES = {
  eng: "English", spa: "Spanish", por: "Portuguese", fra: "French", deu: "German", ita: "Italian",
  jpn: "Japanese", kor: "Korean", hin: "Hindi", zho: "Chinese", ara: "Arabic", swe: "Swedish",
  nld: "Dutch", rus: "Russian", tur: "Turkish", yor: "Yoruba", cat: "Catalan", isl: "Icelandic",
  zxx: "no lyrics (instrumental)", mul: "several languages", qaa: "an invented language",
};
const ARTIST_KINDS = { Person: "solo artist", Group: "band or group", Orchestra: "orchestra", Choir: "choir", Character: "fictional character", "Various artists": "various artists" };

function parse(json) {
  try {
    return JSON.parse(json || "null");
  } catch {
    return null;
  }
}

// Drop empty values so each card costs fewer tokens.
export function compact(value) {
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => [key, compact(item)]).filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value))) return undefined;
  return value;
}

// Last.fm genre tags without bare numbers, which some albums carry.
const tagsOf = (album, limit) => genreTags(album.lastfmTagsJson, album.artistName, limit + 2)
  .filter((tag) => !/^\d+$/.test(tag)).slice(0, limit);

function audience(listeners) {
  const count = Number(listeners);
  if (!Number.isFinite(count) || count <= 0) return undefined;
  const size = count < 5_000 ? "tiny" : count < 50_000 ? "small" : count < 500_000 ? "mid-sized"
    : count < 2_000_000 ? "large" : "huge";
  return `${count.toLocaleString("en-US")} Last.fm listeners (a ${size} audience)`;
}

function albumKind(album) {
  const type = String(album.albumType || "").toLowerCase();
  if (type === "compilation") return "compilation";
  if (type === "single") return Number(album.totalTracks) > 3 ? "EP" : "single";
  return type ? "album" : undefined;
}

function artistFacts(facts) {
  const artist = facts?.artist;
  if (!artist) return undefined;
  return {
    name: artist.name,
    kind: ARTIST_KINDS[artist.type] || artist.type?.toLowerCase(),
    gender: artist.gender ? String(artist.gender).toLowerCase() : undefined,
    from: [artist.beginArea, artist.area].filter((place, index, all) => place && all.indexOf(place) === index).join(", "),
    // MusicBrainz's start year is a birth year for a person and a founding year for a band.
    [artist.type === "Person" ? "born" : "formed"]: artist.activeSince,
    known_as: artist.disambiguation,
    artist_tags: artist.tags,
    similar_artists: artist.similar,
    about: artist.bio,
  };
}

function coverFacts(description) {
  if (!description) return undefined;
  return {
    description: description.description,
    main_subject: description.subject,
    people: description.people,
    medium: description.medium,
    colors: description.palette,
    brightness: description.brightness,
    mood: description.mood,
    style: description.style,
    things_shown: description.objects,
    printed_text: description.textOnCover,
  };
}

// album: a record_albums row with descriptionJson and factsJson.
// picks: [{ username, review }] of this album; favorites: [{ username, trackName }];
// trackNames: string[] in album order.
export function recordFacts(album, { picks = [], favorites = [], trackNames = [] } = {}) {
  const facts = parse(album.factsJson);
  const year = Number(String(album.releaseDate || "").slice(0, 4)) || undefined;
  const minutes = Math.round(Number(album.totalDurationMs || 0) / 60000) || undefined;
  return compact({
    title: album.name,
    artist: album.artistName,
    released: album.releaseDate && String(album.releaseDate).length > 4 ? album.releaseDate : year,
    kind: albumKind(album),
    tracks: Number(album.totalTracks) || undefined,
    length: minutes ? `${minutes} minutes` : undefined,
    explicit_tracks: album.explicitTrackCount === null || album.explicitTrackCount === undefined ? undefined : Number(album.explicitTrackCount),
    lyrics_language: LANGUAGES[String(album.language || "").toLowerCase()],
    audience: audience(album.lastfmListeners),
    genre_tags: tagsOf(album, 6),
    artist_facts: artistFacts(facts),
    about_the_album: facts?.albumWiki,
    track_names: trackNames.slice(0, 30),
    cover: coverFacts(parse(album.descriptionJson)),
    picked_by: [...new Set(picks.map((pick) => pick.username))],
    notes: picks.filter((pick) => String(pick.review || "").trim())
      .map((pick) => ({ by: pick.username, note: String(pick.review).trim() })),
    favorite_tracks: favorites.map((favorite) => ({ by: favorite.username, track: favorite.trackName })),
  });
}

// albums: this listener's picks, each an album row plus { review }; standouts: [{ trackName, artistName }].
export function listenerFacts(username, albums, standouts = []) {
  // Exact summaries computed here, so questions like "anything before 1990?" are a lookup.
  const years = albums.map((album) => Number(String(album.releaseDate || "").slice(0, 4))).filter(Boolean);
  const languages = [...new Set(albums.map((album) => LANGUAGES[String(album.language || "").toLowerCase()]).filter(Boolean))];
  return compact({
    name: username,
    oldest_record_year: years.length ? Math.min(...years) : undefined,
    newest_record_year: years.length ? Math.max(...years) : undefined,
    decades_picked: [...new Set(years.map((year) => `${Math.floor(year / 10) * 10}s`))].sort(),
    lyrics_languages: languages,
    records_picked: albums.length,
    notes_written: albums.filter((album) => String(album.review || "").trim()).length,
    standout_tracks_picked: standouts.length,
    records: albums.map((album) => {
      const facts = parse(album.factsJson);
      const artist = facts?.artist || {};
      const cover = parse(album.descriptionJson);
      return {
        title: album.name,
        artist: album.artistName,
        year: Number(String(album.releaseDate || "").slice(0, 4)) || undefined,
        kind: albumKind(album),
        lyrics_language: LANGUAGES[String(album.language || "").toLowerCase()],
        genre_tags: tagsOf(album, 4),
        artist_tags: (artist.tags || []).slice(0, 3),
        artist_is: [ARTIST_KINDS[artist.type], artist.gender ? String(artist.gender).toLowerCase() : "", artist.area ? `from ${artist.area}` : ""]
          .filter(Boolean).join(", "),
        audience: audience(album.lastfmListeners),
        cover: cover?.subject,
        note: String(album.review || "").trim(),
      };
    }),
    standout_tracks: standouts.map((track) => `${track.trackName} by ${track.artistName}`),
  });
}

// ---- The questions sent to Jev -------------------------------------------------------
const YES_NO = {
  true: "Yes: the answer to the player's question is yes for this one.",
  false: "No: the answer to the player's question is no for this one.",
};

const TASKS = {
  record: "Friends each picked the albums they loved this year. A player asks yes-or-no questions to find one secret album among them. Answer the player's question, `question`, for the album described in `album`, the way a friend who knows these facts would answer. Questions can be about the music, the artist, the cover art, when it came out, or the friends who picked it and what they wrote.",
  listener: "Friends each picked the albums they loved this year. A player asks yes-or-no questions to find one secret friend. Answer the player's question, `question`, for the friend described in `listener`, judging by the records they picked, what they wrote about them, and their standout tracks.",
  "only-one": "Friends each picked the albums they loved this year. A player writes a short description that should fit exactly one album. Does the player's description, `description`, fit the album described in `album`? It fits only when everything it says is true of this album: its music, its artist, its cover art, when it came out, or the friends who picked it and what they wrote.",
};

const FIT = {
  true: "The description fits: everything it says is true of this album.",
  false: "The description does not fit: something it says is not true of this album, or it is about something else.",
};

const KIND = (thing) => ({
  type: "choice",
  instructions: `In a guessing game, a player types messages to find a secret ${thing}. What kind of message is \`question\`?`,
  criteria: {
    yes_no: "A question with a yes-or-no answer, including a direct guess such as \"is it the one with the dog?\"",
    open: "A question that needs more than a yes or no, such as \"what genre is it?\" or \"who picked it?\"",
    other: "Not a question: a greeting, an instruction, or nonsense.",
  },
});

// cards: [{ id, facts }]. Question names are card ids with a prefix (names are not sent to Jev).
export function buildJevRequest(variant, text, cards) {
  const questions = {};
  const key = variant === "listener" ? "listener" : "album";
  cards.forEach((card, index) => {
    questions[`c${index}`] = {
      type: "noul",
      instructions: { task: TASKS[variant], [key]: card.facts },
      criteria: variant === "only-one" ? FIT : YES_NO,
    };
  });
  if (variant !== "only-one") questions.kind = KIND(variant === "listener" ? "friend" : "album");
  return {
    state: variant === "only-one" ? { description: text } : { question: text },
    questions,
  };
}

// Pairs each card with its probability from the answers.
export function judgmentsFrom(cards, answers) {
  return cards.map((card, index) => {
    const value = Number(answers?.[`c${index}`]?.noul);
    return { id: card.id, p: Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null };
  });
}

// ---- Boards ----------------------------------------------------------------------------
export function shuffle(items, random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

// Only One's board: the target, some of its closest look-alikes in this group, the rest at random.
export function onlyOneBoard(targetId, allIds, lookalikeIds, random) {
  const others = allIds.filter((id) => id !== targetId);
  const lookalikes = lookalikeIds.filter((id) => id !== targetId && others.includes(id)).slice(0, ONLY_ONE_LOOKALIKES);
  const rest = shuffle(others.filter((id) => !lookalikes.includes(id)), random)
    .slice(0, ONLY_ONE_BOARD_SIZE - 1 - lookalikes.length);
  return shuffle([targetId, ...lookalikes, ...rest], random);
}

export function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}
