import { requireUser } from "../_shared/auth.js";
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
  MATCH_RECORD_MAX_MISSES,
  findMatchTarget,
  matchRoundProgress,
  nextMatchNote,
  normalizeMatchAlbumId,
  visibleMatchNotes,
} from "../_shared/match-record-game.js";
import {
  GAME_IDS,
  finishedRoundStatement,
  getWrappedUnlock,
  requireRecordGames,
  wrappedUnlockAfterRound,
} from "../_shared/record-access.js";
import { answerKey } from "../_shared/record-game-clues.js";
import { RECORD_SEASON } from "../_shared/records-config.js";

const ROUND_TTL_MS = 6 * 60 * 60 * 1000;
const DECOY_COUNT = MATCH_RECORD_CHOICE_COUNT - MATCH_RECORD_ANSWER_COUNT;

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
       COALESCE(SUM(CASE WHEN correct_count = 2 AND misses = 0 THEN 1 ELSE 0 END), 0) AS perfectRounds
     FROM record_match_results
     WHERE player_user_id = ?`,
  ).bind(playerId).first();

  return {
    totalMatches: Number(score?.totalMatches || 0),
    roundsPlayed: Number(score?.roundsPlayed || 0),
    perfectRounds: Number(score?.perfectRounds || 0),
  };
}

async function createRound(db, player) {
  const target = await findMatchTarget(db, player);
  if (!target) {
    throw new HttpError(
      "This group needs another listener with two covered albums and six other group records before it can play.",
      404,
      "no_match_rounds",
    );
  }

  const [answersResult, decoysResult, scoreboard, wrappedUnlock] = await Promise.all([
    db.prepare(
      `SELECT
         album.spotify_id AS spotifyId,
         album.name,
         album.artist_name AS artistName,
         album.image_url AS imageUrl,
         album.spotify_url AS spotifyUrl
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
         album.name,
         album.artist_name AS artistName,
         album.image_url AS imageUrl,
         album.spotify_url AS spotifyUrl
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
    getWrappedUnlock(db, player),
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
      name: choice.name,
      artistName: choice.artistName,
      imageUrl: choice.imageUrl,
      spotifyUrl: choice.spotifyUrl,
    })),
    pickCount: MATCH_RECORD_ANSWER_COUNT,
    maxMisses: MATCH_RECORD_MAX_MISSES,
    // One fingerprint per answer, so the page can mark a tap right or wrong at once.
    answerKeys: (await Promise.all(answers.map((album) => answerKey(roundId, album.spotifyId)))).sort(),
    scoreboard,
    wrappedUnlock,
  };
}

async function getRound(db, roundId, player) {
  const round = await db.prepare(
    `SELECT
       round.id,
       round.completed_at AS completedAt,
       round.expires_at AS expiresAt,
       target.id AS targetUserId,
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

async function getRoundChoices(db, round) {
  const choices = await db.prepare(
    `SELECT
       choice.spotify_album_id AS spotifyId,
       choice.is_answer AS isAnswer,
       choice.display_order AS displayOrder,
       choice.picked_at AS pickedAt,
       choice.note_revealed_at AS noteRevealedAt,
       album.name,
       album.artist_name AS artistName,
       album.image_url AS imageUrl,
       album.spotify_url AS spotifyUrl,
       note_item.review AS note
     FROM record_match_round_albums choice
     JOIN record_albums album ON album.spotify_id = choice.spotify_album_id
     LEFT JOIN record_list_items note_item
       ON choice.is_answer = 1
       AND note_item.user_id = ?
       AND note_item.season = ?
       AND note_item.spotify_album_id = choice.spotify_album_id
     WHERE choice.round_id = ?
     ORDER BY choice.display_order ASC`,
  ).bind(round.targetUserId, RECORD_SEASON, round.id).all();

  return (choices.results || []).map((choice) => ({
    ...choice,
    isAnswer: Boolean(choice.isAnswer),
    note: String(choice.note || "").trim(),
  }));
}

// Who in the group picked each album on the board, for the end-of-round reveal.
async function getRoundPickers(db, player, albumIds) {
  const placeholders = albumIds.map(() => "?").join(", ");
  const pickers = await db.prepare(
    `SELECT
       item.spotify_album_id AS spotifyId,
       item.user_id AS userId,
       picker.username
     FROM record_list_items item
     JOIN record_users picker ON picker.id = item.user_id
     WHERE item.season = ?
       AND picker.group_id = ?
       AND item.spotify_album_id IN (${placeholders})
     ORDER BY picker.username COLLATE NOCASE ASC`,
  ).bind(RECORD_SEASON, player.groupId, ...albumIds).all();

  const byAlbum = new Map();
  for (const picker of pickers.results || []) {
    if (!byAlbum.has(picker.spotifyId)) byAlbum.set(picker.spotifyId, []);
    byAlbum.get(picker.spotifyId).push(picker);
  }
  return byAlbum;
}

async function revealChoices(db, player, round, choices) {
  const pickersByAlbum = await getRoundPickers(db, player, choices.map((choice) => choice.spotifyId));
  return choices.map((choice) => ({
    spotifyId: choice.spotifyId,
    imageUrl: choice.imageUrl,
    name: choice.name,
    artistName: choice.artistName,
    spotifyUrl: choice.spotifyUrl,
    isAnswer: choice.isAnswer,
    picked: Boolean(choice.pickedAt),
    note: choice.isAnswer ? choice.note : "",
    pickedBy: choice.isAnswer
      ? []
      : (pickersByAlbum.get(choice.spotifyId) || [])
        .filter((picker) => picker.userId !== round.targetUserId)
        .map((picker) => (picker.userId === player.id ? "you" : picker.username)),
  }));
}

async function pickRound(db, player, body) {
  const roundId = String(body.roundId || "").trim();
  const albumId = normalizeMatchAlbumId(body.albumId);
  if (!roundId || roundId.length > 64 || !albumId) {
    throw new HttpError("Choose one of the listed records.", 400, "invalid_match_pick");
  }

  const round = await getRound(db, roundId, player);
  const choices = await getRoundChoices(db, round);
  const choice = choices.find((item) => item.spotifyId === albumId);
  if (!choice) {
    throw new HttpError("Choose one of the listed records.", 400, "invalid_match_pick");
  }
  if (choice.pickedAt) {
    throw new HttpError("You already tried that record.", 409, "duplicate_match_pick");
  }
  if (
    choices.length !== MATCH_RECORD_CHOICE_COUNT
    || choices.filter((item) => item.isAnswer).length !== MATCH_RECORD_ANSWER_COUNT
  ) {
    throw new HttpError("That round is no longer available.", 410, "round_expired");
  }

  const now = new Date().toISOString();
  choice.pickedAt = now;
  const progress = matchRoundProgress(choices);
  const statements = [
    db.prepare(
      `UPDATE record_match_round_albums SET picked_at = ?
       WHERE round_id = ? AND spotify_album_id = ? AND picked_at IS NULL`,
    ).bind(now, round.id, albumId),
  ];

  // A miss that leaves the round going unlocks one of the listener's notes.
  if (!choice.isAnswer && !progress.finished) {
    const unlocked = nextMatchNote(choices);
    if (unlocked) {
      unlocked.noteRevealedAt = now;
      statements.push(db.prepare(
        `UPDATE record_match_round_albums SET note_revealed_at = ?
         WHERE round_id = ? AND spotify_album_id = ?`,
      ).bind(now, round.id, unlocked.spotifyId));
    }
  }

  if (progress.finished) {
    statements.push(db.prepare(
      `UPDATE record_match_rounds SET completed_at = ?
       WHERE id = ? AND player_user_id = ? AND completed_at IS NULL`,
    ).bind(now, round.id, player.id));
    statements.push(db.prepare(
      `INSERT INTO record_match_results
         (round_id, player_user_id, correct_count, misses, completed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(round.id, player.id, progress.found, progress.misses, now));
    statements.push(finishedRoundStatement(db, {
      roundId: round.id,
      playerId: player.id,
      game: GAME_IDS.matchTheRecord,
      finishedAt: now,
    }));
  }
  await db.batch(statements);

  const response = {
    correct: choice.isAnswer,
    misses: progress.misses,
    solved: progress.solved,
    finished: progress.finished,
    maxMisses: MATCH_RECORD_MAX_MISSES,
    foundCount: progress.found,
    // The listener's notes so far: unlocked by misses, or by finding the record.
    notes: visibleMatchNotes(choices, progress.finished),
  };
  if (progress.finished) {
    response.choices = await revealChoices(db, player, round, choices);
    response.scoreboard = await getScoreboard(db, player.id);
    response.wrappedUnlock = await wrappedUnlockAfterRound(db, player);
  }
  return response;
}

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(env, request);
    requireRecordGames(env, user);
    const db = requireDb(env);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError("Choose a valid game action.", 400, "invalid_game_action");
    }

    if (body.action === "new") {
      return json(await createRound(db, user));
    }
    if (body.action === "pick") {
      return json(await pickRound(db, user, body));
    }
    throw new HttpError("Choose a valid game action.", 400, "invalid_game_action");
  } catch (error) {
    return handleApiError(error);
  }
}
