import {
  normalizeUsername,
  requireRecordClubOwner,
  requireUser,
} from "../_shared/auth.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../_shared/http.js";
import { getListenerClueVisibility } from "../_shared/record-game-clues.js";
import { RECORD_SEASON } from "../_shared/records-config.js";
import { getSpotifyAlbumTracks } from "../_shared/spotify.js";

const DEVELOPER_GAME_USERNAME = "ben_dev";
const DEVELOPMENT_GROUP_ID = "development";
const ROUND_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CLUE_LEVEL = 2;
const MAX_MISSES = 3;

function pointsForMissCount(missCount) {
  const awards = [1000, 750, 500];
  return awards[missCount] || 0;
}

async function getScoreboard(db, playerId) {
  const score = await db.prepare(
    `SELECT
       COALESCE(SUM(points), 0) AS totalPoints,
       COUNT(*) AS roundsSolved,
       COALESCE(SUM(CASE WHEN guesses = 1 THEN 1 ELSE 0 END), 0) AS perfectRounds
     FROM record_game_results
     WHERE player_user_id = ?`,
  ).bind(playerId).first();

  return {
    totalPoints: Number(score?.totalPoints || 0),
    roundsSolved: Number(score?.roundsSolved || 0),
    perfectRounds: Number(score?.perfectRounds || 0),
  };
}

function requireGameAccess(user) {
  requireRecordClubOwner(user);
}

function canChooseRoundSource(user) {
  return normalizeUsername(user.username) === DEVELOPER_GAME_USERNAME
    && user.groupId === DEVELOPMENT_GROUP_ID;
}

async function getDeveloperSources(db, player) {
  if (!canChooseRoundSource(player)) return [];

  const sources = await db.prepare(
    `SELECT DISTINCT
       source_user.id AS userId,
       source_user.username
     FROM record_users source_user
     JOIN record_list_items source_item
       ON source_item.user_id = source_user.id
      AND source_item.season = ?
     JOIN record_albums album
       ON album.spotify_id = source_item.spotify_album_id
     WHERE source_user.group_id = ?
       AND source_user.id <> ?
       AND album.image_url IS NOT NULL
       AND trim(album.image_url) <> ''
       AND EXISTS (
         SELECT 1
         FROM record_list_items note_item
         JOIN record_users note_user ON note_user.id = note_item.user_id
         WHERE note_item.season = source_item.season
           AND note_item.spotify_album_id = source_item.spotify_album_id
           AND note_user.group_id = ?
           AND note_item.user_id <> ?
           AND trim(COALESCE(note_item.review, '')) <> ''
       )
     ORDER BY source_user.username COLLATE NOCASE ASC`,
  ).bind(
    RECORD_SEASON,
    player.groupId,
    player.id,
    player.groupId,
    player.id,
  ).all();

  return sources.results || [];
}

async function getAnswerUsers(db, round, player) {
  const answers = await db.prepare(
    `SELECT
       li.user_id AS userId,
       u.username,
       li.review
     FROM record_list_items li
     JOIN record_users u ON u.id = li.user_id
     WHERE li.season = ?
       AND li.spotify_album_id = ?
       AND u.group_id = ?
       AND li.user_id <> ?
     ORDER BY u.username COLLATE NOCASE ASC, u.id ASC`,
  ).bind(RECORD_SEASON, round.spotifyAlbumId, player.groupId, player.id).all();

  return answers.results || [];
}

async function cluesFor(db, env, round, answers, clueLevel, foundUserIds) {
  const listeners = answers.map(() => ({}));
  const visibility = answers.map((answer) => (
    getListenerClueVisibility(answer.userId, clueLevel, foundUserIds)
  ));
  const favoriteAnswerIds = answers
    .filter((_, index) => visibility[index].favoriteTracks)
    .map((answer) => answer.userId);

  const favoriteIdsByUser = new Map();
  if (favoriteAnswerIds.length) {
    const placeholders = favoriteAnswerIds.map(() => "?").join(", ");
    const favorites = await db.prepare(
      `SELECT user_id AS userId, spotify_track_id AS spotifyTrackId
       FROM record_track_favorites
       WHERE season = ?
         AND spotify_album_id = ?
         AND user_id IN (${placeholders})`,
    ).bind(RECORD_SEASON, round.spotifyAlbumId, ...favoriteAnswerIds).all();
    for (const favorite of favorites.results || []) {
      if (!favoriteIdsByUser.has(favorite.userId)) {
        favoriteIdsByUser.set(favorite.userId, new Set());
      }
      favoriteIdsByUser.get(favorite.userId).add(favorite.spotifyTrackId);
    }
  }

  const hasFavorites = favoriteIdsByUser.size > 0;
  const tracks = hasFavorites ? await getSpotifyAlbumTracks(env, round.spotifyAlbumId) : [];
  answers.forEach((answer, index) => {
    if (visibility[index].favoriteTracks) {
      const favoriteIds = favoriteIdsByUser.get(answer.userId) || new Set();
      listeners[index].favoriteTracks = tracks
        .filter((track) => favoriteIds.has(track.spotifyId))
        .map((track) => ({
          name: track.name,
          spotifyUrl: `https://open.spotify.com/track/${track.spotifyId}`,
        }));
    }
    if (visibility[index].review) {
      listeners[index].review = String(answer.review || "");
    }
  });

  return { listeners };
}

async function createRound(db, player, body) {
  const sourceUserId = String(body.sourceUserId || "").trim();
  let sourceUser = null;
  if (sourceUserId) {
    if (!canChooseRoundSource(player)) {
      throw new HttpError(
        "Choosing the next listener is only available to the development account.",
        403,
        "developer_source_forbidden",
      );
    }
    if (sourceUserId === player.id || sourceUserId.length > 128) {
      throw new HttpError("Choose a valid development listener.", 400, "invalid_round_source");
    }
    sourceUser = await db.prepare(
      `SELECT id, username
       FROM record_users
       WHERE id = ? AND group_id = ? AND id <> ?`,
    ).bind(sourceUserId, player.groupId, player.id).first();
    if (!sourceUser) {
      throw new HttpError("Choose a valid development listener.", 400, "invalid_round_source");
    }
  }

  const sourceFilter = sourceUser
    ? `AND EXISTS (
         SELECT 1
         FROM record_list_items source_item
         WHERE source_item.user_id = ?
           AND source_item.season = li.season
           AND source_item.spotify_album_id = li.spotify_album_id
       )`
    : "";
  const answerStatement = db.prepare(
    `SELECT
       MIN(li.id) AS listItemId,
       a.image_url AS coverUrl,
       COUNT(DISTINCT li.user_id) AS selectorCount
     FROM record_list_items li
     JOIN record_users u ON u.id = li.user_id
     JOIN record_albums a ON a.spotify_id = li.spotify_album_id
     WHERE li.season = ?
       AND u.group_id = ?
       AND li.user_id <> ?
       AND a.image_url IS NOT NULL
       AND trim(a.image_url) <> ''
       ${sourceFilter}
     GROUP BY li.spotify_album_id, a.image_url
     HAVING SUM(
       CASE WHEN trim(COALESCE(li.review, '')) <> '' THEN 1 ELSE 0 END
     ) > 0
     ORDER BY RANDOM()
     LIMIT 1`,
  );
  const boundAnswer = sourceUser
    ? answerStatement.bind(RECORD_SEASON, player.groupId, player.id, sourceUser.id)
    : answerStatement.bind(RECORD_SEASON, player.groupId, player.id);

  const [answer, users, scoreboard, developerSources] = await Promise.all([
    boundAnswer.first(),
    db.prepare(
      `SELECT id AS userId, username
       FROM record_users
       WHERE group_id = ? AND id <> ?
       ORDER BY username COLLATE NOCASE ASC`,
    ).bind(player.groupId, player.id).all(),
    getScoreboard(db, player.id),
    getDeveloperSources(db, player),
  ]);

  if (!answer) {
    if (sourceUser) {
      throw new HttpError(
        `${sourceUser.username} does not have a game-ready album yet.`,
        404,
        "no_source_albums",
      );
    }
    throw new HttpError(
      "The game needs at least one other listener with a saved album, cover art, and a note.",
      404,
      "no_game_albums",
    );
  }

  const now = new Date();
  const roundId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + ROUND_TTL_MS);
  await db.batch([
    db.prepare("DELETE FROM record_game_rounds WHERE expires_at <= ?").bind(now.toISOString()),
    db.prepare(
      `INSERT INTO record_game_rounds
         (id, player_user_id, answer_list_item_id, clue_level, guess_count, created_at, expires_at)
       VALUES (?, ?, ?, 0, 0, ?, ?)`,
    ).bind(roundId, player.id, answer.listItemId, now.toISOString(), expiresAt.toISOString()),
  ]);

  return {
    roundId,
    coverUrl: answer.coverUrl,
    clueLevel: 0,
    clues: {},
    choices: users.results || [],
    selectorCount: Number(answer.selectorCount || 1),
    scoreboard,
    developerTools: canChooseRoundSource(player)
      ? { sources: developerSources }
      : null,
  };
}

async function getRound(db, roundId, player) {
  const round = await db.prepare(
    `SELECT
       r.id,
       r.clue_level AS clueLevel,
       r.guess_count AS guessCount,
       r.solved_at AS solvedAt,
       r.expires_at AS expiresAt,
       li.spotify_album_id AS spotifyAlbumId,
       a.name AS albumName,
       a.artist_name AS artistName
     FROM record_game_rounds r
     JOIN record_list_items li ON li.id = r.answer_list_item_id
     JOIN record_albums a ON a.spotify_id = li.spotify_album_id
     JOIN record_users u ON u.id = li.user_id
     WHERE r.id = ?
       AND r.player_user_id = ?
       AND u.group_id = ?
       AND li.user_id <> ?`,
  ).bind(roundId, player.id, player.groupId, player.id).first();

  if (!round || round.expiresAt <= new Date().toISOString()) {
    throw new HttpError("That round has expired.", 410, "round_expired");
  }
  if (round.solvedAt) {
    throw new HttpError("That round is already complete.", 409, "round_finished");
  }
  if (Number(round.guessCount) >= MAX_MISSES) {
    throw new HttpError("That round is already complete.", 409, "round_finished");
  }
  return round;
}

async function guessRound(db, env, player, body) {
  const roundId = String(body.roundId || "").trim();
  const guessedUserId = String(body.userId || "").trim();
  if (
    !roundId
    || !guessedUserId
    || guessedUserId === player.id
    || roundId.length > 64
    || guessedUserId.length > 128
  ) {
    throw new HttpError("Choose one of the listed members.", 400, "invalid_guess");
  }

  const round = await getRound(db, roundId, player);
  const [guessedUser, answers, previousGuesses] = await Promise.all([
    db.prepare("SELECT id FROM record_users WHERE id = ? AND group_id = ?")
      .bind(guessedUserId, player.groupId).first(),
    getAnswerUsers(db, round, player),
    db.prepare(
      "SELECT guessed_user_id AS userId FROM record_game_guesses WHERE round_id = ?",
    ).bind(roundId).all(),
  ]);
  if (!guessedUser) {
    throw new HttpError("Choose one of the listed members.", 400, "invalid_guess");
  }
  if (!answers.length) {
    throw new HttpError("That round is no longer available.", 410, "round_expired");
  }

  const guessedUserIds = new Set(
    (previousGuesses.results || []).map((guess) => guess.userId),
  );
  if (guessedUserIds.has(guessedUserId)) {
    throw new HttpError("You already tried that listener.", 409, "duplicate_guess");
  }

  const now = new Date().toISOString();
  const answerUserIds = new Set(answers.map((answer) => answer.userId));
  const correct = answerUserIds.has(guessedUserId);
  const foundUserIds = new Set(
    [...guessedUserIds].filter((userId) => answerUserIds.has(userId)),
  );
  if (correct) foundUserIds.add(guessedUserId);

  const missCount = Number(round.guessCount) + (correct ? 0 : 1);
  const solved = correct && foundUserIds.size === answers.length;
  const finished = solved || missCount >= MAX_MISSES;
  const nextClueLevel = correct
    ? Number(round.clueLevel)
    : Math.min(Number(round.clueLevel) + 1, MAX_CLUE_LEVEL);
  const clueLevel = finished ? MAX_CLUE_LEVEL : nextClueLevel;
  const clues = await cluesFor(db, env, round, answers, clueLevel, foundUserIds);
  const statements = [
    db.prepare(
      `INSERT INTO record_game_guesses (round_id, guessed_user_id, created_at)
       VALUES (?, ?, ?)`,
    ).bind(roundId, guessedUserId, now),
  ];

  if (solved) {
    const pointsAwarded = pointsForMissCount(missCount);
    statements.push(db.prepare(
      `UPDATE record_game_rounds
       SET clue_level = ?, guess_count = ?, solved_at = ?
       WHERE id = ?`,
    ).bind(clueLevel, missCount, now, roundId));
    statements.push(db.prepare(
      `INSERT INTO record_game_results
         (round_id, player_user_id, points, guesses, clues_used, solved_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      roundId,
      player.id,
      pointsAwarded,
      missCount + 1,
      Math.min(missCount, MAX_CLUE_LEVEL),
      now,
    ));
  } else if (finished) {
    statements.push(db.prepare(
      `UPDATE record_game_rounds
       SET clue_level = ?, guess_count = ?, solved_at = ?
       WHERE id = ?`,
    ).bind(clueLevel, missCount, now, roundId));
  } else {
    statements.push(db.prepare(
      `UPDATE record_game_rounds
       SET clue_level = ?, guess_count = ?
       WHERE id = ?`,
    ).bind(clueLevel, missCount, roundId));
  }
  await db.batch(statements);

  const response = {
    correct,
    solved,
    finished,
    selectorCount: answers.length,
    foundCount: foundUserIds.size,
    clueLevel,
    missCount,
    clues,
  };
  if (correct) {
    response.matchedListenerIndex = answers.findIndex(
      (answer) => answer.userId === guessedUserId,
    );
  }
  if (solved) {
    response.pointsAwarded = pointsForMissCount(missCount);
    response.scoreboard = await getScoreboard(db, player.id);
  }
  if (finished) {
    response.answer = {
      users: answers.map((answer) => ({
        userId: answer.userId,
        username: answer.username,
      })),
      albumName: round.albumName,
      artistName: round.artistName,
    };
  }
  return response;
}

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(env, request);
    requireGameAccess(user);
    const db = requireDb(env);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError("Choose a valid game action.", 400, "invalid_game_action");
    }

    if (body.action === "new") {
      return json(await createRound(db, user, body));
    }
    if (body.action === "guess") {
      return json(await guessRound(db, env, user, body));
    }
    throw new HttpError("Choose a valid game action.", 400, "invalid_game_action");
  } catch (error) {
    return handleApiError(error);
  }
}
