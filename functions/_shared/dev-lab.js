import { isRecordClubOwner } from "./auth.js";
import { HttpError } from "./http.js";

// The Record Club lab: new games and Wrapped slides that only the Record Club owners see
// while they are tried out. The owners are RECORD_CLUB_OWNER_USERNAMES in auth.js; add a
// username there to let someone in. The lab reads a real group's picks (the development
// group holds only seed lists); LAB_GROUPS are the groups it may read, the first the default.
export const LAB_GROUPS = ["badabing", "development"];

export function isLabUser(user) {
  return isRecordClubOwner(user);
}

export function requireLabUser(user) {
  if (!isLabUser(user)) throw new HttpError("This page is not available.", 404, "not_found");
}

// The group whose picks the lab reads: an allowed group name, else the default.
export function labGroup(value) {
  const groupId = String(value || "").trim().toLowerCase();
  return LAB_GROUPS.includes(groupId) ? groupId : LAB_GROUPS[0];
}

// A group named in ?group= that the lab account may view instead of its own, else null.
export function labViewGroup(value) {
  const groupId = String(value || "").trim().toLowerCase();
  return LAB_GROUPS.includes(groupId) ? groupId : null;
}
