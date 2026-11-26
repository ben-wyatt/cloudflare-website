import { getSessionUser } from "../_shared/auth.js";
import { canPlayRecordGames, isAnyGroupReleased, opensAt } from "../_shared/record-access.js";
import { OPENING_PATH, withOpeningTime } from "../_shared/record-opening.js";

// Pages that open with RECORD_CLUB_OPENS_AT or the RECORD_CLUB_RELEASE flag. Wrapped and the
// lists also need the member to finish enough game rounds; their APIs check that, and the
// pages explain it.
const RELEASED_PATHS = new Set([
  "/records/game/",
  "/records/games/",
  "/records/match/",
  "/records/wrapped/",
  "/records/lists/",
  "/records/guess/",
  "/records/crates/",
  "/records/mixtapes/",
]);

function normalizedPath(request) {
  const pathname = new URL(request.url).pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function notOpen() {
  return new Response("The Record Club minigames are not open yet.", {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "private, no-store",
    },
  });
}

export async function onRequest(context) {
  const { env, request } = context;
  const path = normalizedPath(request);
  const now = Date.now();
  if (path === OPENING_PATH) {
    const page = await context.next();
    return page.ok ? withOpeningTime(page, env, now) : page;
  }
  if (!RELEASED_PATHS.has(path)) return context.next();

  const user = await getSessionUser(env, request);
  if (canPlayRecordGames(env, user, now)) return context.next();
  // Once any group is released, a signed-out visitor gets the page's own sign-in prompt.
  if (!user && isAnyGroupReleased(env, now)) return context.next();

  // Before the opening, everyone else sees the countdown in place of the page. After it, only
  // an account with no group can still land here.
  const opening = opensAt(env);
  if (!opening || now >= opening.getTime() || !env.ASSETS) return notOpen();
  const page = await env.ASSETS.fetch(new URL(OPENING_PATH, request.url));
  return page.ok ? withOpeningTime(page, env, now, 403) : notOpen();
}
