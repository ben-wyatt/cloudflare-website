import {
  hashPassword,
  requireUser,
  verifyPassword,
} from "../../_shared/auth.js";
import {
  assertSameOrigin,
  handleApiError,
  HttpError,
  json,
  readJson,
  requireDb,
} from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(env, request);
    const db = requireDb(env);
    const body = await readJson(request);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");

    if (newPassword.length < 8 || newPassword.length > 200) {
      throw new HttpError("Use a password between 8 and 200 characters.", 400, "invalid_password");
    }

    const stored = await db.prepare(
      `SELECT password_hash, password_salt, password_iterations
       FROM record_users WHERE id = ?`,
    ).bind(user.id).first();
    const valid = stored && await verifyPassword(
      currentPassword,
      stored.password_hash,
      stored.password_salt,
      stored.password_iterations,
    );
    if (!valid) {
      throw new HttpError("The current password is incorrect.", 401, "invalid_current_password");
    }

    const password = await hashPassword(newPassword);
    await db.prepare(
      `UPDATE record_users
       SET password_hash = ?, password_salt = ?, password_iterations = ?
       WHERE id = ?`,
    ).bind(password.hash, password.salt, password.iterations, user.id).run();

    return json({ updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
