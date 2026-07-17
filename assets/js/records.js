(() => {
  const MAX_FAVORITE_TRACKS_PER_ALBUM = 50;

  const elements = {
    loading: document.getElementById("records-loading"),
    auth: document.getElementById("records-auth"),
    app: document.getElementById("records-app"),
    authTitle: document.getElementById("auth-title"),
    authMessage: document.getElementById("auth-message"),
    loginForm: document.getElementById("login-form"),
    registerForm: document.getElementById("register-form"),
    changePasswordButton: document.getElementById("change-password-button"),
    cancelPasswordButton: document.getElementById("cancel-password-button"),
    passwordPanel: document.getElementById("password-panel"),
    passwordForm: document.getElementById("password-form"),
    passwordMessage: document.getElementById("password-message"),
    memberName: document.getElementById("member-name"),
    gameLink: document.getElementById("record-game-link"),
    logoutButton: document.getElementById("logout-button"),
    searchForm: document.getElementById("album-search-form"),
    searchInput: document.getElementById("album-search"),
    searchMessage: document.getElementById("search-message"),
    results: document.getElementById("album-results"),
    rankedList: document.getElementById("ranked-list"),
    emptyList: document.getElementById("empty-list"),
    listCount: document.getElementById("list-count"),
    saveButton: document.getElementById("save-list-button"),
    saveStatus: document.getElementById("save-status"),
  };

  if (!elements.loading) return;

  const state = {
    user: null,
    items: [],
    results: [],
    dirty: false,
    searching: false,
    saving: false,
    dragging: null,
    trackLists: new Map(),
  };

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, options = {}) {
    const request = {
      credentials: "same-origin",
      headers: {},
      ...options,
    };
    if (options.body && typeof options.body !== "string") {
      request.headers = { "content-type": "application/json", ...options.headers };
      request.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, request);
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const error = payload?.error || {};
      throw new ApiError(error.message || "The request could not be completed.", response.status, error.code);
    }
    return payload;
  }

  function setMessage(element, message = "", isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  function setAuthMode(mode) {
    const registering = mode === "register";
    elements.authTitle.textContent = registering ? "Create an account" : "Sign in";
    elements.loginForm.hidden = registering;
    elements.registerForm.hidden = !registering;
    setMessage(elements.authMessage);
    const form = registering ? elements.registerForm : elements.loginForm;
    form.querySelector("input")?.focus();
  }

  function showAuth(message = "", isError = false) {
    state.user = null;
    state.items = [];
    state.trackLists.clear();
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.auth.hidden = false;
    setAuthMode("login");
    setMessage(elements.authMessage, message, isError);
  }

  async function showApp(user) {
    state.user = user;
    elements.memberName.textContent = user.username;
    elements.gameLink.hidden = user.username.toLowerCase() !== "ben";
    elements.loading.hidden = true;
    elements.auth.hidden = true;
    elements.app.hidden = false;
    elements.passwordPanel.hidden = true;
    elements.passwordForm.reset();
    setMessage(elements.passwordMessage);
    await loadList();
  }

  function albumImage(album, className = "") {
    const link = document.createElement("a");
    link.className = className;
    link.href = album.spotifyUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `Open ${album.name} by ${album.artistName} in Spotify`);

    if (album.imageUrl) {
      const image = document.createElement("img");
      image.src = album.imageUrl;
      image.alt = `${album.name} album cover`;
      image.loading = "lazy";
      link.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.textContent = "No cover";
      link.append(placeholder);
    }
    return link;
  }

  function albumCopy(album) {
    const wrapper = document.createElement("div");
    wrapper.className = "album-result-copy";
    const title = document.createElement("p");
    title.className = "album-title";
    title.textContent = album.name;
    const meta = document.createElement("p");
    meta.className = "album-meta";
    const year = album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : "";
    meta.textContent = `${album.artistName}${year}`;
    wrapper.append(title, meta);
    return wrapper;
  }

  function isSelected(spotifyId) {
    return state.items.some((item) => item.spotifyId === spotifyId);
  }

  function renderResults() {
    const nodes = state.results.map((album) => {
      const item = document.createElement("li");
      item.className = "album-result";
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "album-add-button";
      const selected = isSelected(album.spotifyId);
      addButton.disabled = selected || state.items.length >= 10;
      addButton.textContent = selected ? "Added" : "Add";
      addButton.setAttribute("aria-label", `Add ${album.name} to your list`);
      addButton.addEventListener("click", () => addAlbum(album));
      item.append(albumImage(album), albumCopy(album), addButton);
      return item;
    });
    elements.results.replaceChildren(...nodes);
  }

  function actionButton(label, text, onClick, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ranked-action ${className}`.trim();
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", onClick);
    return button;
  }

  function clearDropIndicators() {
    for (const item of elements.rankedList.querySelectorAll(".ranked-item")) {
      item.classList.remove("is-drop-before", "is-drop-after");
    }
  }

  function focusGrabber(spotifyId) {
    requestAnimationFrame(() => {
      const grabber = [...elements.rankedList.querySelectorAll(".ranked-grabber")]
        .find((button) => button.dataset.spotifyId === spotifyId);
      grabber?.focus();
    });
  }

  function reorderAlbum(sourceId, targetId, placeAfter) {
    const sourceIndex = state.items.findIndex((album) => album.spotifyId === sourceId);
    if (sourceIndex < 0 || sourceId === targetId) return;

    const [movedAlbum] = state.items.splice(sourceIndex, 1);
    const targetIndex = state.items.findIndex((album) => album.spotifyId === targetId);
    if (targetIndex < 0) {
      state.items.splice(sourceIndex, 0, movedAlbum);
      return;
    }

    state.items.splice(targetIndex + (placeAfter ? 1 : 0), 0, movedAlbum);
    markDirty();
    renderList();
    focusGrabber(sourceId);
  }

  function updatePointerDrag(event) {
    const dragging = state.dragging;
    if (!dragging || event.pointerId !== dragging.pointerId) return;

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".ranked-item");
    clearDropIndicators();
    if (!target || !elements.rankedList.contains(target)) {
      dragging.targetId = dragging.sourceId;
      return;
    }

    const targetId = target.dataset.spotifyId;
    if (!targetId || targetId === dragging.sourceId) {
      dragging.targetId = dragging.sourceId;
      return;
    }

    const bounds = target.getBoundingClientRect();
    dragging.targetId = targetId;
    dragging.placeAfter = event.clientY > bounds.top + bounds.height / 2;
    target.classList.add(dragging.placeAfter ? "is-drop-after" : "is-drop-before");
  }

  function finishPointerDrag(event, canceled = false) {
    const dragging = state.dragging;
    if (!dragging || event.pointerId !== dragging.pointerId) return;

    if (dragging.handle.hasPointerCapture?.(event.pointerId)) {
      dragging.handle.releasePointerCapture(event.pointerId);
    }
    dragging.item.classList.remove("is-dragging");
    elements.rankedList.classList.remove("is-reordering");
    clearDropIndicators();
    state.dragging = null;

    if (!canceled && dragging.targetId !== dragging.sourceId) {
      reorderAlbum(dragging.sourceId, dragging.targetId, dragging.placeAfter);
    }
  }

  function grabberButton(album, index, item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ranked-grabber";
    button.dataset.spotifyId = album.spotifyId;
    button.title = "Drag to reorder, or use the up and down arrow keys";
    button.setAttribute("aria-label", `Reorder ${album.name}. Drag, or use the up and down arrow keys.`);

    const grip = document.createElement("span");
    grip.className = "ranked-grip-dots";
    grip.setAttribute("aria-hidden", "true");
    grip.append(...Array.from({ length: 6 }, () => document.createElement("span")));
    button.append(grip);

    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      moveAlbum(index, event.key === "ArrowUp" ? -1 : 1, album.spotifyId);
    });

    button.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      button.focus();
      state.dragging = {
        pointerId: event.pointerId,
        sourceId: album.spotifyId,
        targetId: album.spotifyId,
        placeAfter: false,
        handle: button,
        item,
      };
      button.setPointerCapture?.(event.pointerId);
      item.classList.add("is-dragging");
      elements.rankedList.classList.add("is-reordering");
    });
    button.addEventListener("pointermove", updatePointerDrag);
    button.addEventListener("pointerup", (event) => finishPointerDrag(event));
    button.addEventListener("pointercancel", (event) => finishPointerDrag(event, true));

    return button;
  }

  function getTrackListState(spotifyId) {
    if (!state.trackLists.has(spotifyId)) {
      state.trackLists.set(spotifyId, { status: "idle", tracks: [], error: "", open: false });
    }
    return state.trackLists.get(spotifyId);
  }

  function formatTrackDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function favoriteIds(album) {
    if (!Array.isArray(album.favoriteTrackIds)) album.favoriteTrackIds = [];
    return album.favoriteTrackIds;
  }

  function updateTrackSummary(summary, album) {
    const count = favoriteIds(album).length;
    summary.querySelector(".ranked-tracks-heart").textContent = count ? "♥" : "♡";
    summary.querySelector(".ranked-tracks-count").textContent = count ? ` · ${count}` : "";
    summary.setAttribute(
      "aria-label",
      `${count ? `${count} favorite track${count === 1 ? "" : "s"}. ` : ""}Choose favorite tracks from ${album.name}`,
    );
  }

  function setTrackHeartState(button, track, selected) {
    button.classList.toggle("is-favorite", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute(
      "aria-label",
      selected ? `Remove ${track.name} from favorite tracks` : `Add ${track.name} to favorite tracks`,
    );
    button.querySelector("span").textContent = selected ? "♥" : "♡";
  }

  function toggleFavoriteTrack(albumId, track, button, summary) {
    const album = state.items.find((item) => item.spotifyId === albumId);
    if (!album) return;

    const selectedIds = favoriteIds(album);
    const selected = selectedIds.includes(track.spotifyId);
    if (!selected && selectedIds.length >= MAX_FAVORITE_TRACKS_PER_ALBUM) {
      setMessage(
        elements.saveStatus,
        `Choose up to ${MAX_FAVORITE_TRACKS_PER_ALBUM} favorite tracks per album.`,
        true,
      );
      return;
    }
    album.favoriteTrackIds = selected
      ? selectedIds.filter((trackId) => trackId !== track.spotifyId)
      : [...selectedIds, track.spotifyId];
    setTrackHeartState(button, track, !selected);
    updateTrackSummary(summary, album);
    markDirty();
  }

  function renderTrackListBody(album, body, summary) {
    const trackList = getTrackListState(album.spotifyId);
    if (trackList.status === "idle") {
      const message = document.createElement("p");
      message.className = "ranked-tracks-message";
      message.textContent = "Open to load this album’s track list.";
      body.replaceChildren(message);
      return;
    }
    if (trackList.status === "loading") {
      const message = document.createElement("p");
      message.className = "ranked-tracks-message";
      message.setAttribute("role", "status");
      message.textContent = "Loading tracks from Spotify…";
      body.replaceChildren(message);
      return;
    }
    if (trackList.status === "error") {
      const message = document.createElement("p");
      message.className = "ranked-tracks-message is-error";
      message.textContent = trackList.error;
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "ranked-tracks-retry";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => {
        void loadAlbumTracks(album.spotifyId);
      });
      body.replaceChildren(message, retry);
      return;
    }
    if (!trackList.tracks.length) {
      const message = document.createElement("p");
      message.className = "ranked-tracks-message";
      message.textContent = "Spotify did not return any tracks for this album.";
      body.replaceChildren(message);
      return;
    }

    const list = document.createElement("ol");
    list.className = "track-list";
    const selectedIds = new Set(favoriteIds(album));
    for (const track of trackList.tracks) {
      const item = document.createElement("li");
      item.className = "track-row";

      const heart = document.createElement("button");
      heart.type = "button";
      heart.className = "track-heart";
      const heartGlyph = document.createElement("span");
      heartGlyph.setAttribute("aria-hidden", "true");
      heart.append(heartGlyph);
      setTrackHeartState(heart, track, selectedIds.has(track.spotifyId));
      heart.addEventListener("click", () => {
        toggleFavoriteTrack(album.spotifyId, track, heart, summary);
      });

      const number = document.createElement("span");
      number.className = "track-number";
      number.textContent = track.discNumber > 1
        ? `${track.discNumber}.${track.trackNumber}`
        : String(track.trackNumber).padStart(2, "0");

      const copy = document.createElement("div");
      copy.className = "track-copy";
      const link = document.createElement("a");
      link.className = "track-link";
      link.href = track.spotifyUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = track.name;
      const meta = document.createElement("span");
      meta.className = "track-meta";
      meta.textContent = `${track.artistName}${track.explicit ? " · explicit" : ""}`;
      copy.append(link, meta);

      const duration = document.createElement("span");
      duration.className = "track-duration";
      duration.textContent = formatTrackDuration(track.durationMs);
      item.append(heart, number, copy, duration);
      list.append(item);
    }

    const source = document.createElement("a");
    source.className = "ranked-tracks-source";
    source.href = album.spotifyUrl;
    source.target = "_blank";
    source.rel = "noopener";
    source.textContent = "Track data via Spotify";
    body.replaceChildren(list, source);
  }

  async function loadAlbumTracks(albumId) {
    const trackList = getTrackListState(albumId);
    if (trackList.status === "loading" || trackList.status === "ready") return;
    trackList.status = "loading";
    trackList.error = "";

    const album = state.items.find((item) => item.spotifyId === albumId);
    const row = [...elements.rankedList.children].find((item) => item.dataset.spotifyId === albumId);
    const body = row?.querySelector(".ranked-tracks-body");
    const summary = row?.querySelector(".ranked-tracks-summary");
    if (album && body && summary) renderTrackListBody(album, body, summary);

    try {
      const payload = await api(`/api/spotify/tracks?album=${encodeURIComponent(albumId)}`);
      trackList.tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
      trackList.status = "ready";
    } catch (error) {
      trackList.status = "error";
      trackList.error = error.message;
    }

    const currentAlbum = state.items.find((item) => item.spotifyId === albumId);
    const currentRow = [...elements.rankedList.children].find((item) => item.dataset.spotifyId === albumId);
    const currentBody = currentRow?.querySelector(".ranked-tracks-body");
    const currentSummary = currentRow?.querySelector(".ranked-tracks-summary");
    if (currentAlbum && currentBody && currentSummary) {
      renderTrackListBody(currentAlbum, currentBody, currentSummary);
    }
  }

  function trackPicker(album) {
    const trackList = getTrackListState(album.spotifyId);
    const details = document.createElement("details");
    details.className = "ranked-tracks";
    details.open = trackList.open;

    const summary = document.createElement("summary");
    summary.className = "ranked-tracks-summary";
    const heart = document.createElement("span");
    heart.className = "ranked-tracks-heart";
    heart.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = "favorite tracks";
    const count = document.createElement("span");
    count.className = "ranked-tracks-count";
    summary.append(heart, label, count);
    updateTrackSummary(summary, album);

    const body = document.createElement("div");
    body.className = "ranked-tracks-body";
    renderTrackListBody(album, body, summary);
    details.append(summary, body);
    details.addEventListener("toggle", () => {
      trackList.open = details.open;
      if (details.open && trackList.status === "idle") {
        void loadAlbumTracks(album.spotifyId);
      }
    });
    return details;
  }

  function renderList() {
    const nodes = state.items.map((album, index) => {
      const item = document.createElement("li");
      item.className = "ranked-item";
      item.dataset.spotifyId = album.spotifyId;

      const rank = document.createElement("div");
      rank.className = "ranked-rank";
      const number = document.createElement("span");
      number.className = "ranked-number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1).padStart(2, "0");
      rank.append(number, grabberButton(album, index, item));

      const copy = document.createElement("div");
      copy.className = "ranked-copy";
      const title = document.createElement("p");
      title.className = "album-title";
      title.textContent = album.name;
      const meta = document.createElement("p");
      meta.className = "album-meta";
      meta.textContent = album.artistName;
      const reviewLabel = document.createElement("label");
      reviewLabel.className = "sr-only";
      reviewLabel.htmlFor = `review-${album.spotifyId}`;
      reviewLabel.textContent = `Short review for ${album.name}`;
      const review = document.createElement("textarea");
      review.id = `review-${album.spotifyId}`;
      review.className = "ranked-review";
      review.maxLength = 500;
      review.placeholder = "A few words about this record…";
      review.value = album.review || "";
      review.addEventListener("input", () => {
        state.items[index].review = review.value;
        markDirty();
      });
      copy.append(title, meta, reviewLabel, review, trackPicker(album));

      const actions = document.createElement("div");
      actions.className = "ranked-actions";
      actions.append(
        actionButton(`Remove ${album.name}`, "×", () => removeAlbum(index), "ranked-remove"),
      );

      item.append(rank, albumImage(album, "ranked-cover"), copy, actions);
      return item;
    });

    elements.rankedList.replaceChildren(...nodes);
    elements.emptyList.hidden = state.items.length > 0;
    elements.listCount.textContent = `${state.items.length} / 10`;
    elements.saveButton.disabled = state.saving || !state.dirty;
    renderResults();
  }

  function markDirty() {
    state.dirty = true;
    elements.saveButton.disabled = state.saving;
    setMessage(elements.saveStatus, "Unsaved changes");
  }

  function addAlbum(album) {
    if (state.items.length >= 10 || isSelected(album.spotifyId)) return;
    state.items.push({ ...album, review: "", favoriteTrackIds: [] });
    markDirty();
    renderList();
    void loadAlbumTracks(album.spotifyId);
  }

  function removeAlbum(index) {
    state.items.splice(index, 1);
    markDirty();
    renderList();
  }

  function moveAlbum(index, direction, focusId = "") {
    const destination = index + direction;
    if (destination < 0 || destination >= state.items.length) return;
    [state.items[index], state.items[destination]] = [state.items[destination], state.items[index]];
    markDirty();
    renderList();
    if (focusId) focusGrabber(focusId);
  }

  async function loadList() {
    elements.saveButton.disabled = true;
    setMessage(elements.saveStatus, "Loading…");
    try {
      const payload = await api("/api/list");
      state.items = (payload.items || []).map((item) => ({
        ...item,
        favoriteTrackIds: Array.isArray(item.favoriteTrackIds) ? item.favoriteTrackIds : [],
      }));
      state.dirty = false;
      setMessage(elements.saveStatus, state.items.length ? "Draft loaded" : "");
      renderList();
    } catch (error) {
      setMessage(elements.saveStatus, error.message, true);
    }
  }

  async function saveList() {
    if (state.saving) return;
    state.saving = true;
    elements.saveButton.disabled = true;
    setMessage(elements.saveStatus, "Saving…");
    try {
      await api("/api/list", {
        method: "PUT",
        body: {
          items: state.items.map((item) => ({
            spotifyId: item.spotifyId,
            review: item.review || "",
            favoriteTrackIds: favoriteIds(item),
          })),
        },
      });
      state.dirty = false;
      setMessage(elements.saveStatus, "Draft saved");
    } catch (error) {
      setMessage(elements.saveStatus, error.message, true);
    } finally {
      state.saving = false;
      elements.saveButton.disabled = !state.dirty;
    }
  }

  async function searchAlbums() {
    const query = elements.searchInput.value.trim();
    if (!query || state.searching) return;
    state.searching = true;
    state.results = [];
    renderResults();
    setMessage(elements.searchMessage, "Searching Spotify…");
    const submitButton = elements.searchForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      const payload = await api(`/api/spotify/search?q=${encodeURIComponent(query)}`);
      state.results = payload.albums || [];
      setMessage(
        elements.searchMessage,
        state.results.length ? `${state.results.length} result${state.results.length === 1 ? "" : "s"}` : "No albums found. Try the artist name or paste a Spotify link.",
      );
      renderResults();
    } catch (error) {
      setMessage(elements.searchMessage, error.message, true);
    } finally {
      state.searching = false;
      submitButton.disabled = false;
    }
  }

  async function submitAuth(form, path) {
    const button = form.querySelector("button[type='submit']");
    const data = Object.fromEntries(new FormData(form));
    button.disabled = true;
    setMessage(elements.authMessage, path.endsWith("register") ? "Creating your account…" : "Signing in…");
    try {
      const payload = await api(path, { method: "POST", body: data });
      form.reset();
      await showApp(payload.user);
    } catch (error) {
      setMessage(elements.authMessage, error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  elements.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth(elements.loginForm, "/api/auth/login");
  });
  elements.registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth(elements.registerForm, "/api/auth/register");
  });
  for (const button of document.querySelectorAll("[data-auth-mode]")) {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  }
  elements.changePasswordButton.addEventListener("click", () => {
    elements.passwordPanel.hidden = false;
    elements.passwordForm.querySelector("input")?.focus();
  });
  elements.cancelPasswordButton.addEventListener("click", () => {
    elements.passwordPanel.hidden = true;
    elements.passwordForm.reset();
    setMessage(elements.passwordMessage);
  });
  elements.passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = elements.passwordForm.querySelector("button[type='submit']");
    const data = Object.fromEntries(new FormData(elements.passwordForm));
    if (data.newPassword !== data.confirmPassword) {
      setMessage(elements.passwordMessage, "The new passwords do not match.", true);
      return;
    }
    button.disabled = true;
    setMessage(elements.passwordMessage, "Updating password…");
    try {
      await api("/api/auth/password", { method: "POST", body: data });
      elements.passwordForm.reset();
      setMessage(elements.passwordMessage, "Password updated.");
    } catch (error) {
      setMessage(elements.passwordMessage, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  elements.logoutButton.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      state.dirty = false;
      showAuth();
    }
  });
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchAlbums();
  });
  elements.saveButton.addEventListener("click", saveList);
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  api("/api/auth/me")
    .then((payload) => payload.authenticated ? showApp(payload.user) : showAuth())
    .catch((error) => showAuth(error.message, true));
})();
