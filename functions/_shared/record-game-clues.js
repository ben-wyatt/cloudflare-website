export function getListenerClueVisibility(userId, clueLevel, foundUserIds = new Set()) {
  const normalizedClueLevel = Number(clueLevel) || 0;
  const found = foundUserIds.has(userId);

  return {
    favoriteTracks: found || normalizedClueLevel >= 1,
    review: found || normalizedClueLevel >= 2,
  };
}
