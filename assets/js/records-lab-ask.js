(() => {
  const $ = (id) => document.getElementById(id);
  const elements = {
    loading: $("ask-loading"), gate: $("ask-gate"), gateMessage: $("ask-gate-message"), app: $("ask-app"),
    groupName: $("ask-group-name"), title: $("ask-title"), deck: $("ask-deck"),
    form: $("ask-form"), input: $("ask-input"), submit: $("ask-submit"),
    answer: $("ask-answer"), answerQuestion: $("ask-answer-question"), answerWord: $("ask-answer-word"), answerDetail: $("ask-answer-detail"),
    guessBar: $("ask-guess-bar"), guessLabel: $("ask-guess-label"), guess: $("ask-guess"), guessCancel: $("ask-guess-cancel"),
    board: $("ask-board"), reveal: $("ask-reveal"), progress: $("ask-progress"),
    numbers: $("ask-numbers"), giveUp: $("ask-give-up"), newRound: $("ask-new"), history: $("ask-history"),
  };
  if (!elements.loading) return;

  const GAMES = {
    record: {
      title: "Guess the Record",
      deck: "Find the secret record. Ask yes-or-no questions about the music, the artist, the cover or who picked it. Tap a record to guess.",
      placeholder: "Is it by a band?",
      button: "Ask",
      noun: "records",
    },
    listener: {
      title: "Guess the Listener",
      deck: "Find the secret friend. Ask yes-or-no questions about their records, notes and standout tracks. Tap a friend to guess.",
      placeholder: "Did they pick anything from before 1990?",
      button: "Ask",
      noun: "listeners",
    },
    "only-one": {
      title: "Only One",
      deck: "Describe the marked record so the description fits it and nothing else on the board.",
      placeholder: "Describe your record…",
      button: "Try",
      noun: "records",
    },
  };
  const GROUP_NAMES = { badabing: "Badabing", development: "Development seed lists" };
  const params = new URLSearchParams(window.location.search);
  const game = GAMES[params.get("game")] ? params.get("game") : "record";
  const savedGroup = localStorage.getItem("recordLabGroup");
  const group = GROUP_NAMES[params.get("group")] ? params.get("group") : GROUP_NAMES[savedGroup] ? savedGroup : "badabing";

  const state = {
    roundId: "", cards: [], down: new Set(), targetId: "", selectedId: "",
    levels: new Map(), numbers: new Map(), questions: 0, guesses: 0, attempts: 0,
    pending: false, finished: false,
  };

  async function api(body) {
    const response = await fetch("/api/lab/ask", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || "That did not work. Try again.");
    return payload;
  }

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function showGate(message) {
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.gate.hidden = false;
    elements.gateMessage.textContent = message;
  }

  function cardFace(card) {
    if (card.imageUrl) {
      const image = element("img", "lab-card-cover");
      image.src = card.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      return image;
    }
    const mosaic = element("span", "lab-card-mosaic");
    for (const url of card.covers || []) {
      const image = element("img");
      image.src = url;
      image.alt = "";
      image.loading = "lazy";
      mosaic.append(image);
    }
    return mosaic;
  }

  function renderBoard() {
    elements.board.replaceChildren();
    elements.board.classList.toggle("is-listeners", game === "listener");
    for (const card of state.cards) {
      const item = element("li", "lab-card");
      const button = element("button", "lab-card-button");
      button.type = "button";
      const down = state.down.has(card.id);
      const level = state.levels.get(card.id);
      item.classList.toggle("is-down", down);
      item.classList.toggle("is-target", card.id === state.targetId);
      item.classList.toggle("is-selected", card.id === state.selectedId);
      if (level) item.dataset.level = level;
      button.disabled = state.finished || down || game === "only-one";
      button.setAttribute("aria-label", `${card.title}${card.subtitle ? `, ${card.subtitle}` : ""}${down ? ", turned over" : ""}${card.id === state.targetId ? ", your record" : ""}`);
      button.append(cardFace(card));
      const caption = element("span", "lab-card-caption");
      caption.append(element("span", "lab-card-title", card.title));
      if (card.subtitle) caption.append(element("span", "lab-card-subtitle", card.subtitle));
      button.append(caption);
      if (card.id === state.targetId) button.append(element("span", "lab-card-badge", "yours"));
      if (elements.numbers.checked && state.numbers.has(card.id)) {
        button.append(element("span", "lab-card-number", state.numbers.get(card.id).toFixed(2)));
      }
      button.addEventListener("click", () => select(card.id));
      item.append(button);
      elements.board.append(item);
    }
    renderProgress();
  }

  function renderProgress() {
    const up = state.cards.length - state.down.size;
    if (game === "only-one") {
      elements.progress.textContent = state.attempts ? `${state.attempts} ${state.attempts === 1 ? "try" : "tries"}` : "";
      return;
    }
    const parts = [`${up} of ${state.cards.length} ${GAMES[game].noun} still up`];
    if (state.questions) parts.push(`${state.questions} ${state.questions === 1 ? "question" : "questions"}`);
    if (state.guesses) parts.push(`${state.guesses} wrong ${state.guesses === 1 ? "guess" : "guesses"}`);
    elements.progress.textContent = parts.join(" · ");
  }

  function select(id) {
    if (state.finished || state.pending || game === "only-one" || state.down.has(id)) return;
    state.selectedId = state.selectedId === id ? "" : id;
    const card = state.cards.find((item) => item.id === id);
    elements.guessBar.hidden = !state.selectedId;
    if (state.selectedId) elements.guessLabel.textContent = `${card.title}${card.subtitle && game === "record" ? ` — ${card.subtitle}` : ""}?`;
    renderBoard();
  }

  function addHistory(text, answer, kind = "") {
    const item = element("li", `lab-history-item${kind ? ` is-${kind}` : ""}`);
    item.append(element("span", "lab-history-text", text), element("span", "lab-history-answer", answer));
    elements.history.prepend(item);
  }

  function showAnswer(question, word, detail = "", kind = "") {
    elements.answer.hidden = false;
    elements.answer.dataset.kind = kind;
    elements.answerQuestion.textContent = question;
    elements.answerWord.textContent = word;
    elements.answerDetail.textContent = detail;
    elements.answer.classList.remove("is-new");
    void elements.answer.offsetWidth;
    elements.answer.classList.add("is-new");
  }

  function setNumbers(judgments = []) {
    state.numbers = new Map(judgments.filter((item) => item.p !== null).map((item) => [item.id, item.p]));
  }

  function renderReveal(reveal, solved) {
    state.finished = true;
    elements.form.hidden = true;
    elements.guessBar.hidden = true;
    elements.giveUp.hidden = true;
    elements.reveal.hidden = false;
    elements.reveal.replaceChildren();
    if (!reveal) return;
    const head = element("div", "lab-reveal-head");
    head.append(cardFace(reveal));
    const copy = element("div", "lab-reveal-copy");
    let headline;
    if (game === "only-one") headline = `Only yours fits. ${state.attempts} ${state.attempts === 1 ? "try" : "tries"}.`;
    else if (solved) headline = `Found it in ${state.questions} ${state.questions === 1 ? "question" : "questions"}${state.guesses ? ` and ${state.guesses} wrong ${state.guesses === 1 ? "guess" : "guesses"}` : ""}.`;
    else headline = "Here it was.";
    copy.append(element("p", "records-eyebrow", headline));
    const title = element(reveal.spotifyUrl || reveal.href ? "a" : "span", "lab-reveal-title", reveal.title);
    if (reveal.spotifyUrl) { title.href = reveal.spotifyUrl; title.target = "_blank"; title.rel = "noopener"; }
    else if (reveal.href) title.href = reveal.href;
    copy.append(title);
    if (reveal.subtitle) copy.append(element("p", "lab-reveal-subtitle", reveal.subtitle));
    if (reveal.pickers?.length) {
      const line = element("p", "lab-reveal-pickers", "Picked by ");
      reveal.pickers.forEach((picker, index) => {
        const link = element("a", "", picker.username);
        link.href = picker.href;
        line.append(link);
        if (index < reveal.pickers.length - 1) line.append(", ");
      });
      copy.append(line);
    }
    for (const note of reveal.notes || []) {
      const quote = element("blockquote", "lab-reveal-note", `“${note.note}”`);
      quote.append(element("cite", "", ` — ${note.by}`));
      copy.append(quote);
    }
    const again = element("button", "records-primary", "Play again");
    again.type = "button";
    again.addEventListener("click", start);
    copy.append(again);
    head.append(copy);
    elements.reveal.append(head);
    elements.reveal.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function submit(event) {
    event.preventDefault();
    const text = elements.input.value.trim();
    if (!text || state.pending || state.finished) return;
    state.pending = true;
    elements.submit.disabled = true;
    elements.form.classList.add("is-pending");
    try {
      const result = await api({ action: "ask", roundId: state.roundId, text });
      elements.input.value = "";
      setNumbers(result.judgments);
      if (game === "only-one") {
        state.attempts += 1;
        state.levels = new Map(result.levels.map((entry) => [entry.id, entry.level]));
        const word = result.solved ? "Only yours" : !result.targetFits ? "Not yours" : `${result.alsoFit} more`;
        const detail = result.solved ? "Nothing else on the board fits."
          : !result.targetFits ? "That doesn't fit your record well enough."
            : `It fits your record, and ${result.alsoFit} other ${result.alsoFit === 1 ? "record" : "records"} too.`;
        showAnswer(text, word, detail, result.solved ? "yes" : "no");
        addHistory(text, word, result.solved ? "yes" : "no");
        renderBoard();
        if (result.solved) renderReveal(result.reveal, true);
        return;
      }
      if (result.notCounted) {
        showAnswer(text, "Yes or no?", result.label, "unsure");
        return;
      }
      state.questions += 1;
      result.turnedDown.forEach((id) => state.down.add(id));
      if (state.selectedId && state.down.has(state.selectedId)) select(state.selectedId);
      const turned = result.turnedDown.length;
      showAnswer(text, result.label, turned ? `${turned} ${turned === 1 ? "card turns" : "cards turn"} over.` : "Nothing turns over.", result.answer);
      addHistory(text, result.label, result.answer);
      renderBoard();
      if (result.solved) renderReveal(result.reveal, true);
    } catch (error) {
      showAnswer(text, "Hmm.", error.message, "unsure");
    } finally {
      state.pending = false;
      elements.submit.disabled = false;
      elements.form.classList.remove("is-pending");
      if (!state.finished) elements.input.focus({ preventScroll: true });
    }
  }

  async function guess() {
    if (!state.selectedId || state.pending) return;
    state.pending = true;
    const id = state.selectedId;
    const card = state.cards.find((item) => item.id === id);
    try {
      const result = await api({ action: "guess", roundId: state.roundId, id });
      state.selectedId = "";
      elements.guessBar.hidden = true;
      if (result.correct) {
        addHistory(`Guessed ${card.title}`, "Yes", "yes");
        renderBoard();
        renderReveal(result.reveal, true);
      } else {
        state.guesses += 1;
        state.down.add(id);
        addHistory(`Guessed ${card.title}`, "No", "no");
        showAnswer(`Is it ${card.title}?`, "No", "That card turns over.", "no");
        renderBoard();
      }
    } catch (error) {
      showAnswer(`Is it ${card.title}?`, "Hmm.", error.message, "unsure");
    } finally {
      state.pending = false;
    }
  }

  async function giveUp() {
    if (state.pending || state.finished) return;
    state.pending = true;
    try {
      const result = await api({ action: "give-up", roundId: state.roundId });
      renderReveal(result.reveal, false);
      renderBoard();
    } catch (error) {
      showAnswer("", "Hmm.", error.message, "unsure");
    } finally {
      state.pending = false;
    }
  }

  async function start() {
    Object.assign(state, {
      roundId: "", cards: [], down: new Set(), targetId: "", selectedId: "", levels: new Map(),
      numbers: new Map(), questions: 0, guesses: 0, attempts: 0, pending: false, finished: false,
    });
    elements.answer.hidden = true;
    elements.reveal.hidden = true;
    elements.guessBar.hidden = true;
    elements.form.hidden = false;
    elements.giveUp.hidden = false;
    elements.history.replaceChildren();
    try {
      const round = await api({ action: "new", variant: game, group });
      state.roundId = round.roundId;
      state.cards = round.cards;
      state.targetId = round.targetId || "";
      elements.loading.hidden = true;
      elements.gate.hidden = true;
      elements.app.hidden = false;
      renderBoard();
    } catch (error) {
      showGate(error.message);
    }
  }

  document.title = `${GAMES[game].title} · Record Club Lab`;
  elements.title.textContent = GAMES[game].title;
  elements.deck.textContent = GAMES[game].deck;
  elements.input.placeholder = GAMES[game].placeholder;
  elements.submit.textContent = GAMES[game].button;
  elements.groupName.textContent = GROUP_NAMES[group];
  elements.giveUp.textContent = game === "only-one" ? "Give up" : "Show me";
  for (const link of document.querySelectorAll(".lab-mode")) {
    link.href = `?game=${link.dataset.game}&group=${group}`;
    if (link.dataset.game === game) link.setAttribute("aria-current", "page");
  }
  elements.form.addEventListener("submit", submit);
  elements.guess.addEventListener("click", guess);
  elements.guessCancel.addEventListener("click", () => select(state.selectedId));
  elements.giveUp.addEventListener("click", giveUp);
  elements.newRound.addEventListener("click", start);
  elements.numbers.addEventListener("change", renderBoard);
  start();
})();
