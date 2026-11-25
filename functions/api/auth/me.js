import { getSessionUser, isRecordClubOwner } from "../../_shared/auth.js";
import { handleApiError, json } from "../../_shared/http.js";
import { canPlayRecordGames, getWrappedUnlock } from "../../_shared/record-access.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getSessionUser(env, request);
    if (!user) return json({ authenticated: false, user: null });

    const gamesOpen = canPlayRecordGames(env, user);
    return json({
      authenticated: true,
      user: {
        ...user,
        recordClubOwner: isRecordClubOwner(user),
        recordClub: {
          gamesOpen,
          wrappedUnlock: gamesOpen ? await getWrappedUnlock(env.DB, user) : null,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
