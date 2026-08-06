(() => {
  const pickCount = 2;

  const elements = {
    loading: document.getElementById("match-loading"),
    gate: document.getElementById("match-gate"),
    gateMessage: document.getElementById("match-gate-message"),
    app: document.getElementById("match-app"),
    memberName: document.getElementById("match-member-name"),
    round: document.getElementById("match-round"),
    listenerName: document.getElementById("match-listener-name"),
    choices: document.getElementById("match-choices"),
    selectionCount: document.getElementById("match-selection-count"),
    submit: document.getElementById("match-submit"),
    status: document.getElementById("match-status"),
    next: document.getElementById("match-next"),
    totalMatches: document.getElementById("match-total-matches"),
    roundsPlayed: document.getElementById("match-rounds-played"),
    perfectRounds: document.getElementById("match-perfect-rounds"),
  };

  if (!elements.loading) return;

  const state = {
    roundId: "",
    listenerName: "",
    choices: [],
    selectedIds: new Set(),
    submitting: false,
    finished: false,
  };

  const numberFormatter = new Intl.NumberFormat();

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

  function resultMarker(choice, selected) {
    if (!state.finished) {
      if (!selected) return "";
      return String([...state.selectedIds].indexOf(choice.spotifyId) + 1);
    }
    if (choice.isAnswer && selected) return "✓ pick";
    if (choice.isAnswer) return "pick";
    if (selected) return "×";
    return "";
  }

  function choiceLabel(choice, index, selected) {
    if (!state.finished) {
      return `Album cover option ${index + 1}${selected ? ", selected" : ""}`;
    }
    const result = choice.isAnswer
      ? "This was one of the listener's records"
      : selected
        ? "This was not one of the listener's records"
        : "This was not selected";
    return `${choice.name} by ${choice.artistName}. ${result}.`;
  }

  function renderChoices() {
    const buttons = state.choices.map((choice, index) => {
      const selected = state.selectedIds.has(choice.spotifyId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "match-choice";
      button.dataset.spotifyId = choice.spotifyId;
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", choiceLabel(choice, index, selected));
      button.disabled = state.submitting || state.finished;
      button.classList.toggle("is-selected", selected && !state.finished);
      button.classList.toggle("is-correct", state.finished && choice.isAnswer && selected);
      button.classList.toggle("is-missed", state.finished && choice.isAnswer && !selected);
      button.classList.toggle("is-wrong", state.finished && !choice.isAnswer && selected);

      const image = document.createElement("img");
      image.src = choice.imageUrl;
      image.alt = state.finished
        ? `${choice.name} by ${choice.artistName} album cover`
        : `Album cover option ${index + 1}`;

      const markerText = resultMarker(choice, selected);
      const marker = document.createElement("span");
      marker.className = "match-choice-marker";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = markerText;
      marker.hidden = !markerText;
      button.append(image, marker);

      if (state.finished) {
        const caption = document.createElement("span");
        caption.className = "match-choice-caption";
        const title = document.createElement("strong");
        title.textContent = choice.name;
        const artist = document.createElement("span");
        artist.textContent = choice.artistName;
        caption.append(title, artist);
        button.append(caption);
      }

      button.addEventListener("click", () => toggleChoice(choice.spotifyId));
      return button;
    });
    elements.choices.replaceChildren(...buttons);
  }

  function renderSelection() {
    const selectedCount = state.selectedIds.size;
    elements.selectionCount.textContent = `${selectedCount} / ${pickCount} selected`;
    elements.submit.disabled = state.submitting || state.finished || selectedCount !== pickCount;
    renderChoices();
  }

  function toggleChoice(albumId) {
    if (state.submitting || state.finished) return;
    if (state.selectedIds.has(albumId)) {
      state.selectedIds.delete(albumId);
      setStatus();
    } else if (state.selectedIds.size < pickCount) {
      state.selectedIds.add(albumId);
      setStatus();
    } else {
      setStatus("Two covers are already selected. Unselect one to change your answer.", "wrong");
    }
    renderSelection();
  }

  function resetRound(payload) {
    state.roundId = payload.roundId;
    state.listenerName = String(payload.listener?.username || "");
    state.choices = Array.isArray(payload.choices) ? payload.choices : [];
    state.selectedIds = new Set();
    state.submitting = false;
    state.finished = false;
    elements.listenerName.textContent = state.listenerName;
    elements.round.hidden = false;
    elements.round.classList.remove("is-entering", "is-finished");
    void elements.round.offsetWidth;
    elements.round.classList.add("is-entering");
    elements.next.hidden = true;
    elements.submit.hidden = false;
    elements.submit.textContent = "Lock in two covers";
    setStatus();
    renderScoreboard(payload.scoreboard);
    renderSelection();
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
      elements.submit.hidden = true;
      elements.selectionCount.textContent = "";
      setStatus(error.message, "wrong");
    } finally {
      elements.next.disabled = false;
    }
  }

  async function submitGuess() {
    if (state.submitting || state.finished || state.selectedIds.size !== pickCount) return;
    state.submitting = true;
    elements.choices.setAttribute("aria-busy", "true");
    elements.submit.textContent = "Checking…";
    setStatus("Checking both covers…");
    renderSelection();

    try {
      const payload = await api("/api/match-record", {
        method: "POST",
        body: {
          action: "guess",
          roundId: state.roundId,
          albumIds: [...state.selectedIds],
        },
      });
      state.choices = payload.choices || state.choices;
      state.finished = true;
      state.submitting = false;
      elements.choices.setAttribute("aria-busy", "false");
      elements.submit.hidden = true;
      elements.next.hidden = false;
      elements.round.classList.add("is-finished");
      renderChoices();
      renderScoreboard(payload.scoreboard);

      if (payload.correctCount === pickCount) {
        setStatus(`Perfect — both records belong to ${state.listenerName}.`, "correct");
      } else if (payload.correctCount === 1) {
        setStatus(`One match. The covers marked “pick” show both of ${state.listenerName}'s records.`, "wrong");
      } else {
        setStatus(`No matches this time. The covers marked “pick” show both of ${state.listenerName}'s records.`, "wrong");
      }
    } catch (error) {
      state.submitting = false;
      elements.choices.setAttribute("aria-busy", "false");
      elements.submit.textContent = "Lock in two covers";
      if (error.code === "round_expired" || error.code === "round_finished") {
        state.finished = true;
        elements.submit.hidden = true;
        elements.next.hidden = false;
        elements.selectionCount.textContent = "";
        elements.choices.replaceChildren();
        setStatus(`${error.message} Start another listener.`, "wrong");
      } else {
        setStatus(error.message, "wrong");
        renderSelection();
      }
    }
  }

  elements.submit.addEventListener("click", submitGuess);
  elements.next.addEventListener("click", startRound);

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
