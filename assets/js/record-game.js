(() => {
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
    albumSlot: document.getElementById("game-album-slot"),
    choices: document.getElementById("game-choices"),
    status: document.getElementById("game-status"),
    developerTools: document.getElementById("game-developer-tools"),
    developerSource: document.getElementById("game-developer-source"),
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
    answerKeys: new Set(),
    queuedChoice: null,
    finished: false,
    solved: false,
    pendingUserId: "",
    feedbackUserId: "",
    developerToolsEnabled: false,
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

  function textElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  const compactFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

  function renderAlbumClue(album, revealing) {
    const { clue, value } = createClue("The album");
    clue.classList.add("game-album-clue");
    clue.classList.toggle("is-revealing", revealing);
    if (!album) {
      value.classList.add("is-locked");
      value.textContent = "Unlocks after one miss";
      return clue;
    }
    const title = document.createElement("a");
    title.className = "game-album-title";
    title.href = album.spotifyUrl;
    title.target = "_blank";
    title.rel = "noopener";
    title.append(document.createTextNode(`${album.name} `), textElement("span", "", "↗"));
    title.lastChild.setAttribute("aria-hidden", "true");
    const byline = [album.artistName, album.year].filter(Boolean).join(" · ");
    value.append(title, textElement("p", "game-album-byline", byline));
    if (album.genres?.length) {
      const genres = document.createElement("ul");
      genres.className = "game-album-genres";
      for (const genre of album.genres) genres.append(textElement("li", "", genre));
      value.append(genres);
    }
    const facts = [
      album.albumType && album.albumType !== "album" ? album.albumType : "",
      album.totalTracks ? `${album.totalTracks} ${album.totalTracks === 1 ? "track" : "tracks"}` : "",
      album.totalDurationMs ? `${Math.round(album.totalDurationMs / 60000)} min` : "",
      album.listeners ? `${compactFormatter.format(album.listeners)} Last.fm listeners` : "",
    ].filter(Boolean);
    if (facts.length) value.append(textElement("p", "game-album-facts", facts.join(" · ")));
    return clue;
  }

  function renderListenerClue(listener, label, revealing) {
    const group = document.createElement("section");
    group.className = "game-listener-clues";
    group.setAttribute("aria-label", `${label} clues`);
    group.classList.toggle("is-revealing", revealing);
    group.append(textElement("p", "game-listener-label", label));
    const revealed = Array.isArray(listener.favoriteTracks) || typeof listener.review === "string";
    if (!revealed) {
      group.append(textElement("p", "game-clue-value is-locked", "Top tracks and note unlock after two misses"));
      return group;
    }
    const tracks = createClue("Top tracks");
    renderFavoriteTracksClue(tracks.value, listener.favoriteTracks);
    const review = createClue("Note");
    setTextClue(review.value, listener.review, "No note.");
    group.append(tracks.clue, review.clue);
    return group;
  }

  function renderClues(clues = {}, revealedLevel = 0, revealedListenerIndex = -1) {
    const listenerClues = Array.isArray(clues.listeners) ? clues.listeners : [];
    const listenerCount = Math.max(state.selectorCount, listenerClues.length, 1);
    // The album card sits under the cover; the listeners' clues sit beside it.
    elements.albumSlot.replaceChildren(renderAlbumClue(clues.album || null, revealedLevel === 1));
    const blocks = [];

    for (let index = 0; index < listenerCount; index += 1) {
      const label = state.listenerNames.get(index)
        || (listenerCount > 1 ? `Listener ${index + 1}` : "The listener");
      blocks.push(renderListenerClue(listenerClues[index] || {}, label,
        revealedLevel === 2 || index === revealedListenerIndex));
    }
    elements.clueList.replaceChildren(...blocks);
    // Once any listener's tracks or note show, the cover shrinks to make room under it.
    elements.round.classList.toggle("has-listener-clues", listenerClues.some((listener) => (
      Array.isArray(listener?.favoriteTracks) || typeof listener?.review === "string"
    )));

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
      // While the server confirms a guess the page already marked, the other names stay
      // live: a tap waits in line instead of being lost.
      button.disabled = Boolean(state.pendingUserId) || state.finished || guessed;
      button.addEventListener("click", () => makeGuess(choice));
      return button;
    });
    elements.choices.replaceChildren(...buttons);
  }

  function renderDeveloperTools(developerTools) {
    const sources = Array.isArray(developerTools?.sources)
      ? developerTools.sources
      : [];
    state.developerToolsEnabled = Boolean(developerTools);
    elements.developerTools.hidden = !state.developerToolsEnabled;
    if (!state.developerToolsEnabled) {
      elements.developerSource.replaceChildren();
      return;
    }

    const selectedUserId = elements.developerSource.value;
    const options = [];
    const randomOption = document.createElement("option");
    randomOption.value = "";
    randomOption.textContent = "Anyone (random)";
    options.push(randomOption);

    for (const source of sources) {
      const userId = String(source?.userId || "").trim();
      const username = String(source?.username || "").trim();
      if (!userId || !username) continue;
      const option = document.createElement("option");
      option.value = userId;
      option.textContent = username;
      options.push(option);
    }

    elements.developerSource.replaceChildren(...options);
    if (options.some((option) => option.value === selectedUserId)) {
      elements.developerSource.value = selectedUserId;
    }
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
    state.answerKeys = new Set(payload.answerKeys || []);
    state.queuedChoice = null;
    elements.choices.setAttribute("aria-busy", "false");
    elements.cover.src = payload.coverUrl;
    elements.cover.alt = "Mystery album cover";
    elements.selectorCount.textContent = `${state.selectorCount} people selected this album`;
    elements.selectorCount.hidden = state.selectorCount <= 1;
    renderDeveloperTools(payload.developerTools);
    elements.next.hidden = !state.developerToolsEnabled;
    elements.round.hidden = false;
    elements.round.classList.remove("is-solved", "is-entering");
    void elements.round.offsetWidth;
    elements.round.classList.add("is-entering");
    elements.pointsBurst.hidden = true;
    setStatus();
    renderClues({});
    renderChoices();
    renderScoreboard(payload.scoreboard);
    measureRoundTop();
  }

  async function startRound() {
    elements.next.disabled = true;
    elements.developerSource.disabled = true;
    elements.round.hidden = true;
    setStatus();
    try {
      const sourceUserId = state.developerToolsEnabled
        ? elements.developerSource.value
        : "";
      const payload = await api("/api/game", {
        method: "POST",
        body: {
          action: "new",
          ...(sourceUserId ? { sourceUserId } : {}),
        },
      });
      resetRoundState(payload);
    } catch (error) {
      elements.round.hidden = false;
      elements.choices.replaceChildren();
      setStatus(error.message, "wrong");
    } finally {
      elements.next.disabled = false;
      elements.developerSource.disabled = false;
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

  // Marks a guess right or wrong at once from the round's answer fingerprints.
  // Returns false when the page cannot tell (no fingerprints or no Web Crypto).
  async function markGuessLocally(choice) {
    if (!state.answerKeys.size || !globalThis.crypto?.subtle) return false;
    let key;
    try {
      const bytes = new TextEncoder().encode(`${state.roundId}:${choice.userId}`);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      key = [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      return false;
    }
    const correct = state.answerKeys.has(key);
    state.guessedUserIds.add(choice.userId);
    if (correct) state.correctUserIds.add(choice.userId);
    state.feedbackUserId = choice.userId;
    const found = state.correctUserIds.size;
    const misses = state.missCount + (correct ? 0 : 1);
    if ((correct && found >= state.answerKeys.size) || misses >= 3) state.finished = true;
    renderChoices();
    setStatus(correct ? `Correct — ${choice.username} selected it.` : `Not ${choice.username}.`, correct ? "correct" : "wrong");
    return true;
  }

  async function makeGuess(choice) {
    if (state.finished || state.guessedUserIds.has(choice.userId)) return;
    if (state.guessing) {
      state.queuedChoice ||= choice;
      return;
    }
    state.guessing = true;
    state.feedbackUserId = "";
    elements.choices.setAttribute("aria-busy", "true");
    const markedLocally = await markGuessLocally(choice);
    if (!markedLocally) {
      state.pendingUserId = choice.userId;
      renderChoices();
      setStatus("Checking…");
    }

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
      // The shake or pop already played when the page marked the guess; don't replay it.
      state.feedbackUserId = markedLocally ? "" : choice.userId;
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
      const revealedListenerIndex = payload.correct
        && Number.isInteger(payload.matchedListenerIndex)
        ? payload.matchedListenerIndex
        : -1;
      renderClues(payload.clues, revealedLevel, revealedListenerIndex);
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
      if (markedLocally && error.code !== "duplicate_guess") {
        state.guessedUserIds.delete(choice.userId);
        state.correctUserIds.delete(choice.userId);
        state.finished = false;
      }
      state.queuedChoice = null;
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

    const queued = state.queuedChoice;
    state.queuedChoice = null;
    if (queued) void makeGuess(queued);
  }

  elements.next.addEventListener("click", startRound);

  // Enter starts the next record once a round is over (a focused button or link keeps its own Enter).
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!state.finished || elements.next.hidden || elements.next.disabled || elements.app.hidden) return;
    if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [contenteditable]")) return;
    event.preventDefault();
    startRound();
  });

  // The round fills the screen below the masthead; tell the CSS where the round starts.
  function measureRoundTop() {
    const container = document.fullscreenElement || document.documentElement;
    // Measure the masthead, not the round: the round slides in with a transform.
    const masthead = elements.app.querySelector(".game-masthead");
    if (!masthead) return;
    const top = masthead.getBoundingClientRect().bottom - container.getBoundingClientRect().top
      + (container === document.documentElement ? 0 : container.scrollTop);
    const gap = parseFloat(getComputedStyle(elements.round).marginTop) || 0;
    if (top > 0) elements.app.style.setProperty("--game-top", `${Math.round(top + gap)}px`);
  }
  window.addEventListener("resize", measureRoundTop);
  document.addEventListener("fullscreenchange", () => requestAnimationFrame(measureRoundTop));
  document.fonts?.ready.then(measureRoundTop);

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
