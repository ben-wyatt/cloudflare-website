import { getSessionUser, isRecordClubOwner } from "../../_shared/auth.js";
import { handleApiError, json } from "../../_shared/http.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getSessionUser(env, request);
    return json({
      authenticated: Boolean(user),
      user: user ? { ...user, recordClubOwner: isRecordClubOwner(user) } : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
