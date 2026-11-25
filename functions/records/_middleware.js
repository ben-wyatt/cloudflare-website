import { getSessionUser } from "../_shared/auth.js";
import { canPlayRecordGames, isAnyGroupReleased } from "../_shared/record-access.js";

// Pages that open with the RECORD_CLUB_RELEASE flag. Wrapped and the lists also need the
// member to finish enough game rounds; their APIs check that, and the pages explain it.
const RELEASED_PATHS = new Set([
  "/records/game/",
  "/records/games/",
  "/records/match/",
  "/records/wrapped/",
  "/records/lists/",
  "/records/guess/",
  "/records/crates/",
]);

function normalizedPath(request) {
  const pathname = new URL(request.url).pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export async function onRequest(context) {
  if (!RELEASED_PATHS.has(normalizedPath(context.request))) {
    return context.next();
  }

  const user = await getSessionUser(context.env, context.request);
  if (canPlayRecordGames(context.env, user)) return context.next();
  // Once any group is released, a signed-out visitor gets the page's own sign-in prompt.
  if (!user && isAnyGroupReleased(context.env)) return context.next();

  return new Response("The Record Club minigames are not open yet.", {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "private, no-store",
    },
  });
}
