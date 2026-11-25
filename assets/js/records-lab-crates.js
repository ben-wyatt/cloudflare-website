(() => {
  const $ = (id) => document.getElementById(id);
  const elements = {
    loading: $("crates-loading"), gate: $("crates-gate"), gateMessage: $("crates-gate-message"), app: $("crates-app"),
    memberName: $("crates-member-name"), number: $("crates-number"), previous: $("crates-previous"), nextPuzzle: $("crates-next-puzzle"),
    found: $("crates-found"), mistakes: $("crates-mistakes"), left: $("crates-left"),
    solved: $("crates-solved"), grid: $("crates-grid"), status: $("crates-status"),
    shuffle: $("crates-shuffle"), clear: $("crates-clear"), check: $("crates-check"), next: $("crates-next"), giveUp: $("crates-give-up"),
  };
  if (!elements.loading) return;

  const GROUP_NAMES = { badabing: "Badabing", development: "the development seed lists" };
  const params = new URLSearchParams(window.location.search);
  const savedGroup = localStorage.getItem("recordLabGroup");
  const group = GROUP_NAMES[params.get("group")] ? params.get("group") : GROUP_NAMES[savedGroup] ? savedGroup : "badabing";

  const state = { number: 0, count: 0, groups: [], tiles: [], selected: new Set(), found: [], mistakes: 0, tried: new Set(), done: false };

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

  function setStatus(message, kind = "") {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-wrong", kind === "wrong");
    elements.status.classList.toggle("is-correct", kind === "correct");
  }

  function renderStats() {
    elements.found.textContent = String(state.done ? state.found.length - state.revealed : state.found.length);
    elements.mistakes.textContent = String(state.mistakes);
    elements.left.textContent = String(state.tiles.length);
  }

  function renderSolved() {
    elements.solved.replaceChildren();
    for (const groupIndex of state.found) {
      const puzzleGroup = state.groups[groupIndex];
      const row = element("li", "crates-row");
      row.dataset.level = String(puzzleGroup.level);
      row.append(element("p", "records-eyebrow crates-row-label", puzzleGroup.label));
      const covers = element("ul", "crates-row-covers");
      for (const album of puzzleGroup.albums) {
        const item = element("li");
        const link = element("a");
        link.href = `https://open.spotify.com/album/${album.spotifyId}`;
        link.target = "_blank";
        link.rel = "noopener";
        const image = element("img");
        image.src = album.imageUrl;
        image.alt = `${album.name} by ${album.artistName}`;
        link.append(image);
        const caption = element("span", "crates-row-caption");
        caption.append(element("strong", "", album.name), element("span", "", album.artistName));
        item.append(link, caption);
        covers.append(item);
      }
      row.append(covers);
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
      button.setAttribute("aria-label", `${tile.name} by ${tile.artistName}`);
      const image = element("img");
      image.src = tile.imageUrl;
      image.alt = "";
      button.append(image);
      button.addEventListener("click", () => toggle(tile.spotifyId));
      item.append(button);
      elements.grid.append(item);
    }
    elements.grid.hidden = !state.tiles.length;
    elements.check.disabled = state.selected.size !== 4 || state.done;
    elements.check.hidden = state.done;
    elements.next.hidden = !state.done;
    elements.clear.disabled = !state.selected.size;
    renderStats();
  }

  function toggle(id) {
    if (state.done) return;
    if (state.selected.has(id)) state.selected.delete(id);
    else if (state.selected.size < 4) state.selected.add(id);
    setStatus("");
    renderGrid();
  }

  function groupOf(id) {
    return state.groups.findIndex((puzzleGroup) => puzzleGroup.albums.some((album) => album.spotifyId === id));
  }

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
      setStatus(`${state.groups[best].label}.`, "correct");
      if (state.found.length === state.groups.length) finish(true);
      renderSolved();
      renderGrid();
      return;
    }
    state.mistakes += 1;
    setStatus(size === 3 ? "One away." : "Not a group.", "wrong");
    elements.grid.classList.remove("is-shaking");
    void elements.grid.offsetWidth;
    elements.grid.classList.add("is-shaking");
    renderGrid();
  }

  function finish(solved) {
    state.done = true;
    state.revealed = 0;
    if (!solved) {
      for (let index = 0; index < state.groups.length; index += 1) {
        if (!state.found.includes(index)) {
          state.found.push(index);
          state.revealed += 1;
        }
      }
      state.tiles = [];
      setStatus("Here are the four groups.");
    } else {
      setStatus(state.mistakes ? `Sorted, with ${state.mistakes} ${state.mistakes === 1 ? "mistake" : "mistakes"}.` : "Sorted, without a mistake.", "correct");
    }
    elements.giveUp.hidden = true;
    elements.giveUp.previousElementSibling.hidden = true;
    renderSolved();
    renderGrid();
    elements.next.focus({ preventScroll: true });
  }

  async function load(number = 0) {
    const query = new URLSearchParams({ group });
    if (number) query.set("n", String(number));
    const response = await fetch(`/api/lab/crates?${query}`, { credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      elements.loading.hidden = true;
      elements.app.hidden = true;
      elements.gate.hidden = false;
      elements.gateMessage.textContent = payload?.error?.message || "The crates could not be loaded.";
      return;
    }
    Object.assign(state, {
      number: payload.number, count: payload.count, groups: payload.groups,
      tiles: shuffle(payload.groups.flatMap((puzzleGroup) => puzzleGroup.albums)),
      selected: new Set(), found: [], mistakes: 0, tried: new Set(), done: false, revealed: 0,
    });
    elements.number.textContent = `puzzle ${payload.number} of ${payload.count}`;
    elements.giveUp.hidden = false;
    elements.giveUp.previousElementSibling.hidden = false;
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
  elements.giveUp.addEventListener("click", () => finish(false));
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
