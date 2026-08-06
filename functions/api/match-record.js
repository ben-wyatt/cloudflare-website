import { requireRecordClubOwner, requireUser } from "../_shared/auth.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../_shared/http.js";
import {
  MATCH_RECORD_ANSWER_COUNT,
  MATCH_RECORD_CHOICE_COUNT,
  normalizeMatchGuesses,
  scoreMatchGuesses,
} from "../_shared/match-record-game.js";
import { RECORD_SEASON } from "../_shared/records-config.js";

const ROUND_TTL_MS = 6 * 60 * 60 * 1000;
const DECOY_COUNT = MATCH_RECORD_CHOICE_COUNT - MATCH_RECORD_ANSWER_COUNT;

function requireGameAccess(user) {
  requireRecordClubOwner(user);
}

function shuffleChoices(choices) {
  const shuffled = [...choices];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = crypto.getRandomValues(new Uint32Array(1))[0];
    const swapIndex = randomValue % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

async function getScoreboard(db, playerId) {
  const score = await db.prepare(
    `SELECT
       COALESCE(SUM(correct_count), 0) AS totalMatches,
       COUNT(*) AS roundsPlayed,
       COALESCE(SUM(CASE WHEN correct_count = 2 THEN 1 ELSE 0 END), 0) AS perfectRounds
     FROM record_match_results
     WHERE player_user_id = ?`,
  ).bind(playerId).first();

  return {
    totalMatches: Number(score?.totalMatches || 0),
    roundsPlayed: Number(score?.roundsPlayed || 0),
    perfectRounds: Number(score?.perfectRounds || 0),
  };
}

async function getRandomTarget(db, player) {
  return db.prepare(
    `SELECT candidate.id AS userId, candidate.username
     FROM record_users candidate
     WHERE candidate.group_id = ?
       AND candidate.id <> ?
       AND (
         SELECT COUNT(DISTINCT target_item.spotify_album_id)
         FROM record_list_items target_item
         JOIN record_albums target_album
           ON target_album.spotify_id = target_item.spotify_album_id
         WHERE target_item.user_id = candidate.id
           AND target_item.season = ?
           AND target_album.image_url IS NOT NULL
           AND trim(target_album.image_url) <> ''
       ) >= ?
       AND (
         SELECT COUNT(DISTINCT decoy_item.spotify_album_id)
         FROM record_list_items decoy_item
         JOIN record_users decoy_user ON decoy_user.id = decoy_item.user_id
         JOIN record_albums decoy_album
           ON decoy_album.spotify_id = decoy_item.spotify_album_id
         WHERE decoy_item.season = ?
           AND decoy_user.group_id = ?
           AND decoy_album.image_url IS NOT NULL
           AND trim(decoy_album.image_url) <> ''
           AND NOT EXISTS (
             SELECT 1
             FROM record_list_items target_check
             WHERE target_check.user_id = candidate.id
               AND target_check.season = decoy_item.season
               AND target_check.spotify_album_id = decoy_item.spotify_album_id
           )
       ) >= ?
     ORDER BY RANDOM()
     LIMIT 1`,
  ).bind(
    player.groupId,
    player.id,
    RECORD_SEASON,
    MATCH_RECORD_ANSWER_COUNT,
    RECORD_SEASON,
    player.groupId,
    DECOY_COUNT,
  ).first();
}

async function createRound(db, player) {
  const target = await getRandomTarget(db, player);
  if (!target) {
    throw new HttpError(
      "This group needs another listener with two covered albums and six other group records before it can play.",
      404,
      "no_match_rounds",
    );
  }

  const [answersResult, decoysResult, scoreboard] = await Promise.all([
    db.prepare(
      `SELECT
         album.spotify_id AS spotifyId,
         album.image_url AS imageUrl
       FROM record_list_items item
       JOIN record_albums album ON album.spotify_id = item.spotify_album_id
       WHERE item.user_id = ?
         AND item.season = ?
         AND album.image_url IS NOT NULL
         AND trim(album.image_url) <> ''
       ORDER BY RANDOM()
       LIMIT ?`,
    ).bind(target.userId, RECORD_SEASON, MATCH_RECORD_ANSWER_COUNT).all(),
    db.prepare(
      `SELECT
         album.spotify_id AS spotifyId,
         album.image_url AS imageUrl
       FROM record_list_items item
       JOIN record_users source_user ON source_user.id = item.user_id
       JOIN record_albums album ON album.spotify_id = item.spotify_album_id
       WHERE item.season = ?
         AND source_user.group_id = ?
         AND album.image_url IS NOT NULL
         AND trim(album.image_url) <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM record_list_items target_item
           WHERE target_item.user_id = ?
             AND target_item.season = item.season
             AND target_item.spotify_album_id = item.spotify_album_id
         )
       GROUP BY album.spotify_id, album.image_url
       ORDER BY RANDOM()
       LIMIT ?`,
    ).bind(RECORD_SEASON, player.groupId, target.userId, DECOY_COUNT).all(),
    getScoreboard(db, player.id),
  ]);

  const answers = (answersResult.results || []).map((album) => ({ ...album, isAnswer: true }));
  const decoys = (decoysResult.results || []).map((album) => ({ ...album, isAnswer: false }));
  if (answers.length !== MATCH_RECORD_ANSWER_COUNT || decoys.length !== DECOY_COUNT) {
    throw new HttpError(
      "That listener no longer has enough group records for a round. Try again.",
      409,
      "match_pool_changed",
    );
  }

  const choices = shuffleChoices([...answers, ...decoys]);
  const now = new Date();
  const roundId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + ROUND_TTL_MS);
  const statements = [
    db.prepare(
      "DELETE FROM record_match_rounds WHERE expires_at <= ? AND completed_at IS NULL",
    ).bind(now.toISOString()),
    db.prepare(
      `INSERT INTO record_match_rounds
         (id, player_user_id, target_user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(roundId, player.id, target.userId, now.toISOString(), expiresAt.toISOString()),
  ];
  choices.forEach((choice, index) => {
    statements.push(db.prepare(
      `INSERT INTO record_match_round_albums
         (round_id, spotify_album_id, display_order, is_answer)
       VALUES (?, ?, ?, ?)`,
    ).bind(roundId, choice.spotifyId, index + 1, choice.isAnswer ? 1 : 0));
  });
  await db.batch(statements);

  return {
    roundId,
    listener: { username: target.username },
    choices: choices.map((choice) => ({
      spotifyId: choice.spotifyId,
      imageUrl: choice.imageUrl,
    })),
    pickCount: MATCH_RECORD_ANSWER_COUNT,
    scoreboard,
  };
}

async function getRound(db, roundId, player) {
  const round = await db.prepare(
    `SELECT
       round.id,
       round.completed_at AS completedAt,
       round.expires_at AS expiresAt,
       target.username AS targetUsername
     FROM record_match_rounds round
     JOIN record_users target ON target.id = round.target_user_id
     WHERE round.id = ?
       AND round.player_user_id = ?
       AND target.group_id = ?
       AND target.id <> ?`,
  ).bind(roundId, player.id, player.groupId, player.id).first();

  if (!round || round.expiresAt <= new Date().toISOString()) {
    throw new HttpError("That round has expired.", 410, "round_expired");
  }
  if (round.completedAt) {
    throw new HttpError("That round is already complete.", 409, "round_finished");
  }
  return round;
}

async function getRoundChoices(db, roundId) {
  const choices = await db.prepare(
    `SELECT
       choice.spotify_album_id AS spotifyId,
       choice.is_answer AS isAnswer,
       album.name,
       album.artist_name AS artistName,
       album.image_url AS imageUrl
     FROM record_match_round_albums choice
     JOIN record_albums album ON album.spotify_id = choice.spotify_album_id
     WHERE choice.round_id = ?
     ORDER BY choice.display_order ASC`,
  ).bind(roundId).all();

  return choices.results || [];
}

async function guessRound(db, player, body) {
  const roundId = String(body.roundId || "").trim();
  const guessedAlbumIds = normalizeMatchGuesses(body.albumIds);
  if (!roundId || roundId.length > 64 || !guessedAlbumIds) {
    throw new HttpError("Choose exactly two of the listed records.", 400, "invalid_match_guess");
  }

  const round = await getRound(db, roundId, player);
  const choices = await getRoundChoices(db, roundId);
  const choiceIds = new Set(choices.map((choice) => choice.spotifyId));
  if (
    choices.length !== MATCH_RECORD_CHOICE_COUNT
    || guessedAlbumIds.some((albumId) => !choiceIds.has(albumId))
  ) {
    throw new HttpError("Choose exactly two of the listed records.", 400, "invalid_match_guess");
  }

  const { answerIds, correctCount } = scoreMatchGuesses(choices, guessedAlbumIds);
  if (answerIds.length !== MATCH_RECORD_ANSWER_COUNT) {
    throw new HttpError("That round is no longer available.", 410, "round_expired");
  }

  const completedAt = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE record_match_rounds
       SET completed_at = ?
       WHERE id = ? AND player_user_id = ? AND completed_at IS NULL`,
    ).bind(completedAt, roundId, player.id),
    db.prepare(
      `INSERT INTO record_match_results
         (round_id, player_user_id, correct_count, completed_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(roundId, player.id, correctCount, completedAt),
  ]);

  return {
    correctCount,
    perfect: correctCount === MATCH_RECORD_ANSWER_COUNT,
    listener: { username: round.targetUsername },
    choices: choices.map((choice) => ({
      spotifyId: choice.spotifyId,
      imageUrl: choice.imageUrl,
      name: choice.name,
      artistName: choice.artistName,
      isAnswer: Boolean(choice.isAnswer),
    })),
    scoreboard: await getScoreboard(db, player.id),
  };
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
