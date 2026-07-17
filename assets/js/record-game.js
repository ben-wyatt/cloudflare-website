(() => {
  const elements = {
    loading: document.getElementById("game-loading"),
    gate: document.getElementById("game-gate"),
    gateMessage: document.getElementById("game-gate-message"),
    app: document.getElementById("game-app"),
    memberName: document.getElementById("game-member-name"),
    round: document.getElementById("game-round"),
    cover: document.getElementById("game-cover"),
    choices: document.getElementById("game-choices"),
    status: document.getElementById("game-status"),
    next: document.getElementById("game-next"),
    albumClue: document.getElementById("game-album-clue"),
    artistClue: document.getElementById("game-artist-clue"),
    reviewClue: document.getElementById("game-review-clue"),
    progress: document.getElementById("game-progress"),
  };

  if (!elements.loading) return;

  const state = {
    roundId: "",
    choices: [],
    guessedUserIds: new Set(),
    clueLevel: 0,
    guessing: false,
    solved: false,
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

  function setClue(element, value, fallback) {
    const revealed = typeof value === "string";
    element.textContent = revealed ? (value || fallback) : fallback;
    element.classList.toggle("is-locked", !revealed);
  }

  function renderClues(clues = {}) {
    setClue(elements.albumClue, clues.albumName, "Unlocks after one miss");
    setClue(elements.artistClue, clues.artistName, "Unlocks after two misses");
    setClue(elements.reviewClue, clues.review, "Unlocks after three misses");

    const dots = [...elements.progress.children];
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-used", index < state.clueLevel && !state.solved);
      dot.classList.toggle("is-solved", state.solved);
    });
    elements.progress.setAttribute(
      "aria-label",
      state.solved ? "Mystery record solved" : `${state.clueLevel} of 3 clues revealed`,
    );
  }

  function renderChoices(correctUserId = "") {
    const buttons = state.choices.map((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "game-choice";
      button.textContent = choice.username;
      button.dataset.userId = choice.userId;

      const guessed = state.guessedUserIds.has(choice.userId);
      const correct = state.solved && choice.userId === correctUserId;
      button.classList.toggle("is-wrong", guessed && !correct);
      button.classList.toggle("is-correct", correct);
      button.disabled = state.guessing || state.solved || guessed;
      button.addEventListener("click", () => makeGuess(choice));
      return button;
    });
    elements.choices.replaceChildren(...buttons);
  }

  function resetRoundState(payload) {
    state.roundId = payload.roundId;
    state.choices = payload.choices || [];
    state.guessedUserIds = new Set();
    state.clueLevel = 0;
    state.guessing = false;
    state.solved = false;
    elements.cover.src = payload.coverUrl;
    elements.cover.alt = "Mystery album cover";
    elements.next.hidden = true;
    elements.round.hidden = false;
    setStatus();
    renderClues({});
    renderChoices();
  }

  async function startRound() {
    elements.next.disabled = true;
    elements.round.hidden = true;
    setStatus();
    try {
      const payload = await api("/api/game", {
        method: "POST",
        body: { action: "new" },
      });
      resetRoundState(payload);
    } catch (error) {
      elements.round.hidden = false;
      elements.choices.replaceChildren();
      setStatus(error.message, "wrong");
    } finally {
      elements.next.disabled = false;
    }
  }

  async function makeGuess(choice) {
    if (state.guessing || state.solved || state.guessedUserIds.has(choice.userId)) return;
    state.guessing = true;
    renderChoices();
    setStatus("Checking…");

    try {
      const payload = await api("/api/game", {
        method: "POST",
        body: {
          action: "guess",
          roundId: state.roundId,
          userId: choice.userId,
        },
      });

      state.guessedUserIds.add(choice.userId);
      state.clueLevel = payload.clueLevel;
      state.solved = payload.correct;
      state.guessing = false;
      renderClues(payload.clues);

      if (payload.correct) {
        elements.cover.alt = `${payload.clues.albumName} album cover`;
        renderChoices(payload.answer.userId);
        setStatus(`Correct — ${payload.answer.username} picked it. Solved in ${payload.guessCount} ${payload.guessCount === 1 ? "guess" : "guesses"}.`, "correct");
        elements.next.hidden = false;
      } else {
        renderChoices();
        setStatus(
          state.clueLevel < 3 ? `Not ${choice.username}. A new clue is unlocked.` : `Not ${choice.username}. All clues are unlocked — keep guessing.`,
          "wrong",
        );
      }
    } catch (error) {
      state.guessing = false;
      renderChoices();
      if (error.code === "round_expired" || error.code === "round_finished") {
        setStatus(`${error.message} Start another record.`, "wrong");
        elements.next.hidden = false;
      } else {
        setStatus(error.message, "wrong");
      }
    }
  }

  elements.next.addEventListener("click", startRound);

  api("/api/auth/me")
    .then(async (payload) => {
      if (!payload.authenticated) {
        showGate("Sign in as ben to play.");
        return;
      }
      if (payload.user.username.toLowerCase() !== "ben") {
        showGate("This game is only available on ben's account.");
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
