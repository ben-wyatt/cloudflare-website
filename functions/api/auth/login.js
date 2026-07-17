import { createSession, normalizeUsername, verifyPassword } from "../../_shared/auth.js";
import { HttpError, assertSameOrigin, handleApiError, json, readJson, requireDb } from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const db = requireDb(env);
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    const user = await db.prepare(
      `SELECT id, username, password_hash, password_salt, password_iterations
       FROM record_users WHERE username = ?`,
    ).bind(username).first();

    const valid = user && await verifyPassword(
      password,
      user.password_hash,
      user.password_salt,
      user.password_iterations,
    );
    if (!valid) {
      throw new HttpError("The username or password is incorrect.", 401, "invalid_credentials");
    }

    const cookie = await createSession(env, request, user.id);
    return json({ user: { id: user.id, username: user.username } }, 200, { "set-cookie": cookie });
  } catch (error) {
    return handleApiError(error);
  }
}
