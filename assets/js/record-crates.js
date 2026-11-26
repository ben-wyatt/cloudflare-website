(() => {
  // Crates: sixteen records, four hidden groups of four that share a fact.
  const $ = (id) => document.getElementById(id);
  const elements = {
    loading: $("crates-loading"), gate: $("crates-gate"), gateMessage: $("crates-gate-message"), app: $("crates-app"),
    memberName: $("crates-member-name"), number: $("crates-number"), previous: $("crates-previous"), nextPuzzle: $("crates-next-puzzle"),
    found: $("crates-found"), mistakes: $("crates-mistakes"), left: $("crates-left"),
    solved: $("crates-solved"), grid: $("crates-grid"), status: $("crates-status"),
    shuffle: $("crates-shuffle"), clear: $("crates-clear"), check: $("crates-check"), next: $("crates-next"),
  };
  if (!elements.loading) return;

  const params = new URLSearchParams(window.location.search);
  const state = { number: 0, count: 0, puzzle: null, tiles: [], selected: new Set(), found: [], mistakes: 0, tried: new Set(), done: false };

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function shuffle(items) {
    const list = [...items];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [list[index], list[swap]] = [list[swap], list[index]];
    }
    return list;
  }

  function cover(record) {
    const image = element("img");
    image.src = record.imageUrl || "";
    image.alt = "";
    image.loading = "lazy";
    return image;
  }

  function setStatus(message, kind = "") {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-wrong", kind === "wrong");
    elements.status.classList.toggle("is-correct", kind === "correct");
  }

  function renderStats() {
    elements.found.textContent = String(state.found.length);
    elements.mistakes.textContent = String(state.mistakes);
    elements.left.textContent = String(state.tiles.length);
  }

  // A found group: its label, then each record with what puts it in the group.
  function renderSolved() {
    elements.solved.replaceChildren();
    for (const groupIndex of state.found) {
      const puzzleGroup = state.puzzle.groups[groupIndex];
      const row = element("li", "crates-row");
      row.dataset.level = String(puzzleGroup.level);
      row.append(element("p", "records-eyebrow crates-row-label", puzzleGroup.label));
      const records = element("ul", "crates-row-records");
      for (const record of puzzleGroup.records) {
        const item = element("li", "crates-row-record");
        const link = element("a", "crates-row-cover");
        link.href = `https://open.spotify.com/album/${record.spotifyId}`;
        link.target = "_blank";
        link.rel = "noopener";
        link.setAttribute("aria-label", `${record.title} by ${record.artist} on Spotify`);
        link.append(cover(record));
        const copy = element("span", "crates-row-copy");
        copy.append(element("strong", "", record.title), element("span", "crates-row-artist", record.artist),
          element("span", "crates-row-why", record.why));
        item.append(link, copy);
        records.append(item);
      }
      row.append(records);
      elements.solved.append(row);
    }
  }

  function renderGrid() {
    elements.grid.replaceChildren();
    for (const tile of state.tiles) {
      const item = element("li", "crates-tile");
      const button = element("button", "crates-tile-button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.selected.has(tile.spotifyId)));
      button.setAttribute("aria-label", `${tile.title} by ${tile.artist}`);
      button.append(cover(tile));
      const caption = element("span", "crates-tile-caption");
      caption.append(element("strong", "", tile.title), element("span", "", tile.artist));
      button.append(caption);
      button.addEventListener("click", () => toggle(tile.spotifyId));
      item.append(button);
      elements.grid.append(item);
    }
    elements.grid.hidden = !state.tiles.length;
    elements.check.disabled = state.selected.size !== 4 || state.done;
    elements.check.hidden = state.done;
    elements.next.hidden = !state.done;
    elements.clear.disabled = !state.selected.size;
    // Once the puzzle is solved, only "Next puzzle" is left to do.
    elements.shuffle.hidden = state.done;
    elements.shuffle.nextElementSibling.hidden = state.done;
    elements.clear.hidden = state.done;
    renderStats();
  }

  function toggle(id) {
    if (state.done) return;
    if (state.selected.has(id)) state.selected.delete(id);
    else if (state.selected.size < 4) state.selected.add(id);
    setStatus("");
    renderGrid();
  }

  const groupOf = (id) => state.puzzle.groups.findIndex((puzzleGroup) => puzzleGroup.records.some((record) => record.spotifyId === id));

  function check() {
    if (state.selected.size !== 4 || state.done) return;
    const key = [...state.selected].sort().join(",");
    if (state.tried.has(key)) {
      setStatus("You tried those four already.");
      return;
    }
    state.tried.add(key);
    const counts = new Map();
    for (const id of state.selected) counts.set(groupOf(id), (counts.get(groupOf(id)) || 0) + 1);
    const [best, size] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (size === 4) {
      state.found.push(best);
      state.tiles = state.tiles.filter((tile) => !state.selected.has(tile.spotifyId));
      state.selected.clear();
      if (state.found.length === state.puzzle.groups.length) {
        state.done = true;
        setStatus(state.mistakes ? `Sorted, with ${state.mistakes} ${state.mistakes === 1 ? "mistake" : "mistakes"}.` : "Sorted, without a mistake.", "correct");
      } else {
        setStatus(`${state.puzzle.groups[best].label}.`, "correct");
      }
      renderSolved();
      renderGrid();
      if (state.done) elements.next.focus({ preventScroll: true });
      return;
    }
    state.mistakes += 1;
    setStatus(size === 3 ? "One away." : "Not a group.", "wrong");
    elements.grid.classList.remove("is-shaking");
    void elements.grid.offsetWidth;
    elements.grid.classList.add("is-shaking");
    renderGrid();
  }

  async function load(number = 0) {
    const query = new URLSearchParams();
    if (number) query.set("n", String(number));
    const response = await fetch(`/api/crates?${query}`, { credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      elements.loading.hidden = true;
      elements.app.hidden = true;
      elements.gate.hidden = false;
      elements.gateMessage.textContent = payload?.error?.message || "The crates could not be loaded.";
      return;
    }
    Object.assign(state, {
      number: payload.number, count: payload.count, puzzle: payload.puzzle,
      tiles: shuffle(payload.puzzle.groups.flatMap((puzzleGroup) => puzzleGroup.records)),
      selected: new Set(), found: [], mistakes: 0, tried: new Set(), done: false,
    });
    elements.number.textContent = `puzzle ${payload.number} of ${payload.count}${payload.puzzle.title ? `: ${payload.puzzle.title}` : ""}`;
    elements.loading.hidden = true;
    elements.app.hidden = false;
    setStatus("");
    renderSolved();
    renderGrid();
  }

  const step = (delta) => load(((state.number - 1 + delta + state.count) % state.count) + 1);
  elements.shuffle.addEventListener("click", () => { state.tiles = shuffle(state.tiles); renderGrid(); });
  elements.clear.addEventListener("click", () => { state.selected.clear(); setStatus(""); renderGrid(); });
  elements.check.addEventListener("click", check);
  elements.next.addEventListener("click", () => step(1));
  elements.previous.addEventListener("click", () => step(-1));
  elements.nextPuzzle.addEventListener("click", () => step(1));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target.closest?.("button, a, input")) return;
    if (state.done) step(1);
    else check();
  });
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then((response) => response.json())
    .then((session) => { elements.memberName.textContent = session?.user?.username || ""; })
    .catch(() => {});
  load(Number(params.get("n")) || 0);
})();
