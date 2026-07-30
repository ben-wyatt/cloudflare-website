(() => {
  const gameUsernames = new Set(["ben", "ben_dev"]);

  const elements = {
    loading: document.getElementById("game-loading"),
    gate: document.getElementById("game-gate"),
    gateMessage: document.getElementById("game-gate-message"),
    app: document.getElementById("game-app"),
    memberName: document.getElementById("game-member-name"),
    round: document.getElementById("game-round"),
    cover: document.getElementById("game-cover"),
    selectorCount: document.getElementById("game-selector-count"),
    clueList: document.getElementById("game-clue-list"),
    choices: document.getElementById("game-choices"),
    status: document.getElementById("game-status"),
    next: document.getElementById("game-next"),
    progress: document.getElementById("game-progress"),
    totalPoints: document.getElementById("game-total-points"),
    roundsSolved: document.getElementById("game-rounds-solved"),
    perfectRounds: document.getElementById("game-perfect-rounds"),
    pointsBurst: document.getElementById("game-points-burst"),
  };

  if (!elements.loading) return;

  const state = {
    roundId: "",
    choices: [],
    guessedUserIds: new Set(),
    correctUserIds: new Set(),
    listenerNames: new Map(),
    selectorCount: 1,
    clueLevel: 0,
    missCount: 0,
    guessing: false,
    finished: false,
    solved: false,
    pendingUserId: "",
    feedbackUserId: "",
    scoreboard: {
      totalPoints: 0,
      roundsSolved: 0,
      perfectRounds: 0,
    },
    scoreFrame: 0,
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
  const numberFormatter = new Intl.NumberFormat();
  const listFormatter = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

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

  function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function renderScoreboard(scoreboard = {}, animate = false) {
    const next = {
      totalPoints: Number(scoreboard.totalPoints || 0),
      roundsSolved: Number(scoreboard.roundsSolved || 0),
      perfectRounds: Number(scoreboard.perfectRounds || 0),
    };
    const previous = state.scoreboard;
    state.scoreboard = next;

    cancelAnimationFrame(state.scoreFrame);
    elements.roundsSolved.textContent = numberFormatter.format(next.roundsSolved);
    elements.perfectRounds.textContent = numberFormatter.format(next.perfectRounds);

    if (!animate || reducedMotion || previous.totalPoints === next.totalPoints) {
      elements.totalPoints.textContent = numberFormatter.format(next.totalPoints);
    } else {
      const startedAt = performance.now();
      const duration = 650;
      const tick = (now) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - ((1 - progress) ** 3);
        const value = Math.round(previous.totalPoints + ((next.totalPoints - previous.totalPoints) * eased));
        elements.totalPoints.textContent = numberFormatter.format(value);
        if (progress < 1) state.scoreFrame = requestAnimationFrame(tick);
      };
      state.scoreFrame = requestAnimationFrame(tick);
    }

    if (animate) {
      [
        [elements.totalPoints, previous.totalPoints !== next.totalPoints],
        [elements.roundsSolved, previous.roundsSolved !== next.roundsSolved],
        [elements.perfectRounds, previous.perfectRounds !== next.perfectRounds],
      ].forEach(([element, changed]) => {
        if (!changed) return;
        restartAnimation(element.closest(".game-score-stat"), "is-updating");
      });
    }
  }

  function showPointsBurst(points) {
    elements.pointsBurst.textContent = `+${numberFormatter.format(points)}`;
    elements.pointsBurst.hidden = false;
    restartAnimation(elements.pointsBurst, "is-showing");
    window.setTimeout(() => {
      elements.pointsBurst.hidden = true;
      elements.pointsBurst.classList.remove("is-showing");
    }, 950);
  }

  function setTextClue(element, value, fallback) {
    const revealed = typeof value === "string";
    element.textContent = revealed ? (value || fallback) : fallback;
    element.classList.toggle("is-locked", !revealed);
  }

  function renderFavoriteTracksClue(element, tracks) {
    const revealed = Array.isArray(tracks);
    element.classList.toggle("is-locked", !revealed);
    if (!revealed) {
      element.textContent = "Unlocks after one miss";
      return;
    }
    if (!tracks.length) {
      element.textContent = "No favorite tracks saved.";
      return;
    }

    const list = document.createElement("ul");
    list.className = "game-track-list";
    for (const track of tracks) {
      const name = String(track?.name || "").trim();
      const spotifyUrl = String(track?.spotifyUrl || "").trim();
      if (!name || !/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+$/.test(spotifyUrl)) continue;

      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = spotifyUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.setAttribute("aria-label", `Play ${name} on Spotify`);
      link.append(document.createTextNode(`${name} `));
      const externalMark = document.createElement("span");
      externalMark.setAttribute("aria-hidden", "true");
      externalMark.textContent = "↗";
      link.append(externalMark);
      item.append(link);
      list.append(item);
    }

    if (!list.childElementCount) {
      element.textContent = "No favorite tracks saved.";
      return;
    }
    element.replaceChildren(list);
  }

  function createClue(label) {
    const clue = document.createElement("div");
    clue.className = "game-clue";
    const clueLabel = document.createElement("span");
    clueLabel.className = "game-clue-label";
    clueLabel.textContent = label;
    const value = document.createElement("div");
    value.className = "game-clue-value";
    clue.append(clueLabel, value);
    return { clue, value };
  }

  function renderClues(clues = {}, revealedLevel = 0) {
    const listenerClues = Array.isArray(clues.listeners) ? clues.listeners : [];
    const listenerCount = Math.max(state.selectorCount, listenerClues.length, 1);
    const clueGroups = [];

    for (let index = 0; index < listenerCount; index += 1) {
      const listener = listenerClues[index] || {};
      const group = document.createElement("section");
      group.className = "game-listener-clues";
      group.setAttribute("aria-label", listenerCount > 1
        ? `Mystery listener ${index + 1} clues`
        : "Mystery listener clues");

      if (listenerCount > 1) {
        const label = document.createElement("p");
        label.className = "game-listener-label";
        label.textContent = state.listenerNames.get(index) || `Listener ${index + 1}`;
        group.append(label);
      }

      const favoriteTracks = createClue("Their favorite tracks");
      renderFavoriteTracksClue(favoriteTracks.value, listener.favoriteTracks);
      favoriteTracks.clue.classList.toggle("is-revealing", revealedLevel === 1);

      const review = createClue("Their note");
      setTextClue(review.value, listener.review, "Unlocks after two misses");
      review.clue.classList.toggle("is-revealing", revealedLevel === 2);

      group.append(favoriteTracks.clue, review.clue);
      clueGroups.push(group);
    }
    elements.clueList.replaceChildren(...clueGroups);

    const dots = [...elements.progress.children];
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-used", index < state.clueLevel && !state.solved);
      dot.classList.toggle("is-solved", state.solved);
    });
    elements.progress.setAttribute(
      "aria-label",
      state.solved ? "Mystery record solved" : `${state.clueLevel} of 2 clues revealed`,
    );
  }

  function renderChoices() {
    const buttons = state.choices.map((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "game-choice";
      button.textContent = choice.username;
      button.dataset.userId = choice.userId;

      const guessed = state.guessedUserIds.has(choice.userId);
      const correct = state.correctUserIds.has(choice.userId);
      const pending = state.guessing && choice.userId === state.pendingUserId;
      button.classList.toggle("is-wrong", guessed && !correct);
      button.classList.toggle("is-correct", correct);
      button.classList.toggle("is-pending", pending);
      button.classList.toggle("is-new-wrong", guessed && !correct && choice.userId === state.feedbackUserId);
      button.classList.toggle("is-new-correct", correct && choice.userId === state.feedbackUserId);
      if (guessed && !correct) button.setAttribute("aria-label", `${choice.username}, incorrect guess`);
      if (correct) button.setAttribute("aria-label", `${choice.username}, correct selection`);
      button.disabled = state.guessing || state.finished || guessed;
      button.addEventListener("click", () => makeGuess(choice));
      return button;
    });
    elements.choices.replaceChildren(...buttons);
  }

  function resetRoundState(payload) {
    state.roundId = payload.roundId;
    state.choices = payload.choices || [];
    state.guessedUserIds = new Set();
    state.correctUserIds = new Set();
    state.listenerNames = new Map();
    state.selectorCount = Math.max(Number(payload.selectorCount || 1), 1);
    state.clueLevel = 0;
    state.missCount = 0;
    state.guessing = false;
    state.finished = false;
    state.solved = false;
    state.pendingUserId = "";
    state.feedbackUserId = "";
    elements.choices.setAttribute("aria-busy", "false");
    elements.cover.src = payload.coverUrl;
    elements.cover.alt = "Mystery album cover";
    elements.selectorCount.textContent = `${state.selectorCount} people selected this album`;
    elements.selectorCount.hidden = state.selectorCount <= 1;
    elements.next.hidden = true;
    elements.round.hidden = false;
    elements.round.classList.remove("is-solved", "is-entering");
    void elements.round.offsetWidth;
    elements.round.classList.add("is-entering");
    elements.pointsBurst.hidden = true;
    setStatus();
    renderClues({});
    renderChoices();
    renderScoreboard(payload.scoreboard);
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

  function answerSummary(answer) {
    const names = (answer?.users || [])
      .map((user) => String(user?.username || "").trim())
      .filter(Boolean);
    if (!names.length) return "The other listeners selected it";
    const formattedNames = listFormatter.format(names);
    return names.length === 1
      ? `${formattedNames} picked it`
      : `${formattedNames} selected it`;
  }

  async function makeGuess(choice) {
    if (state.guessing || state.finished || state.guessedUserIds.has(choice.userId)) return;
    state.guessing = true;
    state.pendingUserId = choice.userId;
    state.feedbackUserId = "";
    elements.choices.setAttribute("aria-busy", "true");
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

      const previousClueLevel = state.clueLevel;
      state.guessedUserIds.add(choice.userId);
      if (payload.correct) {
        state.correctUserIds.add(choice.userId);
        if (Number.isInteger(payload.matchedListenerIndex)) {
          state.listenerNames.set(payload.matchedListenerIndex, choice.username);
        }
      }
      state.selectorCount = Math.max(Number(payload.selectorCount || state.selectorCount), 1);
      state.clueLevel = payload.clueLevel;
      state.missCount = payload.missCount;
      state.finished = payload.finished;
      state.solved = payload.solved;
      state.guessing = false;
      state.pendingUserId = "";
      state.feedbackUserId = choice.userId;
      elements.choices.setAttribute("aria-busy", "false");
      elements.selectorCount.textContent = `${state.selectorCount} people selected this album`;
      elements.selectorCount.hidden = state.selectorCount <= 1;

      if (payload.finished) {
        (payload.answer?.users || []).forEach((user, index) => {
          if (user?.userId) state.correctUserIds.add(user.userId);
          if (user?.username) state.listenerNames.set(index, user.username);
        });
        elements.cover.alt = `${payload.answer.albumName} by ${payload.answer.artistName} album cover`;
        elements.next.hidden = false;
      }

      const revealedLevel = !payload.correct && state.clueLevel > previousClueLevel
        ? state.clueLevel
        : 0;
      renderClues(payload.clues, revealedLevel);
      renderChoices();

      if (payload.solved) {
        elements.round.classList.add("is-solved");
        renderScoreboard(payload.scoreboard, true);
        showPointsBurst(payload.pointsAwarded);
        const missSummary = payload.missCount === 0
          ? "with no misses"
          : `after ${payload.missCount} ${payload.missCount === 1 ? "miss" : "misses"}`;
        setStatus(`Correct — ${answerSummary(payload.answer)}. +${numberFormatter.format(payload.pointsAwarded)} points ${missSummary}.`, "correct");
      } else if (payload.correct) {
        setStatus(`Correct — ${choice.username} selected it. ${payload.foundCount} of ${payload.selectorCount} found.`, "correct");
      } else if (payload.finished) {
        setStatus(`Not ${choice.username}. That was your third miss — ${answerSummary(payload.answer)}.`, "wrong");
      } else {
        const missesLeft = 3 - payload.missCount;
        setStatus(`Not ${choice.username}. A new clue is unlocked — ${missesLeft} ${missesLeft === 1 ? "miss" : "misses"} left.`, "wrong");
      }
    } catch (error) {
      state.guessing = false;
      state.pendingUserId = "";
      state.feedbackUserId = "";
      elements.choices.setAttribute("aria-busy", "false");
      if (error.code === "round_expired" || error.code === "round_finished") {
        state.finished = true;
        setStatus(`${error.message} Start another record.`, "wrong");
        elements.next.hidden = false;
      } else {
        setStatus(error.message, "wrong");
      }
      renderChoices();
    }
  }

  elements.next.addEventListener("click", startRound);

  api("/api/auth/me")
    .then(async (payload) => {
      if (!payload.authenticated) {
        showGate("Sign in to play.");
        return;
      }
      if (!gameUsernames.has(payload.user.username.toLowerCase())) {
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
