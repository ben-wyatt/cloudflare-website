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
  let viewerId = "";
  let viewerName = "";
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

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function cover(record, className = "wrapped-cover") {
    const link = element("a", className);
    if (record.spotifyUrl) {
      link.href = record.spotifyUrl;
      link.target = "_blank";
      link.rel = "noopener";
    }
    link.setAttribute("aria-label", `Open ${record.name} by ${record.artistName} in Spotify`);
    if (record.imageUrl) {
      const image = document.createElement("img");
      image.src = record.imageUrl;
      image.alt = `${record.name} album cover`;
      image.loading = "lazy";
      link.append(image);
    } else {
      link.append(element("span", "wrapped-record-placeholder", "no cover"));
    }
    return link;
  }

  function recordCopy(record) {
    const copy = element("div", "wrapped-record-copy");
    const title = element("a", "wrapped-record-title", record.name);
    if (record.spotifyUrl) {
      title.href = record.spotifyUrl;
      title.target = "_blank";
      title.rel = "noopener";
    }
    const year = releaseYear(record);
    copy.append(title, element("span", "wrapped-record-meta", `${record.artistName}${year ? ` · ${year}` : ""}`));
    if (record.caption) copy.append(element("span", "wrapped-record-caption", record.caption));
    if (record.pickers?.length) {
      const pickers = element("ul", "wrapped-record-pickers");
      pickers.setAttribute("aria-label", "Picked by");
      for (const name of record.pickers) {
        pickers.append(element("li", name === viewerName ? "is-viewer" : "", name));
      }
      copy.append(pickers);
    }
    return copy;
  }

  function uniqueRecords(records) {
    const unique = new Map();
    for (const record of records || []) {
      if (record?.spotifyId && !unique.has(record.spotifyId)) unique.set(record.spotifyId, record);
    }
    return [...unique.values()];
  }

  // Few records get big covers; more records shrink into a grid, then a list.
  function recordLayout(count) {
    if (count === 1) return "feature";
    if (count === 2) return "pair";
    if (count <= 6) return "grid";
    return "list";
  }

  function recordBlock(records) {
    const layout = recordLayout(records.length);
    const list = element("ul", `wrapped-records wrapped-records-${layout}`);
    if (layout === "grid") {
      list.style.setProperty("--columns", String(records.length));
      list.style.setProperty("--tile", records.length <= 4 ? "12rem" : "8.5rem");
      list.style.setProperty("--phone-columns", String(records.length === 4 ? 2 : Math.min(records.length, 3)));
    }
    const hidden = element("ul", "wrapped-records wrapped-records-list");
    records.forEach((record, index) => {
      const item = element("li", "wrapped-record");
      item.append(cover(record), recordCopy(record));
      (layout === "list" && index >= 5 ? hidden : list).append(item);
    });
    if (!hidden.children.length) return list;
    const fragment = document.createDocumentFragment();
    const more = element("details", "wrapped-more");
    more.append(element("summary", "", `Show ${hidden.children.length} more records`), hidden);
    fragment.append(list, more);
    return fragment;
  }

  function meter(fill, highlight = false) {
    const bar = element("span", `wrapped-meter${highlight ? " is-highlight" : ""}`);
    bar.setAttribute("aria-hidden", "true");
    bar.style.setProperty("--fill", String(Math.max(0, Math.min(1, fill))));
    return bar;
  }

  function statBlock(stat) {
    const block = element("p", "wrapped-hero-stat");
    block.append(element("span", "wrapped-hero-value", String(stat.value)));
    if (stat.unit) block.append(element("span", "wrapped-hero-unit", stat.unit));
    return block;
  }

  function rankingBlock(ranking, selected = -1, onSelect = null) {
    const maximum = Math.max(...ranking.map((row) => Number(row.value) || 0)) || 1;
    const list = element("ol", "wrapped-ranking");
    ranking.forEach((row, index) => {
      const item = element("li", "wrapped-rank");
      if (row.highlight) item.classList.add("is-highlight");
      if (index === selected) item.classList.add("is-selected");
      const interactive = Boolean(row.view && onSelect);
      const line = element(interactive ? "button" : "div", "wrapped-rank-row");
      if (interactive) {
        line.type = "button";
        line.setAttribute("aria-pressed", String(index === selected));
        line.addEventListener("click", () => onSelect(index));
        item.classList.add("is-interactive");
      }
      line.append(element("span", "wrapped-rank-number", String(index + 1)));
      if (row.imageUrl) {
        const thumb = document.createElement("img");
        thumb.className = "wrapped-rank-thumb";
        thumb.src = row.imageUrl;
        thumb.alt = "";
        thumb.loading = "lazy";
        line.append(thumb);
      }
      const label = element("span", "wrapped-rank-label");
      label.append(element("span", "wrapped-rank-name", row.name));
      if (row.sub) label.append(element("span", "wrapped-rank-sub", row.sub));
      const value = element("span", "wrapped-rank-value");
      value.append(element("span", "wrapped-rank-display", row.display),
        meter((Number(row.value) || 0) / maximum, index === selected || row.highlight));
      line.append(label, value);
      item.append(line);
      list.append(item);
    });
    return list;
  }

  function mixBlock(mix) {
    const maximum = Math.max(...mix.flatMap((side) => side.genres.map((genre) => genre.share))) || 1;
    const block = element("div", "wrapped-mix");
    for (const side of mix) {
      const column = element("div", "wrapped-mix-side");
      column.append(element("p", "wrapped-mix-name", side.name));
      const list = element("ul", "wrapped-mix-genres");
      for (const genre of side.genres) {
        const item = element("li", genre.shared ? "is-shared" : "");
        item.append(element("span", "wrapped-mix-genre", genre.genre),
          element("span", "wrapped-mix-share", `${Math.round(genre.share * 100)}%`),
          meter(genre.share / maximum, genre.shared));
        list.append(item);
      }
      column.append(list);
      block.append(column);
    }
    return block;
  }

  function timelineBlock(timeline) {
    const start = Math.min(timeline.from, timeline.echo?.year ?? timeline.from);
    const span = Math.max(1, timeline.to - start);
    const at = (year) => `${((year - start) / span) * 100}%`;
    const block = element("div", "wrapped-timeline");
    block.setAttribute("aria-hidden", "true");
    const axis = element("div", "wrapped-timeline-axis");
    if (timeline.echo) {
      const before = element("span", "wrapped-timeline-span is-echo");
      before.style.left = at(timeline.echo.year);
      before.style.width = `calc(${at(timeline.from)} - ${at(timeline.echo.year)})`;
      axis.append(before);
    }
    const reach = element("span", "wrapped-timeline-span");
    reach.style.left = at(timeline.from);
    reach.style.width = `calc(${at(timeline.to)} - ${at(timeline.from)})`;
    axis.append(reach);
    const stacks = new Map();
    for (const point of timeline.points) {
      const level = stacks.get(point.year) || 0;
      stacks.set(point.year, level + 1);
      const dot = element("span", "wrapped-timeline-dot");
      dot.style.left = at(point.year);
      dot.style.setProperty("--level", String(Math.min(level, 4)));
      dot.title = `${point.name} · ${point.artistName} · ${point.year}`;
      axis.append(dot);
    }
    const ticks = [[timeline.from, ""], [timeline.to, ""]];
    if (timeline.echo) ticks.unshift([timeline.echo.year, "is-echo"]);
    ticks[0][1] += " is-start";
    ticks[ticks.length - 1][1] += " is-end";
    for (const [year, className] of ticks) {
      const tick = element("span", `wrapped-timeline-tick ${className}`.trim(), String(year));
      tick.style.left = at(year);
      axis.append(tick);
    }
    block.append(axis);
    return block;
  }

  function notesBlock(notes) {
    const list = element("div", "wrapped-note-excerpts");
    for (const note of notes) {
      const block = document.createElement("blockquote");
      const footer = document.createElement("footer");
      // The note is shown in full; the record name links to it on the lists page.
      footer.append(element("span", "", `— ${note.author}${note.about ? " · " : ""}`));
      if (note.about) {
        const link = element("a", "", note.about);
        link.href = note.href;
        footer.append(link);
      }
      block.append(element("p", "", note.text), footer);
      list.append(block);
    }
    return list;
  }

  // Word cloud: biggest words go in the middle, the rest spiral outward into free space.
  const measureCanvas = document.createElement("canvas");

  function layoutWordMap(map) {
    const width = map.clientWidth;
    if (!width || map.dataset.laidOutWidth === String(width)) return;
    map.dataset.laidOutWidth = String(width);
    const context = measureCanvas.getContext("2d");
    const family = getComputedStyle(map).fontFamily;
    const words = [...map.querySelectorAll(".wrapped-word")];
    const counts = words.map((word) => Number(word.dataset.count));
    const most = Math.max(...counts);
    const least = Math.min(...counts);
    const largest = Math.min(72, width / 5.5);
    const stretch = Math.max(1, Math.min(2, width / 320));
    const smallest = Math.max(14, Math.min(17, width / 26));
    const gap = Math.max(4, width / 120);
    const placed = [];
    const overlaps = (box) => placed.some((other) =>
      box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
    for (const word of words) {
      const share = most === least ? 1 : (Number(word.dataset.count) - least) / (most - least);
      const size = Math.round(smallest + (largest - smallest) * share);
      const weight = share >= 0.5 ? 700 : 400;
      context.font = `${weight} ${size}px ${family}`;
      const boxWidth = context.measureText(word.textContent).width + gap;
      const boxHeight = size * 1.05 + gap * 0.6;
      let box = null;
      for (let step = 0; step < 4000; step++) {
        const angle = step * 0.28;
        const radius = angle * Math.max(2, size / 14);
        const x = width / 2 + radius * Math.cos(angle) * stretch - boxWidth / 2;
        const y = radius * Math.sin(angle) - boxHeight / 2;
        if (x < 0 || x + boxWidth > width) continue;
        const candidate = { left: x, top: y, right: x + boxWidth, bottom: y + boxHeight };
        if (!overlaps(candidate)) {
          box = candidate;
          break;
        }
      }
      word.hidden = !box;
      if (!box) continue;
      placed.push(box);
      word.style.fontSize = `${size}px`;
      word.style.fontWeight = String(weight);
      word.dataset.tier = String(Math.min(4, Math.ceil(share * 4)) || 1);
      word.box = box;
    }
    const top = Math.min(...placed.map((box) => box.top));
    const bottom = Math.max(...placed.map((box) => box.bottom));
    for (const word of words) {
      if (!word.box) continue;
      word.style.left = `${word.box.left + gap / 2}px`;
      word.style.top = `${word.box.top - top + gap * 0.3}px`;
    }
    map.style.height = `${Math.ceil(bottom - top)}px`;
  }

  const wordMapObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => entries.forEach((entry) => layoutWordMap(entry.target)))
    : null;

  function wordMapBlock(wordMap) {
    const map = element("div", "wrapped-word-map");
    map.setAttribute("aria-label", "Repeated words in members’ notes");
    for (const entry of wordMap) {
      const link = element("a", "wrapped-word", entry.word);
      link.href = `/records/lists/?q=${encodeURIComponent(entry.word)}`;
      link.dataset.count = String(entry.count);
      link.title = `${entry.word} · ${entry.count} ${entry.count === 1 ? "note" : "notes"}`;
      link.setAttribute("aria-label", `${entry.word}, in ${entry.count} notes; find the notes`);
      map.append(link);
    }
    if (wordMapObserver) wordMapObserver.observe(map);
    else requestAnimationFrame(() => layoutWordMap(map));
    // Measure again once the web font is in, so boxes match the real glyphs.
    document.fonts?.ready.then(() => {
      delete map.dataset.laidOutWidth;
      layoutWordMap(map);
    });
    return map;
  }

  function linksBlock(links) {
    const navigation = element("p", "wrapped-story-links");
    for (const item of links) {
      const link = element("a", "", item.label);
      link.href = item.href;
      if (item.external) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      navigation.append(link);
    }
    return navigation;
  }

  const CAST_COLUMNS = [
    { key: "username", label: "Listener" },
    { key: "records", label: "Records" },
    { key: "tracks", label: "Tracks" },
    { key: "notes", label: "Notes" },
  ];

  function castTable(cast) {
    const table = document.createElement("table");
    table.className = "wrapped-cast";
    const maxima = Object.fromEntries(CAST_COLUMNS.slice(1).map(({ key }) =>
      [key, Math.max(1, ...cast.map((listener) => Number(listener[key] || 0)))]));
    let sortKey = "records";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const headers = CAST_COLUMNS.map(({ key, label }) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wrapped-cast-sort";
      button.textContent = label;
      button.addEventListener("click", () => {
        sortKey = key;
        table.classList.add("is-settled");
        render();
      });
      cell.append(button);
      headRow.append(cell);
      return { key, cell };
    });
    head.append(headRow);

    const rows = cast.map((listener) => {
      const row = document.createElement("tr");
      if (listener.userId && listener.userId === viewerId) row.classList.add("is-viewer");
      const name = document.createElement("th");
      name.scope = "row";
      const link = document.createElement("a");
      link.href = listener.userId ? `/records/lists/#member-${encodeURIComponent(listener.userId)}` : "/records/lists/";
      link.textContent = listener.username;
      name.append(link);
      row.append(name);
      for (const { key } of CAST_COLUMNS.slice(1)) {
        const value = Number(listener[key] || 0);
        const cell = document.createElement("td");
        cell.dataset.column = key;
        const figure = document.createElement("span");
        figure.className = "wrapped-cast-value";
        figure.textContent = value.toLocaleString();
        const meter = document.createElement("span");
        meter.className = "wrapped-meter";
        meter.setAttribute("aria-hidden", "true");
        meter.style.setProperty("--fill", String(value / maxima[key]));
        cell.append(figure, meter);
        row.append(cell);
      }
      return { listener, row };
    });
    const body = document.createElement("tbody");

    function render() {
      const sorted = [...rows].sort((a, b) => {
        if (sortKey === "username") return a.listener.username.localeCompare(b.listener.username, "en", { sensitivity: "base" });
        return Number(b.listener[sortKey] || 0) - Number(a.listener[sortKey] || 0)
          || a.listener.username.localeCompare(b.listener.username, "en", { sensitivity: "base" });
      });
      body.replaceChildren(...sorted.map(({ row }) => row));
      table.dataset.sort = sortKey;
      for (const { key, cell } of headers) {
        if (key === sortKey) cell.setAttribute("aria-sort", key === "username" ? "ascending" : "descending");
        else cell.removeAttribute("aria-sort");
      }
    }

    render();
    table.append(head, body);
    return table;
  }

  function defaultSelection(card) {
    return (card.ranking || []).findIndex((row) => row.highlight && row.view);
  }

  // A selected ranking row swaps its own view (stat, records, mix…) into the slide.
  function buildStory(card, selected = defaultSelection(card), onSelect = null) {
    const view = selected >= 0 ? card.ranking?.[selected]?.view || {} : {};
    const {
      id = "", title, lede, detail = "", records = [], notes = [], wordMap = [], links = [], status = "",
      cast = [], stat = null, ranking = [], mix = [], timeline = null, chips = [], fact = "",
    } = { ...card, ...view };
    const article = element("article", "wrapped-story");
    article.setAttribute("aria-roledescription", "slide");
    if (id) article.dataset.card = id;

    const head = element("header", "wrapped-story-head");
    head.append(element("h2", "", title));
    if (status) head.append(element("p", "wrapped-story-status", status));
    if (lede) head.append(element("p", "wrapped-story-lede", lede));
    if (detail) head.append(element("p", "wrapped-story-detail", detail));

    const main = element("div", "wrapped-story-main");
    if (stat) main.append(statBlock(stat));
    if (fact) main.append(element("p", "wrapped-fact", fact));
    if (timeline?.points?.length) main.append(timelineBlock(timeline));
    if (mix?.length) main.append(mixBlock(mix));
    if (chips?.length) {
      const list = element("ul", "wrapped-chips");
      for (const chip of chips) list.append(element("li", "", chip));
      main.append(list);
    }
    if (cast?.length) main.append(castTable(cast));
    if (wordMap?.length) main.append(wordMapBlock(wordMap));
    if (notes?.length) main.append(notesBlock(notes));
    if (ranking?.length) main.append(rankingBlock(ranking, selected, onSelect));
    if (links?.length) main.append(linksBlock(links));

    const unique = uniqueRecords(records);
    const layout = unique.length ? recordLayout(unique.length) : "";
    const body = element("div", "wrapped-story-body");
    body.append(main);
    if (layout === "feature" || layout === "pair") {
      const side = element("div", "wrapped-story-side");
      side.append(recordBlock(unique));
      body.append(side);
      body.classList.add("has-side");
    }
    article.append(head, body);
    if (layout === "grid" || layout === "list") article.append(recordBlock(unique));

    // Size each slide by how much it carries: sparse slides center and grow, dense ones tighten.
    const blocks = main.children.length;
    const heavy = (ranking?.length || 0) > 5 || unique.length > 6 || (notes?.length || 0) > 1
      || (cast?.length || 0) > 8;
    article.dataset.density = heavy ? "dense" : blocks <= 2 && unique.length <= 2 ? "sparse" : "standard";
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

  const FULLSCREEN_ICONS = {
    enter: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    exit: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  };

  function fullscreenSupported() {
    return Boolean(document.fullscreenEnabled && elements.deck.requestFullscreen);
  }

  function isDeckFullscreen() {
    return document.fullscreenElement === elements.deck;
  }

  function syncFullscreenButton() {
    const button = deckButtons?.fullscreen;
    if (!button) return;
    const active = isDeckFullscreen();
    button.innerHTML = active ? FULLSCREEN_ICONS.exit : FULLSCREEN_ICONS.enter;
    button.setAttribute("aria-label", active ? "Exit full screen" : "Full screen");
    button.setAttribute("aria-pressed", String(active));
  }

  async function toggleFullscreen() {
    try {
      if (isDeckFullscreen()) await document.exitFullscreen();
      else await elements.deck.requestFullscreen();
    } catch {
      // Some browsers refuse full screen; the deck still fills the viewport.
    }
  }

  function buildDeckBar() {
    const previous = deckButton("Previous story", "←", () => showSlide(slideIndex - 1));
    const next = deckButton("Next story", "→", () => showSlide(slideIndex + 1));
    const count = document.createElement("span");
    count.className = "wrapped-deck-count";
    count.setAttribute("aria-live", "polite");
    const middle = document.createElement("div");
    middle.className = "wrapped-deck-middle";
    middle.append(count);
    let fullscreen = null;
    if (fullscreenSupported()) {
      fullscreen = deckButton("Full screen", "", toggleFullscreen);
      fullscreen.classList.add("wrapped-deck-fullscreen");
      middle.append(fullscreen);
    }
    const controls = document.createElement("div");
    controls.className = "wrapped-deck-controls";
    controls.append(previous, middle, next);
    elements.deckBar.replaceChildren(controls);
    elements.deckBar.hidden = false;
    deckButtons = { previous, next, count, fullscreen };
    syncFullscreenButton();
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
    try {
      history.replaceState(null, "", target ? `#story-${target + 1}` : window.location.pathname + window.location.search);
    } catch {
      // The deck still works when the URL cannot change.
    }
    if (!moved) return;
    if (isDeckFullscreen()) elements.deck.scrollTop = 0;
    else if (Math.abs(elements.deck.getBoundingClientRect().top) > 1) {
      elements.deck.scrollIntoView({ block: "start" });
    }
  }

  function isTyping(target) {
    return target instanceof HTMLElement
      && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  function bindDeckGestures() {
    document.addEventListener("fullscreenchange", syncFullscreenButton);
    document.addEventListener("keydown", (event) => {
      if (!slides.length || elements.app.hidden) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTyping(event.target)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showSlide(slideIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showSlide(slideIndex - 1);
      } else if (event.key.toLowerCase() === "f" && fullscreenSupported()) {
        event.preventDefault();
        void toggleFullscreen();
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
    const buildSlide = (card, index, selected = defaultSelection(card)) => buildStory(card, selected, (choice) => {
      const scrollTop = window.scrollY;
      const deckScrollTop = elements.deck.scrollTop;
      const next = buildSlide(card, index, choice);
      next.classList.add("is-settled");
      next.hidden = slides[index].hidden;
      elements.stories.replaceChild(next, slides[index]);
      slides[index] = next;
      next.querySelectorAll(".wrapped-rank-row")[choice]?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollTop });
      elements.deck.scrollTop = deckScrollTop;
    });
    slides = cards.map((card, index) => buildSlide(card, index));
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
      viewerId = session.user.id;
      viewerName = session.user.username;
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
