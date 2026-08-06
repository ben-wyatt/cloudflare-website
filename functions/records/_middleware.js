import { getSessionUser, isRecordClubOwner } from "../_shared/auth.js";

const OWNER_ONLY_PATHS = new Set([
  "/records/game/",
  "/records/games/",
  "/records/match/",
  "/records/wrapped/",
]);

function normalizedPath(request) {
  const pathname = new URL(request.url).pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export async function onRequest(context) {
  if (!OWNER_ONLY_PATHS.has(normalizedPath(context.request))) {
    return context.next();
  }

  const user = await getSessionUser(context.env, context.request);
  if (isRecordClubOwner(user)) return context.next();

  return new Response("This Record Club feature is only available on this account.", {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "private, no-store",
    },
  });
}
