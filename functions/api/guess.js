import { requireRecordClubOwner, requireUser } from "../_shared/auth.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../_shared/http.js";
import { askJev } from "../_shared/jev.js";
import {
  groupBy,
  listHref,
  loadGroupAlbums,
  loadGroupFavorites,
  loadGroupPicks,
  loadTrackNames,
} from "../_shared/guess-data.js";
import {
  MAX_TURNS,
  RECORD_BOARD_SIZE,
  answerFor,
  buildJevRequest,
  cardsToTurnDown,
  cleanText,
  isNotYesNo,
  judgmentsFrom,
  recordFacts,
  shuffle,
} from "../_shared/question-games.js";

// Guess the Record. The player types; Jev reads each record of the player's group and answers
// one yes/no judgment per record; code turns that into an answer.
const ROUND_TTL_MS = 12 * 60 * 60 * 1000;
const randomIndex = (length) => crypto.getRandomValues(new Uint32Array(1))[0] % length;

// The same gate as the other Record Club games.
function requireGameAccess(user) {
  requireRecordClubOwner(user);
  if (!user.groupId) throw new HttpError("This account is not in a Record Club group.", 403, "group_required");
}

// What the page may see of a card: never its facts.
const publicCard = ({ facts, ...card }) => card;

async function recordCards(db, groupId, albums) {
  const [picks, favorites, trackNames] = await Promise.all([
    loadGroupPicks(db, groupId),
    loadGroupFavorites(db, groupId),
    loadTrackNames(db, albums.map((album) => album.spotifyId)),
  ]);
  const picksByAlbum = groupBy(picks, "spotifyId");
  const favoritesByAlbum = groupBy(favorites, "spotifyId");
  return albums.map((album) => ({
    id: album.spotifyId,
    title: album.name,
    subtitle: album.artistName,
    imageUrl: album.imageUrl,
    spotifyUrl: album.spotifyUrl,
    facts: recordFacts(album, {
      picks: picksByAlbum.get(album.spotifyId) || [],
      favorites: favoritesByAlbum.get(album.spotifyId) || [],
      trackNames: trackNames.get(album.spotifyId) || [],
    }),
  }));
}

async function createRound(db, player) {
  const groupId = player.groupId;
  const albums = shuffle(await loadGroupAlbums(db, groupId)).slice(0, RECORD_BOARD_SIZE);
  if (albums.length < 6) throw new HttpError("This group needs more records with covers to play.", 404, "not_enough_records");
  const cards = await recordCards(db, groupId, albums);
  const secretId = cards[randomIndex(cards.length)].id;
  const now = new Date();
  const roundId = crypto.randomUUID();
  await db.batch([
    db.prepare("DELETE FROM record_question_rounds WHERE player_user_id = ? AND finished_at IS NULL AND expires_at <= ?")
      .bind(player.id, now.toISOString()),
    db.prepare(
      `INSERT INTO record_question_rounds
         (id, player_user_id, data_group_id, variant, secret_id, board_json, created_at, expires_at)
       VALUES (?, ?, ?, 'record', ?, ?, ?, ?)`,
    ).bind(roundId, player.id, groupId, secretId, JSON.stringify({ cards, down: [] }), now.toISOString(),
      new Date(now.getTime() + ROUND_TTL_MS).toISOString()),
  ]);
  return { roundId, group: groupId, cards: cards.map(publicCard), maxTurns: MAX_TURNS };
}

async function getRound(db, roundId, player) {
  const round = await db.prepare(
    `SELECT r.id, r.secret_id AS secretId, r.board_json AS boardJson, r.expires_at AS expiresAt,
       r.finished_at AS finishedAt,
       (SELECT COUNT(*) FROM record_question_turns t WHERE t.round_id = r.id) AS turnCount
     FROM record_question_rounds r
     WHERE r.id = ? AND r.player_user_id = ?`,
  ).bind(String(roundId || "").slice(0, 64), player.id).first();
  if (!round || round.expiresAt <= new Date().toISOString()) throw new HttpError("That round has expired.", 410, "round_expired");
  if (round.finishedAt) throw new HttpError("That round is already over.", 409, "round_finished");
  return { ...round, board: JSON.parse(round.boardJson), turnCount: Number(round.turnCount || 0) };
}

function reveal(round) {
  const card = round.board.cards.find((item) => item.id === round.secretId);
  if (!card) return null;
  const facts = card.facts || {};
  return {
    ...publicCard(card),
    pickers: (facts.picked_by || []).map((username) => ({ username, href: listHref(username) })),
    notes: facts.notes || [],
  };
}

function turnStatement(db, roundId, { kind, text, answer, judgments = null, turnedDown = null, inputTokens = null }) {
  return db.prepare(
    `INSERT INTO record_question_turns
       (round_id, kind, text, answer, judgments_json, turned_down_json, input_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(roundId, kind, text, answer, judgments ? JSON.stringify(judgments) : null,
    turnedDown ? JSON.stringify(turnedDown) : null, inputTokens, new Date().toISOString());
}

function finishStatement(db, roundId, solved) {
  return db.prepare("UPDATE record_question_rounds SET finished_at = ?, solved = ? WHERE id = ?")
    .bind(new Date().toISOString(), solved ? 1 : 0, roundId);
}

async function ask(db, env, player, body) {
  const round = await getRound(db, body.roundId, player);
  const text = cleanText(body.text);
  if (text.length < 2) throw new HttpError("Type a question first.", 400, "empty_question");
  if (round.turnCount >= MAX_TURNS) throw new HttpError("That's the most questions one round allows.", 409, "too_many_turns");
  // Records already turned over are not asked about again.
  const down = new Set(round.board.down);
  const cards = round.board.cards.filter((card) => !down.has(card.id));
  const jev = await askJev(env, buildJevRequest(text, cards));
  const judgments = judgmentsFrom(cards, jev.answers);

  if (isNotYesNo(jev.answers.kind)) {
    await db.batch([turnStatement(db, round.id, { kind: "question", text, answer: "not-yes-no", judgments, inputTokens: jev.inputTokens })]);
    return { answer: "not-yes-no", label: "Ask something with a yes-or-no answer.", turnedDown: [], judgments, notCounted: true };
  }

  const secret = judgments.find((judgment) => judgment.id === round.secretId);
  const { answer, label } = answerFor(secret?.p ?? 0.5);
  const turnedDown = cardsToTurnDown(answer, judgments, round.secretId);
  const nowDown = [...down, ...turnedDown];
  const upCount = round.board.cards.length - nowDown.length;
  // When only the secret is left standing, the round is won.
  const solved = upCount === 1;
  const statements = [
    turnStatement(db, round.id, { kind: "question", text, answer, judgments, turnedDown, inputTokens: jev.inputTokens }),
    db.prepare("UPDATE record_question_rounds SET board_json = ? WHERE id = ?")
      .bind(JSON.stringify({ ...round.board, down: nowDown }), round.id),
  ];
  if (solved) statements.push(finishStatement(db, round.id, true));
  await db.batch(statements);
  return { answer, label, turnedDown, upCount, judgments, solved, reveal: solved ? reveal(round) : null };
}

async function guess(db, player, body) {
  const round = await getRound(db, body.roundId, player);
  const id = String(body.id || "");
  const card = round.board.cards.find((item) => item.id === id);
  if (!card || round.board.down.includes(id)) throw new HttpError("Choose a record that is still up.", 400, "invalid_guess");
  const correct = id === round.secretId;
  const statements = [turnStatement(db, round.id, { kind: "guess", text: card.title.slice(0, 300), answer: correct ? "correct" : "wrong" })];
  if (correct) {
    statements.push(finishStatement(db, round.id, true));
  } else {
    statements.push(db.prepare("UPDATE record_question_rounds SET board_json = ? WHERE id = ?")
      .bind(JSON.stringify({ ...round.board, down: [...round.board.down, id] }), round.id));
  }
  await db.batch(statements);
  return { correct, turnedDown: correct ? [] : [id], reveal: correct ? reveal(round) : null };
}

async function giveUp(db, player, body) {
  const round = await getRound(db, body.roundId, player);
  await db.batch([finishStatement(db, round.id, false)]);
  return { reveal: reveal(round) };
}

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(env, request);
    requireGameAccess(user);
    const db = requireDb(env);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Choose a valid action.", 400, "invalid_action");
    if (body.action === "new") return json(await createRound(db, user));
    if (body.action === "ask") return json(await ask(db, env, user, body));
    if (body.action === "guess") return json(await guess(db, user, body));
    if (body.action === "give-up") return json(await giveUp(db, user, body));
    throw new HttpError("Choose a valid action.", 400, "invalid_action");
  } catch (error) {
    return handleApiError(error);
  }
}
