import { getSessionUser, isRecordClubOwner } from "../../_shared/auth.js";
import { handleApiError, json } from "../../_shared/http.js";
import { canPlayRecordGames, getWrappedUnlock, opensAt } from "../../_shared/record-access.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getSessionUser(env, request);
    if (!user) return json({ authenticated: false, user: null });

    const gamesOpen = canPlayRecordGames(env, user);
    // While the games are closed, when they open (for the ballot page's countdown link).
    const opening = opensAt(env);
    const upcoming = !gamesOpen && opening && Date.now() < opening.getTime() ? opening.toISOString() : null;
    return json({
      authenticated: true,
      user: {
        ...user,
        recordClubOwner: isRecordClubOwner(user),
        recordClub: {
          gamesOpen,
          opensAt: upcoming,
          wrappedUnlock: gamesOpen ? await getWrappedUnlock(env.DB, user) : null,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
