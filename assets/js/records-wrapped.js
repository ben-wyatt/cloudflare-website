(() => {
  const elements = {
    loading: document.getElementById("wrapped-loading"),
    gate: document.getElementById("wrapped-gate"),
    gateMessage: document.getElementById("wrapped-gate-message"),
    gateTitle: document.getElementById("wrapped-gate-title"),
    gateLink: document.getElementById("wrapped-gate-link"),
    lock: document.getElementById("wrapped-lock"),
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
  // Album details arrive once, in payload.albums; slides refer to them by id.
  let albumsById = {};
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

  // Few records get big covers; more records shrink into a grid (two rows of up to six),
  // and only a long run falls back to a list.
  function recordLayout(count) {
    if (count === 1) return "feature";
    if (count === 2) return "pair";
    if (count <= 12) return "grid";
    return "list";
  }

  function recordBlock(records) {
    const layout = recordLayout(records.length);
    const list = element("ul", `wrapped-records wrapped-records-${layout}`);
    if (layout === "grid") {
      const columns = records.length <= 6 ? records.length : Math.ceil(records.length / 2);
      list.style.setProperty("--columns", String(columns));
      list.style.setProperty("--tile", records.length <= 4 ? "12rem" : records.length <= 6 ? "8.5rem" : "7.5rem");
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

  const isViewer = (people) => Boolean(viewerName) && (people || []).includes(viewerName);

  // Where a value sits on an axis, from 0 (left) to 1 (right).
  function axisPosition(axis, value) {
    const number = Number(value) || 0;
    const position = axis.scale === "log"
      ? (Math.log10(Math.max(number, axis.min)) - Math.log10(axis.min)) / (Math.log10(axis.max) - Math.log10(axis.min))
      : (number - axis.min) / ((axis.max - axis.min) || 1);
    return Math.max(0, Math.min(1, position));
  }

  function axisTicks(axis, className) {
    const row = element("div", className);
    row.setAttribute("aria-hidden", "true");
    for (const tick of axis.ticks || []) {
      const label = element("span", "wrapped-axis-tick", tick.label);
      const position = axisPosition(axis, tick.value);
      label.style.left = `${position * 100}%`;
      if (position <= 0) label.classList.add("is-start");
      if (position >= 1) label.classList.add("is-end");
      row.append(label);
    }
    return row;
  }

  // With an axis, each row's value is a dot on one shared scale instead of a bar.
  function rankingBlock(ranking, selected = -1, onSelect = null, { axis = null, unranked = false } = {}) {
    const maximum = Math.max(...ranking.map((row) => Number(row.value) || 0)) || 1;
    const list = element("ol", `wrapped-ranking${axis ? " has-axis" : ""}${unranked ? " is-unranked" : ""}`);
    ranking.forEach((row, index) => {
      const item = element("li", "wrapped-rank");
      if (row.highlight) item.classList.add("is-highlight");
      if (index === selected) item.classList.add("is-selected");
      if (isViewer(row.people)) item.classList.add("is-viewer");
      const interactive = Boolean(row.view && onSelect);
      const line = element(interactive ? "button" : "div", "wrapped-rank-row");
      if (interactive) {
        line.type = "button";
        line.setAttribute("aria-pressed", String(index === selected));
        line.addEventListener("click", () => onSelect(index));
        item.classList.add("is-interactive");
      }
      line.append(element("span", "wrapped-rank-number", unranked ? "" : String(index + 1)));
      if (row.imageUrl) {
        const thumb = document.createElement("img");
        thumb.className = "wrapped-rank-thumb";
        thumb.src = row.imageUrl;
        thumb.alt = "";
        thumb.loading = "lazy";
        line.append(thumb);
      }
      const label = element("span", "wrapped-rank-label");
      const name = element("span", "wrapped-rank-name", row.name);
      if (isViewer(row.people)) name.append(" ", element("span", "wrapped-you", "you"));
      label.append(name);
      if (row.sub) label.append(element("span", "wrapped-rank-sub", row.sub));
      line.append(label);
      if (axis) {
        const track = element("span", "wrapped-rank-track");
        track.setAttribute("aria-hidden", "true");
        const dot = element("span", "wrapped-rank-dot");
        dot.style.left = `${axisPosition(axis, row.value) * 100}%`;
        track.append(dot);
        line.append(track, element("span", "wrapped-rank-display", row.display));
      } else {
        const value = element("span", "wrapped-rank-value");
        value.append(element("span", "wrapped-rank-display", row.display),
          meter((Number(row.value) || 0) / maximum, index === selected || row.highlight));
        line.append(value);
      }
      item.append(line);
      list.append(item);
    });
    if (!axis) return list;
    // Each row prints its own value, so the shared scale needs no tick labels.
    const block = element("div", "wrapped-ranking-block");
    block.append(list);
    return block;
  }

  // Strip: every item as a dot on one axis. Dots that would overlap stack upward, so the
  // stacks also show where items bunch up. Hover, focus or tap a dot to read it.
  const DOT_STEP = 12;

  function layoutStrip(plot) {
    const width = plot.clientWidth;
    if (!width || plot.dataset.laidOutWidth === String(width)) return;
    plot.dataset.laidOutWidth = String(width);
    const dots = [...plot.querySelectorAll(".wrapped-strip-dot")]
      .map((dot) => ({ dot, x: Number(dot.dataset.position) * width }))
      .sort((a, b) => a.x - b.x);
    const levels = [];
    let tallest = 0;
    for (const entry of dots) {
      let level = 0;
      while (levels[level] !== undefined && entry.x - levels[level] < DOT_STEP - 1) level += 1;
      levels[level] = entry.x;
      tallest = Math.max(tallest, level);
      entry.dot.style.bottom = `${level * DOT_STEP}px`;
    }
    plot.style.height = `${(tallest + 1) * DOT_STEP + 4}px`;
  }

  const stripObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => entries.forEach((entry) => layoutStrip(entry.target)))
    : null;

  function stripCaption(point) {
    const people = point.people?.length ? ` · ${point.people.join(", ")}` : "";
    return `${point.label} — ${point.display}${point.kind === "pairs" ? "" : people}`;
  }

  // A small label that floats over a chart next to the dot or pin being read.
  function chartTip(frame) {
    const tip = element("p", "wrapped-chart-tip");
    tip.setAttribute("role", "status");
    tip.hidden = true;
    frame.append(tip);
    return {
      show(target, text) {
        tip.textContent = text;
        tip.hidden = false;
        const box = frame.getBoundingClientRect();
        const spot = target.getBoundingClientRect();
        const x = spot.left + spot.width / 2 - box.left;
        tip.style.left = `${x}px`;
        tip.style.top = `${spot.top - box.top}px`;
        tip.dataset.edge = x < box.width * 0.2 ? "start" : x > box.width * 0.8 ? "end" : "middle";
      },
      hide() {
        tip.hidden = true;
      },
    };
  }

  function stripBlock(strip, selected = -1, onSelect = null) {
    const block = element("div", "wrapped-strip");
    const plot = element("div", "wrapped-strip-plot");
    const tip = chartTip(plot);
    let selectedDot = null;
    strip.points.forEach((point, index) => {
      const dot = element("button", "wrapped-strip-dot");
      dot.type = "button";
      dot.dataset.position = String(axisPosition(strip.axis, point.value));
      dot.style.left = `${Number(dot.dataset.position) * 100}%`;
      if (point.highlight) dot.classList.add("is-highlight");
      if (isViewer(point.people)) dot.classList.add("is-viewer");
      if (index === selected) {
        dot.classList.add("is-selected");
        selectedDot = dot;
      }
      const text = stripCaption({ ...point, kind: strip.you });
      dot.setAttribute("aria-label", text);
      dot.setAttribute("aria-pressed", String(index === selected));
      const show = () => tip.show(dot, text);
      const rest = () => (selectedDot ? tip.show(selectedDot, selectedDot.getAttribute("aria-label")) : tip.hide());
      dot.addEventListener("mouseenter", show);
      dot.addEventListener("focus", show);
      dot.addEventListener("mouseleave", rest);
      dot.addEventListener("blur", rest);
      if (onSelect && point.view) dot.addEventListener("click", () => onSelect(index));
      plot.append(dot);
    });
    if (stripObserver) stripObserver.observe(plot);
    else requestAnimationFrame(() => layoutStrip(plot));
    // A picked dot keeps its label once the dots have their places.
    if (selectedDot) requestAnimationFrame(() => requestAnimationFrame(() =>
      tip.show(selectedDot, selectedDot.getAttribute("aria-label"))));
    const axis = element("div", "wrapped-strip-axis");
    axis.append(axisTicks(strip.axis, "wrapped-strip-ticks"));
    block.append(plot, axis);
    if (strip.lowLabel || strip.highLabel) {
      const ends = element("p", "wrapped-strip-ends");
      ends.append(element("span", "", `← ${strip.lowLabel || ""}`), element("span", "", `${strip.highLabel || ""} →`));
      block.append(ends);
    }
    return block;
  }

  // World map: the outline is a mask so it takes the theme's colour; pins sit on top in the
  // same coordinates (Equal Earth, made by the server). A focused listener lights up their pins.
  function mapBlock(map, focus = "") {
    const block = element("div", "wrapped-map-block");
    const frame = element("div", "wrapped-map");
    frame.style.setProperty("--map-ratio", `${map.width} / ${map.height}`);
    frame.style.setProperty("--map-mask", `url("${map.src}")`);
    const tip = chartTip(frame);
    const entries = [];
    // Bigger pins first, so small ones stay visible on top.
    for (const pin of [...map.pins].sort((a, b) => b.artists.length - a.artists.length)) {
      const dot = element("button", `wrapped-map-pin${pin.country ? " is-country" : ""}`);
      dot.type = "button";
      dot.style.left = `${(pin.x / map.width) * 100}%`;
      dot.style.top = `${(pin.y / map.height) * 100}%`;
      dot.style.setProperty("--size", `${Math.min(18, 8 + 3 * Math.sqrt(pin.artists.length - 1))}px`);
      if (focus) dot.classList.add(pin.people.includes(focus) ? "is-focus" : "is-dim");
      const artists = pin.artists.map((artist) => `${artist.name} (${artist.pickers.join(", ")})`).join("; ");
      const text = `${pin.place}: ${artists}`;
      dot.setAttribute("aria-label", text);
      dot.addEventListener("focus", () => tip.show(dot, text));
      dot.addEventListener("blur", tip.hide);
      entries.push({ dot, pin, text });
      frame.append(dot);
    }
    // Pins crowd each other in England and on the US East Coast, so the pointer reads the
    // nearest pin within reach instead of whichever dot is drawn on top.
    let hot = null;
    const read = (event) => {
      const box = frame.getBoundingClientRect();
      let best = null;
      let bestDistance = 24;
      for (const entry of entries) {
        const distance = Math.hypot(event.clientX - (box.left + (entry.pin.x / map.width) * box.width),
          event.clientY - (box.top + (entry.pin.y / map.height) * box.height));
        if (distance < bestDistance) {
          best = entry;
          bestDistance = distance;
        }
      }
      if (best === hot) return;
      hot?.dot.classList.remove("is-hot");
      hot = best;
      if (!hot) return tip.hide();
      hot.dot.classList.add("is-hot");
      tip.show(hot.dot, hot.text);
    };
    frame.addEventListener("pointermove", read);
    frame.addEventListener("pointerdown", read);
    frame.addEventListener("pointerleave", () => {
      hot?.dot.classList.remove("is-hot");
      hot = null;
      tip.hide();
    });
    block.append(frame);
    return block;
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

  function mixesBlock(mixes) {
    const block = element("div", "wrapped-mixes");
    for (const entry of mixes) {
      block.append(element("p", "wrapped-mix-heading", entry.heading), mixBlock(entry.mix));
    }
    return block;
  }

  // A pair's mix, built from the two listeners' genre mixes the slide sent once.
  function pairMix(genreMixes, names) {
    return names.map((name) => {
      const other = new Set((genreMixes[names.find((item) => item !== name)] || []).map((entry) => entry.genre));
      return { name, genres: (genreMixes[name] || []).slice(0, 5)
        .map((entry) => ({ ...entry, shared: other.has(entry.genre) })) };
    });
  }

  // The axis spans the whole group's release years, so it stays put between listeners.
  function timelineBlock(timeline) {
    const start = timeline.axisFrom ?? timeline.from;
    const end = timeline.axisTo ?? timeline.to;
    const span = Math.max(1, end - start);
    const at = (year) => `${((year - start) / span) * 100}%`;
    const block = element("div", "wrapped-timeline");
    block.setAttribute("aria-hidden", "true");
    const axis = element("div", "wrapped-timeline-axis");
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
    for (const [year, className] of [[start, "is-start"], [end, "is-end"]]) {
      const tick = element("span", `wrapped-timeline-tick ${className}`, String(year));
      tick.style.left = at(year);
      axis.append(tick);
    }
    block.append(axis);
    return block;
  }

  // Named winners under a chart: a big heading, one line of detail, then their mix or record.
  function awardsBlock(awards) {
    const block = element("section", `wrapped-awards${awards.some((award) => award.records?.length) ? " has-records" : ""}`);
    for (const award of awards) {
      const item = element("div", "wrapped-award");
      item.append(element("h3", "wrapped-award-title", award.heading));
      if (award.sub) item.append(element("p", "wrapped-award-sub", award.sub));
      if (award.mix?.length) item.append(mixBlock(award.mix));
      for (const record of (award.records || []).map(expandRecord)) {
        const row = element("div", "wrapped-award-record");
        row.append(cover(record), recordCopy(record));
        item.append(row);
      }
      block.append(item);
    }
    return block;
  }

  // Covers only, big, each one a link to the album on Spotify.
  function artWall(records) {
    const list = element("ul", "wrapped-art-wall");
    for (const record of records) {
      const item = element("li");
      const link = cover(record, "wrapped-cover wrapped-art");
      const who = record.pickers?.length ? `, picked by ${record.pickers.join(", ")}` : "";
      link.title = `${record.name} · ${record.artistName}${who}`;
      link.setAttribute("aria-label", `${record.name} by ${record.artistName}${who}; open in Spotify`);
      item.append(link);
      list.append(item);
    }
    return list;
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

  function shelfCover(imageUrl) {
    if (!imageUrl) return element("span", "wrapped-record-placeholder", "no covers yet");
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  }

  // One door per listener; the same markup as the shelves on /records/lists/.
  function shelfList(people) {
    const list = element("ul", "wrapped-shelves");
    list.setAttribute("aria-label", "Each listener’s list");
    for (const shelf of people) {
      const link = element("a", "wrapped-shelf");
      link.href = shelf.href;
      const coverRows = shelf.covers || [];
      const covers = element("span", `wrapped-shelf-covers${coverRows.length >= 4 ? " is-grid" : ""}`);
      covers.setAttribute("aria-hidden", "true");
      if (coverRows.length >= 4) covers.append(...coverRows.slice(0, 4).map((row) => shelfCover(row.imageUrl)));
      else covers.append(shelfCover(coverRows[0]?.imageUrl));
      const counts = [plural(shelf.albumCount || 0, "record")];
      if (shelf.standoutCount) counts.push(plural(shelf.standoutCount, "track"));
      link.setAttribute("aria-label",
        `${shelf.username}${shelf.username === viewerName ? " (you)" : ""}: ${counts.join(", ")}`);
      link.append(covers, element("span", "wrapped-shelf-name", shelf.username),
        element("span", "wrapped-shelf-count", counts.join(" · ")));
      const item = element("li");
      item.append(link);
      list.append(item);
    }
    return list;
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
      link.href = listener.username ? `/records/lists/?member=${encodeURIComponent(listener.username)}` : "/records/lists/";
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

  // A selection is { ranking: index } or { strip: index }; nothing selected shows the slide's own parts.
  function defaultSelection(card) {
    if (card.noDefault) return {};
    const index = (card.ranking || []).findIndex((row) => row.highlight && row.view);
    return index >= 0 ? { ranking: index } : {};
  }

  const expandRecord = (record) => (record?.spotifyId && albumsById[record.spotifyId]
    ? { ...albumsById[record.spotifyId], ...record } : record);

  // A selected ranking row or strip dot swaps its own view (stat, records, mix…) into the slide.
  function buildStory(card, selection = defaultSelection(card), onSelect = null) {
    const rankSelected = selection.ranking ?? -1;
    const stripSelected = selection.strip ?? -1;
    const view = rankSelected >= 0 ? card.ranking?.[rankSelected]?.view || {}
      : stripSelected >= 0 ? card.strip?.points?.[stripSelected]?.view || {} : {};
    const {
      id = "", title, lede, detail = "", records: rawRecords = [], notes = [], wordMap = [], links = [], status = "",
      cast = [], stat = null, ranking = [], mix = [], timeline = null, chips = [], fact = "", people = [],
      titleLines = [], axis = null, strip = null, map = null, mixes: cardMixes = [], unranked = false,
      mixPair = null, mapFocus = "", genreMixes = null, awards = [], artWall: wall = false,
    } = { ...card, ...view };
    const records = (rawRecords || []).map(expandRecord);
    const mixes = mixPair && genreMixes
      ? [{ heading: mixPair.heading, mix: pairMix(genreMixes, mixPair.names) }] : cardMixes;
    const article = element("article", "wrapped-story");
    article.setAttribute("aria-roledescription", "slide");
    if (id) article.dataset.card = id;

    const head = element("header", "wrapped-story-head");
    const heading = element("h2", titleLines?.length ? "has-lines" : "");
    if (titleLines?.length) {
      for (const line of titleLines) heading.append(element("span", "wrapped-title-line", line));
    } else {
      heading.textContent = title;
    }
    head.append(heading);
    if (status) head.append(element("p", "wrapped-story-status", status));
    if (lede) head.append(element("p", "wrapped-story-lede", lede));
    if (detail) head.append(element("p", "wrapped-story-detail", detail));

    const main = element("div", "wrapped-story-main");
    if (stat) main.append(statBlock(stat));
    // A timeline slide always keeps the fact's room, so switching listeners does not jump.
    if (fact || timeline) main.append(element("p", `wrapped-fact${fact ? "" : " is-empty"}`, fact));
    if (timeline?.points?.length) main.append(timelineBlock(timeline));
    if (strip?.points?.length) {
      main.append(stripBlock(strip, stripSelected, onSelect && ((index) => onSelect({ strip: index }))));
    }
    if (map?.pins?.length) main.append(mapBlock(map, mapFocus));
    if (mix?.length) main.append(mixBlock(mix));
    if (mixes?.length) main.append(mixesBlock(mixes));
    if (chips?.length) {
      const list = element("ul", "wrapped-chips");
      for (const chip of chips) list.append(element("li", "", chip));
      main.append(list);
    }
    if (cast?.length) main.append(castTable(cast));
    if (wordMap?.length) main.append(wordMapBlock(wordMap));
    // A long run of notes goes under the ranking, so the ranking stays near the top.
    const longNotes = (notes?.length || 0) > 3;
    if (notes?.length && !longNotes) main.append(notesBlock(notes));
    if (ranking?.length) {
      main.append(rankingBlock(ranking, rankSelected, onSelect && ((index) => onSelect({ ranking: index })),
        { axis, unranked }));
    }
    if (longNotes) main.append(notesBlock(notes));
    if (people?.length) main.append(shelfList(people));
    if (links?.length) main.append(linksBlock(links));

    const unique = uniqueRecords(records);
    const layout = unique.length && !wall ? recordLayout(unique.length) : "";
    const body = element("div", "wrapped-story-body");
    body.append(main);
    // A strip needs the slide's full width, so its records go underneath.
    if ((layout === "feature" || layout === "pair") && !strip) {
      const side = element("div", "wrapped-story-side");
      side.append(recordBlock(unique));
      body.append(side);
      body.classList.add("has-side");
    }
    article.append(head, body);
    if (layout === "grid" || layout === "list" || (layout && strip)) article.append(recordBlock(unique));
    if (wall && unique.length) article.append(artWall(unique));
    if (awards?.length) article.append(awardsBlock(awards));

    // Size each slide by how much it carries: sparse slides center and grow, dense ones tighten.
    const blocks = main.children.length;
    const heavy = (ranking?.length || 0) > 5 || unique.length > 6 || (notes?.length || 0) > 1
      || (cast?.length || 0) > 8 || (people?.length || 0) > 6 || Boolean(strip || map) || (mixes?.length || 0) > 1;
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
    const buildSlide = (card, index, selection = defaultSelection(card)) => buildStory(card, selection, (choice) => {
      const scrollTop = window.scrollY;
      const deckScrollTop = elements.deck.scrollTop;
      const next = buildSlide(card, index, choice);
      next.classList.add("is-settled");
      next.hidden = slides[index].hidden;
      elements.stories.replaceChild(next, slides[index]);
      slides[index] = next;
      const focusTarget = choice.strip !== undefined
        ? next.querySelectorAll(".wrapped-strip-dot")[choice.strip]
        : next.querySelectorAll(".wrapped-rank-row")[choice.ranking];
      focusTarget?.focus({ preventScroll: true });
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
    albumsById = payload.albums || {};
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

  // Wrapped gives away the games' answers, so it waits until the member has played.
  function showLocked(unlock) {
    showGate("Liner Notes are waiting for you behind the minigames.");
    elements.gateTitle.textContent = "Liner Notes are locked.";
    elements.gateLink.hidden = true;
    if (unlock) window.RecordClubUnlock?.renderCard(elements.lock, unlock);
  }

  async function start() {
    try {
      const session = await api("/api/auth/me");
      if (!session.authenticated) {
        showGate();
        return;
      }
      const recordClub = session.user.recordClub || {};
      if (!recordClub.gamesOpen) {
        showGate("Liner Notes open with the Record Club minigames.");
        return;
      }
      if (!recordClub.wrappedUnlock?.unlocked) {
        showLocked(recordClub.wrappedUnlock);
        return;
      }
      elements.memberName.textContent = session.user.username;
      viewerId = session.user.id;
      viewerName = session.user.username;
      let payload;
      try {
        payload = await api("/api/wrapped");
      } catch (error) {
        if (error.code === "wrapped_locked") return showLocked(recordClub.wrappedUnlock);
        throw error;
      }
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
