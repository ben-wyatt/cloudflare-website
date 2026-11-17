(() => {
  const elements = {
    loading: document.getElementById("wrapped-loading"),
    gate: document.getElementById("wrapped-gate"),
    gateMessage: document.getElementById("wrapped-gate-message"),
    app: document.getElementById("wrapped-app"),
    memberName: document.getElementById("wrapped-member-name"),
    season: document.getElementById("wrapped-season"),
    editionStatus: document.getElementById("wrapped-edition-status"),
    metadata: document.getElementById("wrapped-metadata"),
    deck: document.getElementById("wrapped-deck"),
    deckBar: document.getElementById("wrapped-deck-bar"),
    stories: document.getElementById("wrapped-stories"),
  };
  if (!elements.loading) return;

  let slides = [];
  let slideIndex = readSlideFromHash();
  let deckButtons = null;
  let currentPayload = null;
  let enriching = false;

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, options = {}) {
    const request = { credentials: "same-origin", headers: {}, ...options };
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

  function joinNames(people) {
    const names = (people || []).map((item) => item.username).filter(Boolean);
    if (names.length < 2) return names[0] || "Someone";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }

  function plural(value, singular, pluralForm = `${singular}s`) {
    return `${value.toLocaleString()} ${value === 1 ? singular : pluralForm}`;
  }

  function formatDuration(durationMs) {
    const totalMinutes = Math.max(0, Math.round(Number(durationMs || 0) / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes} min`;
    return `${hours} hr${minutes ? ` ${minutes} min` : ""}`;
  }

  function releaseYear(record) {
    return String(record?.releaseDate || "").slice(0, 4);
  }

  function textParagraph(text, className = "") {
    const paragraph = document.createElement("p");
    paragraph.className = className;
    paragraph.textContent = text;
    return paragraph;
  }

  function recordList(records) {
    const unique = new Map();
    for (const record of records || []) {
      if (record?.spotifyId && !unique.has(record.spotifyId)) unique.set(record.spotifyId, record);
    }
    const list = document.createElement("ul");
    list.className = "wrapped-records";
    const hiddenList = document.createElement("ul");
    hiddenList.className = "wrapped-records";
    let index = 0;
    for (const record of unique.values()) {
      const item = document.createElement("li");
      item.className = "wrapped-record";
      const coverLink = document.createElement("a");
      coverLink.href = record.spotifyUrl;
      coverLink.target = "_blank";
      coverLink.rel = "noopener";
      coverLink.setAttribute("aria-label", `Open ${record.name} by ${record.artistName} in Spotify`);
      if (record.imageUrl) {
        const image = document.createElement("img");
        image.src = record.imageUrl;
        image.alt = `${record.name} album cover`;
        image.loading = "lazy";
        coverLink.append(image);
      } else {
        const placeholder = document.createElement("span");
        placeholder.className = "wrapped-record-placeholder";
        placeholder.textContent = "no cover";
        coverLink.append(placeholder);
      }

      const copy = document.createElement("div");
      copy.className = "wrapped-record-copy";
      const title = document.createElement("a");
      title.href = record.spotifyUrl;
      title.target = "_blank";
      title.rel = "noopener";
      title.textContent = record.name;
      const meta = document.createElement("span");
      const year = releaseYear(record);
      meta.textContent = `${record.artistName}${year ? ` · ${year}` : ""}`;
      copy.append(title, meta);
      if (record.caption) copy.append(textParagraph(record.caption, "wrapped-record-caption"));
      item.append(coverLink, copy);
      (index < 5 ? list : hiddenList).append(item);
      index += 1;
    }
    if (!hiddenList.children.length) return list;
    const fragment = document.createDocumentFragment();
    const more = document.createElement("details");
    more.className = "wrapped-more";
    const summary = document.createElement("summary");
    summary.textContent = `Show ${hiddenList.children.length} more records`;
    more.append(summary, hiddenList);
    fragment.append(list, more);
    return fragment;
  }

  function castTable(cast) {
    const table = document.createElement("table");
    table.className = "wrapped-cast";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Listener", "Records", "Tracks", "Notes"]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const listener of cast) {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = listener.username;
      row.append(name);
      for (const value of [listener.records, listener.tracks, listener.notes]) {
        const cell = document.createElement("td");
        cell.textContent = Number(value || 0).toLocaleString();
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    return table;
  }

  function buildStory({ title, lede, detail = "", records = [], notes = [], wordMap = [], links = [], status = "", cast = [] }) {
    const article = document.createElement("article");
    article.className = "wrapped-story";
    article.setAttribute("aria-roledescription", "slide");

    const copy = document.createElement("div");
    copy.className = "wrapped-story-copy";
    const heading = document.createElement("h2");
    heading.textContent = title;
    copy.append(heading);
    if (status) copy.append(textParagraph(status, "wrapped-story-status"));
    if (lede) copy.append(textParagraph(lede, "wrapped-story-lede"));
    if (detail) copy.append(textParagraph(detail, "wrapped-story-detail"));
    if (cast.length) copy.append(castTable(cast));
    if (records.length) copy.append(recordList(records));
    if (notes.length) {
      const noteList = document.createElement("div");
      noteList.className = "wrapped-note-excerpts";
      for (const note of notes) {
        const block = document.createElement("blockquote");
        const excerpt = document.createElement("p");
        excerpt.textContent = note.text;
        const footer = document.createElement("footer");
        const author = document.createElement("span");
        author.textContent = `— ${note.author} · `;
        const link = document.createElement("a");
        link.href = note.href;
        link.textContent = "Read in full →";
        footer.append(author, link);
        block.append(excerpt, footer);
        noteList.append(block);
      }
      copy.append(noteList);
    }
    if (wordMap.length) {
      const map = document.createElement("div");
      map.className = "wrapped-word-map";
      map.setAttribute("aria-label", "Repeated words in members’ notes");
      const maximum = Math.max(...wordMap.map((entry) => entry.count));
      for (const entry of wordMap) {
        const link = document.createElement("a");
        link.href = `/records/lists/?q=${encodeURIComponent(entry.word)}`;
        link.className = `wrapped-word wrapped-word-${Math.min(4, Math.ceil(entry.count / maximum * 4))}`;
        link.textContent = entry.word;
        link.setAttribute("aria-label", `${entry.word}, in ${entry.count} notes; find the notes`);
        map.append(link);
      }
      copy.append(map);
    }
    if (links.length) {
      const navigation = document.createElement("p");
      navigation.className = "wrapped-story-links";
      for (const item of links) {
        const link = document.createElement("a");
        link.href = item.href;
        link.textContent = item.label;
        if (item.external) {
          link.target = "_blank";
          link.rel = "noopener";
        }
        navigation.append(link);
      }
      copy.append(navigation);
    }
    article.append(copy);
    return article;
  }

  function readSlideFromHash() {
    const match = /^#story-(\d+)$/.exec(window.location.hash);
    return match ? Math.max(0, Number(match[1]) - 1) : 0;
  }

  function deckButton(label, text, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wrapped-deck-arrow";
    button.setAttribute("aria-label", label);
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  function buildDeckBar() {
    const previous = deckButton("Previous story", "←", () => showSlide(slideIndex - 1));
    const next = deckButton("Next story", "→", () => showSlide(slideIndex + 1));
    const count = document.createElement("span");
    count.className = "wrapped-deck-count";
    count.setAttribute("aria-live", "polite");
    const controls = document.createElement("div");
    controls.className = "wrapped-deck-controls";
    controls.append(previous, count, next);

    const progress = document.createElement("div");
    progress.className = "wrapped-deck-progress";
    const segments = slides.map((slide, index) => {
      const segment = document.createElement("button");
      segment.type = "button";
      segment.className = "wrapped-deck-segment";
      segment.setAttribute("aria-label", `Story ${index + 1}: ${slide.querySelector("h2")?.textContent || ""}`);
      segment.addEventListener("click", () => showSlide(index));
      progress.append(segment);
      return segment;
    });
    elements.deckBar.replaceChildren(progress, controls);
    elements.deckBar.hidden = false;
    deckButtons = { previous, next, count, segments };
  }

  function showSlide(index, { animate = true } = {}) {
    if (!slides.length) return;
    const target = Math.max(0, Math.min(slides.length - 1, index));
    const direction = target >= slideIndex ? "forward" : "back";
    const moved = target !== slideIndex;
    slideIndex = target;
    slides.forEach((slide, position) => {
      slide.hidden = position !== target;
      slide.classList.remove("is-entering-forward", "is-entering-back");
    });
    if (animate && moved) {
      void slides[target].offsetWidth;
      slides[target].classList.add(`is-entering-${direction}`);
    }
    deckButtons.count.textContent = `${target + 1} / ${slides.length}`;
    deckButtons.previous.disabled = target === 0;
    deckButtons.next.disabled = target === slides.length - 1;
    deckButtons.segments.forEach((segment, position) => {
      segment.classList.toggle("is-seen", position < target);
      segment.classList.toggle("is-current", position === target);
      if (position === target) segment.setAttribute("aria-current", "step");
      else segment.removeAttribute("aria-current");
    });
    try {
      history.replaceState(null, "", target ? `#story-${target + 1}` : window.location.pathname + window.location.search);
    } catch {
      // The deck still works when the URL cannot change.
    }
    if (moved && elements.deck.getBoundingClientRect().top < 0) {
      elements.deck.scrollIntoView({ block: "start" });
    }
  }

  function isTyping(target) {
    return target instanceof HTMLElement
      && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  function bindDeckGestures() {
    document.addEventListener("keydown", (event) => {
      if (!slides.length || elements.app.hidden) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTyping(event.target)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showSlide(slideIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showSlide(slideIndex - 1);
      }
    });
    let touchStart = null;
    elements.stories.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    elements.stories.addEventListener("touchend", (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      showSlide(slideIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  function renderStories(payload) {
    elements.stories.replaceChildren();
    const cards = payload.cards || [];
    if (!cards.length) {
      slides = [];
      elements.deckBar.hidden = true;
      const empty = document.createElement("section");
      empty.className = "wrapped-empty";
      const heading = document.createElement("h2");
      heading.textContent = "The sleeves are still blank.";
      empty.append(heading,
        textParagraph("Once this group saves a few album picks, the coincidences will start appearing here."));
      elements.stories.append(empty);
      return;
    }
    slides = cards.map((card) => buildStory(card));
    elements.stories.append(...slides);
    buildDeckBar();
    showSlide(slideIndex, { animate: false });
  }

  function renderMetadata(payload, message = "") {
    elements.metadata.classList.remove("is-error");
    elements.metadata.replaceChildren();
    if (message) {
      elements.metadata.textContent = message;
      return;
    }
    if (payload.snapshot) {
      elements.metadata.textContent = "This edition is sealed; its stories will no longer change.";
      return;
    }
    if (!payload.metadataPending) {
      elements.metadata.textContent = "Spotify track lengths and artist credits are filled in.";
      return;
    }
  }

  function renderPayload(payload) {
    currentPayload = payload;
    elements.season.textContent = payload.season;
    elements.editionStatus.textContent = payload.snapshot
      ? `Sealed edition · generated ${new Date(payload.generatedAt).toLocaleDateString()}`
      : payload.preparingSnapshot
        ? "Ballots are closed · preparing the sealed edition."
        : payload.seasonStatus === "locked"
          ? "Ballots are closed · final stories are taking shape."
          : "";
    renderStories(payload);
    renderMetadata(payload);
  }

  async function enrichBatch() {
    if (enriching || !currentPayload?.metadataPending || currentPayload.snapshot) return;
    enriching = true;
    renderMetadata(currentPayload);
    try {
      await api("/api/wrapped", { method: "POST", body: { action: "enrich" } });
      const payload = await api("/api/wrapped");
      renderPayload(payload);
    } catch (error) {
      elements.metadata.classList.add("is-error");
      renderMetadata(currentPayload, `The social stats are ready. Spotify details can wait: ${error.message}`);
      elements.metadata.classList.add("is-error");
    } finally {
      enriching = false;
    }
  }

  function showGate(message) {
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.gate.hidden = false;
    if (message) elements.gateMessage.textContent = message;
  }

  async function start() {
    try {
      const session = await api("/api/auth/me");
      if (!session.authenticated) {
        showGate();
        return;
      }
      elements.memberName.textContent = session.user.username;
      const payload = await api("/api/wrapped");
      elements.loading.hidden = true;
      elements.gate.hidden = true;
      elements.app.hidden = false;
      renderPayload(payload);
      if (payload.metadataPending && !payload.snapshot) void enrichBatch();
    } catch (error) {
      showGate(error.message);
    }
  }

  bindDeckGestures();
  void start();
})();
