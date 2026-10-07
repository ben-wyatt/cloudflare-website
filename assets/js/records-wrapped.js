(() => {
  const elements = {
    loading: document.getElementById("wrapped-loading"),
    gate: document.getElementById("wrapped-gate"),
    gateMessage: document.getElementById("wrapped-gate-message"),
    app: document.getElementById("wrapped-app"),
    memberName: document.getElementById("wrapped-member-name"),
    groupName: document.getElementById("wrapped-group-name"),
    season: document.getElementById("wrapped-season"),
    editionStatus: document.getElementById("wrapped-edition-status"),
    ledger: document.getElementById("wrapped-ledger"),
    metadata: document.getElementById("wrapped-metadata"),
    cardControls: document.getElementById("wrapped-card-controls"),
    stories: document.getElementById("wrapped-stories"),
  };
  if (!elements.loading) return;

  let storyNumber = 0;
  let currentPayload = null;
  let enriching = false;
  let viewerId = "";
  const dismissalsInMemory = new Map();

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

  function addStory({ title, lede, detail = "", records = [] }, onDismiss) {
    storyNumber += 1;
    const article = document.createElement("article");
    article.className = "wrapped-story";
    const number = document.createElement("span");
    number.className = "wrapped-story-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = String(storyNumber).padStart(2, "0");

    const copy = document.createElement("div");
    copy.className = "wrapped-story-copy";
    const heading = document.createElement("h2");
    heading.textContent = title;
    copy.append(heading, textParagraph(lede, "wrapped-story-lede"));
    if (detail) copy.append(textParagraph(detail, "wrapped-story-detail"));
    if (records.length) copy.append(recordList(records));
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "wrapped-text-button wrapped-dismiss";
    dismiss.textContent = "Dismiss";
    dismiss.setAttribute("aria-label", `Dismiss ${title}`);
    dismiss.addEventListener("click", onDismiss);
    copy.append(dismiss);
    article.append(number, copy);
    elements.stories.append(article);
  }

  function renderLedger(room) {
    const values = [
      [room.contributorCount, "listeners"],
      [room.pickCount, "picks"],
      [room.uniqueAlbumCount, "different records"],
      [room.noteWordCount, "words in the margins"],
    ];
    elements.ledger.replaceChildren(...values.map(([value, label]) => {
      const wrapper = document.createElement("div");
      wrapper.className = "wrapped-stat";
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = Number(value || 0).toLocaleString();
      wrapper.append(term, description);
      return wrapper;
    }));
  }

  function dismissalKey(payload) {
    return `records-wrapped-dismissed-v2:${payload.group.id}:${payload.season}:${viewerId}`;
  }

  function readDismissed(payload) {
    const key = dismissalKey(payload);
    if (dismissalsInMemory.has(key)) return new Set(dismissalsInMemory.get(key));
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      const dismissed = new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : []);
      dismissalsInMemory.set(key, dismissed);
      return new Set(dismissed);
    } catch {
      return new Set();
    }
  }

  function saveDismissed(payload, dismissed) {
    dismissalsInMemory.set(dismissalKey(payload), new Set(dismissed));
    try {
      localStorage.setItem(dismissalKey(payload), JSON.stringify([...dismissed]));
    } catch {
      // Dismissal still works for this render when storage is unavailable.
    }
  }

  function renderStories(payload) {
    storyNumber = 0;
    elements.stories.replaceChildren();
    elements.cardControls.replaceChildren();
    const cards = payload.cards || [];
    if (!cards.length) {
      const empty = document.createElement("section");
      empty.className = "wrapped-empty";
      const heading = document.createElement("h2");
      heading.textContent = "The sleeves are still blank.";
      empty.append(heading,
        textParagraph("Once this group saves a few album picks, the coincidences will start appearing here."));
      elements.stories.append(empty);
      return;
    }
    const dismissed = readDismissed(payload);
    const availableIds = new Set(cards.map((card) => card.id));
    for (const id of dismissed) if (!availableIds.has(id)) dismissed.delete(id);
    if (dismissed.size) {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "wrapped-text-button";
      restore.textContent = `Restore dismissed cards (${dismissed.size})`;
      restore.addEventListener("click", () => {
        dismissed.clear();
        saveDismissed(payload, dismissed);
        renderStories(payload);
      });
      elements.cardControls.append(restore);
    }
    for (const card of cards) {
      if (dismissed.has(card.id)) continue;
      addStory(card, () => {
        dismissed.add(card.id);
        saveDismissed(payload, dismissed);
        renderStories(payload);
      });
    }
    if (!storyNumber) {
      const empty = textParagraph("All caught up. Restore dismissed cards to read them again.", "wrapped-empty");
      elements.stories.append(empty);
    }
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
    const text = document.createElement("span");
    text.textContent = `${plural(payload.metadataPending, "record")} still need full Spotify credits.`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Fill in two more";
    button.addEventListener("click", () => {
      void enrichBatch(false);
    });
    elements.metadata.append(text, button);
  }

  function renderPayload(payload) {
    currentPayload = payload;
    elements.groupName.textContent = payload.group.name;
    elements.season.textContent = payload.season;
    elements.editionStatus.textContent = payload.snapshot
      ? `Sealed edition · generated ${new Date(payload.generatedAt).toLocaleDateString()}`
      : payload.preparingSnapshot
        ? "Ballots are closed · preparing the sealed edition."
        : payload.seasonStatus === "locked"
          ? "Ballots are closed · final stories are taking shape."
          : "Live draft · these stories change as the group saves picks.";
    renderLedger(payload.room);
    renderStories(payload);
    renderMetadata(payload);
  }

  async function enrichBatch(automatic) {
    if (enriching || !currentPayload?.metadataPending || currentPayload.snapshot) return;
    enriching = true;
    renderMetadata(currentPayload, automatic
      ? "Quietly adding full Spotify credits for two records…"
      : "Adding full Spotify credits for two records…");
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
      viewerId = session.user.id;
      const payload = await api("/api/wrapped");
      elements.loading.hidden = true;
      elements.gate.hidden = true;
      elements.app.hidden = false;
      renderPayload(payload);
      if (payload.metadataPending && !payload.snapshot) void enrichBatch(true);
    } catch (error) {
      showGate(error.message);
    }
  }

  void start();
})();
