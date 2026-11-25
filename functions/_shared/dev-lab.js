import { normalizeUsername } from "./auth.js";
import { HttpError } from "./http.js";

// The Record Club lab: new games and Wrapped slides that only the development account sees
// while they are tried out. The development group holds only seed lists, so the lab reads a
// real group's picks; LAB_GROUPS are the groups it may read, the first being the default.
export const LAB_USERNAME = "ben_dev";
export const LAB_ACCOUNT_GROUP = "development";
export const LAB_GROUPS = ["badabing", "development"];

export function isLabUser(user) {
  return normalizeUsername(user?.username) === LAB_USERNAME && user?.groupId === LAB_ACCOUNT_GROUP;
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
