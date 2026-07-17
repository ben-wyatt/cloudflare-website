(() => {
  const elements = {
    loading: document.getElementById("records-loading"),
    auth: document.getElementById("records-auth"),
    app: document.getElementById("records-app"),
    authTitle: document.getElementById("auth-title"),
    authMessage: document.getElementById("auth-message"),
    loginForm: document.getElementById("login-form"),
    registerForm: document.getElementById("register-form"),
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
    for (const button of document.querySelectorAll("[data-auth-mode]")) {
      button.classList.toggle("is-active", button.dataset.authMode === mode);
    }
    const form = registering ? elements.registerForm : elements.loginForm;
    form.querySelector("input")?.focus();
  }

  function showAuth(message = "", isError = false) {
    state.user = null;
    state.items = [];
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.auth.hidden = false;
    setMessage(elements.authMessage, message, isError);
  }

  async function showApp(user) {
    state.user = user;
    elements.memberName.textContent = user.username;
    elements.gameLink.hidden = user.username.toLowerCase() !== "ben";
    elements.loading.hidden = true;
    elements.auth.hidden = true;
    elements.app.hidden = false;
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
    grip.textContent = "⠿";
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

  function renderList() {
    const nodes = state.items.map((album, index) => {
      const item = document.createElement("li");
      item.className = "ranked-item";
      item.dataset.spotifyId = album.spotifyId;

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
      copy.append(title, meta, reviewLabel, review);

      const actions = document.createElement("div");
      actions.className = "ranked-actions";
      actions.append(
        grabberButton(album, index, item),
        actionButton(`Remove ${album.name}`, "Remove", () => removeAlbum(index), "ranked-remove"),
      );

      item.append(albumImage(album, "ranked-cover"), copy, actions);
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
    state.items.push({ ...album, review: "" });
    markDirty();
    renderList();
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
      state.items = payload.items || [];
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

  for (const button of document.querySelectorAll("[data-auth-mode]")) {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  }
  elements.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth(elements.loginForm, "/api/auth/login");
  });
  elements.registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth(elements.registerForm, "/api/auth/register");
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
