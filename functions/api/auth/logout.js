import { destroySession } from "../../_shared/auth.js";
import { assertSameOrigin, handleApiError, json } from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const cookie = await destroySession(env, request);
    return json({ ok: true }, 200, { "set-cookie": cookie });
  } catch (error) {
    return handleApiError(error);
  }
}
