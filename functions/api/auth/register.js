import {
  createSession,
  hashPassword,
  normalizeUsername,
  validateUsername,
  verifyAccessCode,
} from "../../_shared/auth.js";
import {
  HttpError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireDb,
} from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const db = requireDb(env);
    if (!env.SIGNUP_ACCESS_CODE) {
      throw new HttpError("Account creation is not configured yet.", 503, "signup_not_configured");
    }

    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");

    if (!validateUsername(username)) {
      throw new HttpError("Use 3–24 letters, numbers, hyphens, or underscores.", 400, "invalid_username");
    }
    if (password.length < 8 || password.length > 200) {
      throw new HttpError("Use a password between 8 and 200 characters.", 400, "invalid_password");
    }
    if (!(await verifyAccessCode(body.accessCode, env.SIGNUP_ACCESS_CODE))) {
      throw new HttpError("That group access code is not correct.", 403, "invalid_access_code");
    }

    const memberLimit = Math.max(1, Math.min(Number(env.MAX_RECORD_MEMBERS || 25), 100));
    const count = await db.prepare("SELECT COUNT(*) AS count FROM record_users").first();
    if (Number(count?.count || 0) >= memberLimit) {
      throw new HttpError("The listening room is full. Ask Ben for help.", 403, "member_limit_reached");
    }

    const existing = await db.prepare("SELECT id FROM record_users WHERE username = ?").bind(username).first();
    if (existing) {
      throw new HttpError("That username is already taken.", 409, "username_taken");
    }

    const passwordData = await hashPassword(password);
    const userId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await db.prepare(
      `INSERT INTO record_users
        (id, username, password_hash, password_salt, password_iterations, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      userId,
      username,
      passwordData.hash,
      passwordData.salt,
      passwordData.iterations,
      createdAt,
    ).run();

    const cookie = await createSession(env, request, userId);
    return json({ user: { id: userId, username } }, 201, { "set-cookie": cookie });
  } catch (error) {
    return handleApiError(error);
  }
}
