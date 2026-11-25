(() => {
  // The games page lists preview games for the Record Club owners only.
  const previews = document.querySelectorAll("[data-owner-only]");
  if (!previews.length) return;
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then((response) => response.json())
    .then((session) => {
      if (!session?.user?.recordClubOwner) return;
      for (const item of previews) item.hidden = false;
    })
    .catch(() => {});
})();
