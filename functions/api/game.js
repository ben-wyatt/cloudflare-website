import { normalizeUsername, requireUser } from "../_shared/auth.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../_shared/http.js";

const GAME_USERNAME = "ben";
const SEASON = 2026;
const ROUND_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CLUE_LEVEL = 3;

function pointsForGuessCount(guessCount) {
  const awards = [1000, 750, 500, 300];
  if (guessCount <= awards.length) return awards[guessCount - 1];
  return Math.max(50, awards[awards.length - 1] - ((guessCount - awards.length) * 50));
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
  if (normalizeUsername(user.username) !== GAME_USERNAME) {
    throw new HttpError("This game is only available on ben's account.", 403, "game_forbidden");
  }
}

function cluesFor(round, clueLevel) {
  const clues = {};
  if (clueLevel >= 1) clues.albumName = round.albumName;
  if (clueLevel >= 2) clues.artistName = round.artistName;
  if (clueLevel >= 3) clues.review = round.review;
  return clues;
}

async function createRound(db, player) {
  const [answer, users, scoreboard] = await Promise.all([
    db.prepare(
      `SELECT li.id AS listItemId, a.image_url AS coverUrl
       FROM record_list_items li
       JOIN record_users u ON u.id = li.user_id
       JOIN record_albums a ON a.spotify_id = li.spotify_album_id
       WHERE li.season = ?
         AND u.group_id = ?
         AND a.image_url IS NOT NULL
         AND trim(a.image_url) <> ''
         AND trim(li.review) <> ''
       ORDER BY RANDOM()
       LIMIT 1`,
    ).bind(SEASON, player.groupId).first(),
    db.prepare(
      `SELECT id AS userId, username
       FROM record_users
       WHERE group_id = ?
       ORDER BY username COLLATE NOCASE ASC`,
    ).bind(player.groupId).all(),
    getScoreboard(db, player.id),
  ]);

  if (!answer) {
    throw new HttpError(
      "The game needs at least one saved album with cover art and a note.",
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
    scoreboard,
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
       li.user_id AS answerUserId,
       li.review,
       a.name AS albumName,
       a.artist_name AS artistName,
       u.username AS answerUsername
     FROM record_game_rounds r
     JOIN record_list_items li ON li.id = r.answer_list_item_id
     JOIN record_albums a ON a.spotify_id = li.spotify_album_id
     JOIN record_users u ON u.id = li.user_id
     WHERE r.id = ? AND r.player_user_id = ? AND u.group_id = ?`,
  ).bind(roundId, player.id, player.groupId).first();

  if (!round || round.expiresAt <= new Date().toISOString()) {
    throw new HttpError("That round has expired.", 410, "round_expired");
  }
  if (round.solvedAt) {
    throw new HttpError("That round is already complete.", 409, "round_finished");
  }
  return round;
}

async function guessRound(db, player, body) {
  const roundId = String(body.roundId || "").trim();
  const guessedUserId = String(body.userId || "").trim();
  if (!roundId || !guessedUserId || roundId.length > 64 || guessedUserId.length > 128) {
    throw new HttpError("Choose one of the listed members.", 400, "invalid_guess");
  }

  const round = await getRound(db, roundId, player);
  const [guessedUser, previousGuess] = await Promise.all([
    db.prepare("SELECT id FROM record_users WHERE id = ? AND group_id = ?")
      .bind(guessedUserId, player.groupId).first(),
    db.prepare(
      "SELECT 1 AS found FROM record_game_guesses WHERE round_id = ? AND guessed_user_id = ?",
    ).bind(roundId, guessedUserId).first(),
  ]);
  if (!guessedUser) {
    throw new HttpError("Choose one of the listed members.", 400, "invalid_guess");
  }
  if (previousGuess) {
    throw new HttpError("You already tried that listener.", 409, "duplicate_guess");
  }

  const now = new Date().toISOString();
  const correct = guessedUserId === round.answerUserId;
  const clueLevel = correct
    ? MAX_CLUE_LEVEL
    : Math.min(Number(round.clueLevel) + 1, MAX_CLUE_LEVEL);
  const guessCount = Number(round.guessCount) + 1;
  const statements = [
    db.prepare(
      `INSERT INTO record_game_guesses (round_id, guessed_user_id, created_at)
       VALUES (?, ?, ?)`,
    ).bind(roundId, guessedUserId, now),
  ];

  if (correct) {
    const pointsAwarded = pointsForGuessCount(guessCount);
    statements.push(db.prepare(
      `UPDATE record_game_rounds
       SET clue_level = ?, guess_count = ?, solved_at = ?
       WHERE id = ?`,
    ).bind(clueLevel, guessCount, now, roundId));
    statements.push(db.prepare(
      `INSERT INTO record_game_results
         (round_id, player_user_id, points, guesses, clues_used, solved_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(roundId, player.id, pointsAwarded, guessCount, Number(round.clueLevel), now));
  } else {
    statements.push(db.prepare(
      `UPDATE record_game_rounds
       SET clue_level = ?, guess_count = ?
       WHERE id = ?`,
    ).bind(clueLevel, guessCount, roundId));
  }
  await db.batch(statements);

  const response = {
    correct,
    clueLevel,
    guessCount,
    clues: cluesFor(round, clueLevel),
  };
  if (correct) {
    response.pointsAwarded = pointsForGuessCount(guessCount);
    response.scoreboard = await getScoreboard(db, player.id);
    response.answer = {
      userId: round.answerUserId,
      username: round.answerUsername,
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
      return json(await createRound(db, user));
    }
    if (body.action === "guess") {
      return json(await guessRound(db, user, body));
    }
    throw new HttpError("Choose a valid game action.", 400, "invalid_game_action");
  } catch (error) {
    return handleApiError(error);
  }
}
