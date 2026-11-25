import { getSessionUser, isRecordClubOwner } from "./auth.js";
import { HttpError } from "./http.js";

// Preview games and Wrapped slides that only the Record Club owners see while they are tried
// out (Guess the Record, Crates, Cover twins). The owners are RECORD_CLUB_OWNER_USERNAMES in
// auth.js; add a username there to let someone in. Previews read a real group's picks (the
// development group holds only seed lists); LAB_GROUPS are the groups they may read, the first
// being the default. A group can be named with ?group=.
export const LAB_GROUPS = ["badabing", "development"];

export function isLabUser(user) {
  return isRecordClubOwner(user);
}

export function requireLabUser(user) {
  if (!isLabUser(user)) throw new HttpError("This page is not available.", 404, "not_found");
}

// Pages middleware for a preview page: owners get the page, everyone else a plain 404.
export async function labPageGate(context) {
  const user = await getSessionUser(context.env, context.request);
  if (isLabUser(user)) return context.next();
  return new Response("Not found.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=UTF-8", "cache-control": "private, no-store" },
  });
}

// The group whose picks a preview reads: an allowed group name, else the default.
export function labGroup(value) {
  const groupId = String(value || "").trim().toLowerCase();
  return LAB_GROUPS.includes(groupId) ? groupId : LAB_GROUPS[0];
}

// A group named in ?group= that an owner may view instead of their own, else null.
export function labViewGroup(value) {
  const groupId = String(value || "").trim().toLowerCase();
  return LAB_GROUPS.includes(groupId) ? groupId : null;
}
