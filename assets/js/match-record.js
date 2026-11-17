(() => {

  const elements = {
    loading: document.getElementById("match-loading"),
    gate: document.getElementById("match-gate"),
    gateMessage: document.getElementById("match-gate-message"),
    app: document.getElementById("match-app"),
    memberName: document.getElementById("match-member-name"),
    round: document.getElementById("match-round"),
    listenerName: document.getElementById("match-listener-name"),
    choices: document.getElementById("match-choices"),
    clues: document.getElementById("match-clues"),
    status: document.getElementById("match-status"),
    next: document.getElementById("match-next"),
    totalMatches: document.getElementById("match-total-matches"),
    roundsPlayed: document.getElementById("match-rounds-played"),
    perfectRounds: document.getElementById("match-perfect-rounds"),
    details: document.getElementById("match-details"),
    detailsTitle: document.getElementById("match-details-title"),
    detailsArtist: document.getElementById("match-details-artist"),
    detailsNote: document.getElementById("match-details-note"),
    detailsSpotify: document.getElementById("match-details-spotify"),
    detailsTracks: document.getElementById("match-details-tracks"),
    detailsClose: document.getElementById("match-details-close"),
  };

  if (!elements.loading) return;

  const state = {
    roundId: "",
    listenerName: "",
    choices: [],
    // albumId -> true (one of theirs) or false (a miss), as soon as the page knows.
    picks: new Map(),
    notes: new Map(),
    clues: [],
    answerKeys: new Set(),
    maxMisses: 3,
    pending: false,
    queuedAlbumId: "",
    feedbackAlbumId: "",
    finished: false,
    tracklists: new Map(),
    detailsAlbumId: "",
  };

  const numberFormatter = new Intl.NumberFormat();
  const listFormatter = new Intl.ListFormat(undefined, { style: "long", type: "conjunction" });

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

  function showGate(message) {
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.gate.hidden = false;
    elements.gateMessage.textContent = message;
  }

  function setStatus(message = "", kind = "") {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-wrong", kind === "wrong");
    elements.status.classList.toggle("is-correct", kind === "correct");
  }

  function renderScoreboard(scoreboard = {}) {
    elements.totalMatches.textContent = numberFormatter.format(Number(scoreboard.totalMatches || 0));
    elements.roundsPlayed.textContent = numberFormatter.format(Number(scoreboard.roundsPlayed || 0));
    elements.perfectRounds.textContent = numberFormatter.format(Number(scoreboard.perfectRounds || 0));
  }

  const misses = () => [...state.picks.values()].filter((correct) => !correct).length;
  const foundCount = () => [...state.picks.values()].filter(Boolean).length;

  function resultMarker(choice) {
    const picked = state.picks.has(choice.spotifyId);
    if (!state.finished) {
      if (!picked) return "";
      return state.picks.get(choice.spotifyId) ? "✓" : "×";
    }
    if (choice.isAnswer && picked) return "✓ pick";
    if (choice.isAnswer) return "pick";
    if (picked) return "×";
    return "";
  }

  function choiceLabel(choice, index) {
    const picked = state.picks.has(choice.spotifyId);
    if (!state.finished) {
      const result = !picked ? "" : state.picks.get(choice.spotifyId) ? ", one of their records" : ", not theirs";
      return `Option ${index + 1}: ${choice.name} by ${choice.artistName}${result}`;
    }
    const result = choice.isAnswer
      ? "This was one of the listener's records"
      : picked
        ? "This was not one of the listener's records"
        : "This was not selected";
    const reveal = revealText(choice);
    return `${choice.name} by ${choice.artistName}. ${result}.${reveal ? ` ${reveal}.` : ""}`;
  }

  function noteFor(choice) {
    return state.notes.get(choice.spotifyId) || (state.finished && choice.isAnswer ? choice.note || "" : "");
  }

  // A found record shows the listener's note; after the round, each decoy shows who picked it.
  function revealText(choice) {
    const note = noteFor(choice);
    if (note) return `${state.listenerName}: “${note}”`;
    const pickers = state.finished && Array.isArray(choice.pickedBy) ? choice.pickedBy : [];
    return pickers.length ? `Picked by ${listFormatter.format(pickers)}` : "";
  }

  function revealElement(choice) {
    const noteText = noteFor(choice);
    if (noteText) {
      const note = document.createElement("p");
      note.className = "match-reveal match-reveal-note";
      note.textContent = noteText;
      return note;
    }
    const pickers = state.finished && Array.isArray(choice.pickedBy) ? choice.pickedBy : [];
    if (choice.isAnswer || !pickers.length) return null;
    const owner = document.createElement("p");
    owner.className = "match-reveal match-reveal-owner";
    owner.textContent = `Picked by ${listFormatter.format(pickers)}`;
    return owner;
  }

  function renderClues() {
    const items = state.clues.map((clue, index) => {
      const item = document.createElement("li");
      item.className = "match-clue";
      const label = document.createElement("span");
      label.className = "records-eyebrow";
      label.textContent = `note ${index + 1}`;
      const text = document.createElement("p");
      text.textContent = clue.note || "No note.";
      item.append(label, text);
      return item;
    });
    elements.clues.replaceChildren(...items);
    elements.clues.hidden = !items.length;
  }

  function renderChoices() {
    const cards = state.choices.map((choice, index) => {
      const picked = state.picks.has(choice.spotifyId);
      const correct = picked && state.picks.get(choice.spotifyId);
      const card = document.createElement("div");
      card.className = "match-choice-card";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "match-choice";
      button.dataset.spotifyId = choice.spotifyId;
      button.setAttribute("aria-label", choiceLabel(choice, index));
      button.disabled = state.finished || picked;
      button.classList.toggle("is-correct", picked && (state.finished ? choice.isAnswer : correct));
      button.classList.toggle("is-missed", state.finished && choice.isAnswer && !picked);
      button.classList.toggle("is-wrong", picked && !(state.finished ? choice.isAnswer : correct));
      button.classList.toggle("is-new", choice.spotifyId === state.feedbackAlbumId);

      const image = document.createElement("img");
      image.src = choice.imageUrl;
      image.alt = `${choice.name} by ${choice.artistName} album cover`;

      const markerText = resultMarker(choice);
      const marker = document.createElement("span");
      marker.className = "match-choice-marker";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = markerText;
      marker.hidden = !markerText;
      button.append(image, marker);

      const caption = document.createElement("div");
      caption.className = "match-choice-caption";
      const title = document.createElement("strong");
      title.textContent = choice.name;
      const artist = document.createElement("span");
      artist.textContent = choice.artistName;
      caption.append(title, artist);
      const reveal = revealElement(choice);
      if (reveal) caption.append(reveal);

      const detailsButton = document.createElement("button");
      detailsButton.type = "button";
      detailsButton.className = "records-text-button match-details-button";
      detailsButton.textContent = "Details + tracks";
      detailsButton.setAttribute("aria-label", `Details and tracks for ${choice.name} by ${choice.artistName}`);
      detailsButton.addEventListener("click", () => openDetails(choice));

      button.addEventListener("click", () => pick(choice.spotifyId));
      card.append(button, caption, detailsButton);
      return card;
    });
    elements.choices.replaceChildren(...cards);
  }

  function renderTracklist(albumId) {
    const cached = state.tracklists.get(albumId);
    elements.detailsTracks.replaceChildren();
    if (!cached) {
      elements.detailsTracks.textContent = "Loading tracks from Spotify…";
      return;
    }
    if (cached.error) {
      const message = document.createElement("p");
      message.textContent = cached.error;
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "records-text-button";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => loadTracklist(albumId, true));
      elements.detailsTracks.append(message, retry);
      return;
    }
    if (!cached.tracks.length) {
      elements.detailsTracks.textContent = "Spotify did not return any tracks for this album.";
      return;
    }
    const list = document.createElement("ol");
    list.className = "match-track-list";
    for (const track of cached.tracks) {
      const item = document.createElement("li");
      if (track.spotifyUrl) {
        const link = document.createElement("a");
        link.href = track.spotifyUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = track.name;
        item.append(link);
      } else {
        item.textContent = track.name;
      }
      list.append(item);
    }
    elements.detailsTracks.append(list);
  }

  async function loadTracklist(albumId, retry = false) {
    if (!retry && state.tracklists.has(albumId)) return;
    state.tracklists.delete(albumId);
    if (state.detailsAlbumId === albumId) renderTracklist(albumId);
    try {
      const payload = await api(`/api/spotify/tracks?album=${encodeURIComponent(albumId)}`);
      state.tracklists.set(albumId, { tracks: Array.isArray(payload.tracks) ? payload.tracks : [] });
    } catch (error) {
      state.tracklists.set(albumId, { error: error.message });
    }
    if (state.detailsAlbumId === albumId && elements.details.open) renderTracklist(albumId);
  }

  function openDetails(choice) {
    state.detailsAlbumId = choice.spotifyId;
    elements.detailsTitle.textContent = choice.name;
    elements.detailsArtist.textContent = choice.artistName;
    const reveal = revealText(choice);
    elements.detailsNote.textContent = reveal;
    elements.detailsNote.hidden = !reveal;
    elements.detailsSpotify.href = choice.spotifyUrl || `https://open.spotify.com/album/${encodeURIComponent(choice.spotifyId)}`;
    renderTracklist(choice.spotifyId);
    elements.details.showModal();
    if (!state.tracklists.has(choice.spotifyId)) void loadTracklist(choice.spotifyId);
  }

  function resetRound(payload) {
    if (elements.details.open) elements.details.close();
    state.detailsAlbumId = "";
    state.roundId = payload.roundId;
    state.listenerName = String(payload.listener?.username || "");
    state.choices = Array.isArray(payload.choices) ? payload.choices : [];
    state.picks = new Map();
    state.notes = new Map();
    state.clues = [];
    state.answerKeys = new Set(payload.answerKeys || []);
    state.maxMisses = Number(payload.maxMisses) || 3;
    state.pending = false;
    state.queuedAlbumId = "";
    state.feedbackAlbumId = "";
    state.finished = false;
    elements.listenerName.textContent = state.listenerName;
    elements.round.hidden = false;
    elements.round.classList.remove("is-entering", "is-finished");
    void elements.round.offsetWidth;
    elements.round.classList.add("is-entering");
    elements.next.hidden = true;
    setStatus();
    renderScoreboard(payload.scoreboard);
    renderClues();
    renderChoices();
  }

  async function startRound() {
    elements.next.disabled = true;
    elements.round.hidden = true;
    setStatus();
    try {
      const payload = await api("/api/match-record", {
        method: "POST",
        body: { action: "new" },
      });
      resetRound(payload);
    } catch (error) {
      elements.round.hidden = false;
      elements.choices.replaceChildren();
      elements.clues.hidden = true;
      setStatus(error.message, "wrong");
    } finally {
      elements.next.disabled = false;
    }
  }

  // Marks a tap right or wrong at once from the round's answer fingerprints.
  // Returns false when the page cannot tell, so the server's answer decides.
  async function markLocally(albumId) {
    if (!state.answerKeys.size || !globalThis.crypto?.subtle) return false;
    try {
      const bytes = new TextEncoder().encode(`${state.roundId}:${albumId}`);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const key = [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const correct = state.answerKeys.has(key);
      state.picks.set(albumId, correct);
      state.feedbackAlbumId = albumId;
      if (foundCount() >= state.answerKeys.size || misses() >= state.maxMisses) state.finished = true;
      renderChoices();
      setStatus(correct ? `Yes — one of ${state.listenerName}'s.` : "Not that one.", correct ? "correct" : "wrong");
      return true;
    } catch {
      return false;
    }
  }

  function statusAfterPick(payload) {
    if (payload.solved) {
      return [payload.misses === 0
        ? `Perfect — both records belong to ${state.listenerName}.`
        : `Found both of ${state.listenerName}'s records with ${payload.misses} ${payload.misses === 1 ? "miss" : "misses"}.`, "correct"];
    }
    if (payload.finished) {
      return [`Third miss. The covers marked “pick” show ${state.listenerName}'s records.`, "wrong"];
    }
    if (payload.correct) return [`Yes — one of ${state.listenerName}'s. One more to find.`, "correct"];
    const left = payload.maxMisses - 1 - payload.misses;
    return [left > 0
      ? `Not that one. A note is unlocked — ${left} ${left === 1 ? "miss" : "misses"} left.`
      : "Not that one. A note is unlocked — the next miss ends the round.", "wrong"];
  }

  async function pick(albumId) {
    if (state.finished || state.picks.has(albumId)) return;
    // A tap while the server is still answering waits its turn.
    if (state.pending) {
      state.queuedAlbumId ||= albumId;
      return;
    }
    state.pending = true;
    state.feedbackAlbumId = "";
    elements.choices.setAttribute("aria-busy", "true");
    const markedLocally = await markLocally(albumId);
    if (!markedLocally) setStatus("Checking…");

    try {
      const payload = await api("/api/match-record", {
        method: "POST",
        body: { action: "pick", roundId: state.roundId, albumId },
      });
      state.picks.set(albumId, Boolean(payload.correct));
      (payload.found || []).forEach((item) => state.notes.set(item.spotifyId, String(item.note || "")));
      state.clues = Array.isArray(payload.clues) ? payload.clues : [];
      state.finished = Boolean(payload.finished);
      // The shake or pop already played when the page marked the tap.
      state.feedbackAlbumId = markedLocally ? "" : albumId;
      if (payload.finished) {
        state.choices = payload.choices || state.choices;
        state.choices.forEach((choice) => {
          if (choice.picked && !state.picks.has(choice.spotifyId)) state.picks.set(choice.spotifyId, choice.isAnswer);
        });
        elements.round.classList.add("is-finished");
        elements.next.hidden = false;
        renderScoreboard(payload.scoreboard);
      }
      renderClues();
      renderChoices();
      setStatus(...statusAfterPick(payload));
    } catch (error) {
      if (markedLocally && error.code !== "duplicate_match_pick") {
        state.picks.delete(albumId);
        state.finished = false;
      }
      state.queuedAlbumId = "";
      if (error.code === "round_expired" || error.code === "round_finished") {
        state.finished = true;
        elements.next.hidden = false;
        elements.choices.replaceChildren();
        elements.clues.hidden = true;
        setStatus(`${error.message} Start another listener.`, "wrong");
      } else {
        setStatus(error.message, "wrong");
        renderChoices();
      }
    } finally {
      state.pending = false;
      elements.choices.setAttribute("aria-busy", "false");
    }

    const queued = state.queuedAlbumId;
    state.queuedAlbumId = "";
    if (queued) void pick(queued);
  }

  // Enter starts the next listener once a round is over (a focused button or link keeps its own Enter).
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!state.finished || elements.next.hidden || elements.next.disabled || elements.app.hidden) return;
    if (elements.details.open) return;
    if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [contenteditable]")) return;
    event.preventDefault();
    void startRound();
  });

  elements.next.addEventListener("click", startRound);
  elements.detailsClose.addEventListener("click", () => elements.details.close());
  elements.details.addEventListener("close", () => { state.detailsAlbumId = ""; });

  api("/api/auth/me")
    .then(async (payload) => {
      if (!payload.authenticated) {
        showGate("Sign in to play.");
        return;
      }
      if (!payload.user.recordClubOwner) {
        showGate("This game is not available on this account.");
        return;
      }

      elements.memberName.textContent = payload.user.username;
      elements.loading.hidden = true;
      elements.gate.hidden = true;
      elements.app.hidden = false;
      await startRound();
    })
    .catch((error) => showGate(error.message));
})();
