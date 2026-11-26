(() => {
  // Flip Side: ask yes-or-no questions; records that do not fit flip over.
  const $ = (id) => document.getElementById(id);
  const elements = {
    loading: $("ask-loading"), gate: $("ask-gate"), gateMessage: $("ask-gate-message"), app: $("ask-app"),
    memberName: $("ask-member-name"),
    stats: [0, 1, 2].map((n) => ({ value: $(`ask-stat-${n}`), label: $(`ask-stat-${n}-label`) })),
    form: $("ask-form"), label: $("ask-label"), input: $("ask-input"), submit: $("ask-submit"),
    answer: $("ask-answer"), answerQuestion: $("ask-answer-question"), answerLine: $("ask-answer-line"),
    guessLine: $("ask-guess-line"), guessLabel: $("ask-guess-label"), guess: $("ask-guess"), guessCancel: $("ask-guess-cancel"),
    board: $("ask-board"), reveal: $("ask-reveal"),
    numbers: $("ask-numbers"), giveUp: $("ask-give-up"), newRound: $("ask-new"), history: $("ask-history"),
    unlockChip: $("ask-unlock-chip"), unlockMoment: $("ask-unlock-moment"),
  };
  if (!elements.loading) return;
  // Liner Notes progress (assets/js/wrapped-unlock.js): every finished round counts, won or not.
  const unlockView = window.RecordClubUnlock;

  const state = {
    roundId: "", cards: [], down: new Set(), selectedId: "", secretId: "",
    numbers: new Map(), questions: 0, guesses: 0, pending: false, finished: false,
  };

  async function api(body) {
    const response = await fetch("/api/guess", {
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

  function cover(card) {
    const image = element("img", "lab-card-cover");
    image.src = card.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    return image;
  }

  function renderStats() {
    const up = state.cards.length - state.down.size;
    [[up, "still up"], [state.questions, state.questions === 1 ? "question" : "questions"],
      [state.guesses, state.guesses === 1 ? "wrong guess" : "wrong guesses"]].forEach(([value, label], index) => {
      elements.stats[index].value.textContent = String(value);
      elements.stats[index].label.textContent = label;
    });
  }

  function renderBoard() {
    elements.board.replaceChildren();
    for (const card of state.cards) {
      const item = element("li", "lab-card");
      const button = element("button", "lab-card-button");
      button.type = "button";
      const down = state.down.has(card.id);
      item.classList.toggle("is-down", down);
      item.classList.toggle("is-selected", card.id === state.selectedId);
      item.classList.toggle("is-secret", card.id === state.secretId);
      button.disabled = state.finished || down;
      button.setAttribute("aria-label", `${card.title}, ${card.subtitle}${down ? ", turned over" : ""}`);
      button.append(cover(card));
      if (elements.numbers.checked && state.numbers.has(card.id)) {
        button.append(element("span", "lab-card-number", state.numbers.get(card.id).toFixed(2)));
      }
      button.addEventListener("click", () => select(card.id));
      const caption = element("span", "lab-card-caption");
      caption.append(element("strong", "", card.title), element("span", "", card.subtitle));
      item.append(button, caption);
      elements.board.append(item);
    }
    renderStats();
  }

  function select(id) {
    if (state.finished || state.pending || state.down.has(id)) return;
    state.selectedId = state.selectedId === id ? "" : id;
    const card = state.cards.find((item) => item.id === id);
    elements.guessLine.hidden = !state.selectedId;
    if (state.selectedId) elements.guessLabel.textContent = `${card.title} by ${card.subtitle}`;
    renderBoard();
  }

  function addHistory(text, answer, kind = "") {
    const item = element("li", `lab-history-item${kind ? ` is-${kind}` : ""}`);
    item.append(element("span", "lab-history-text", text), element("span", "lab-history-answer", answer));
    elements.history.prepend(item);
  }

  // kind: yes / probably / unsure / probably-not / no
  function showAnswer(question, word, detail = "", kind = "") {
    elements.answer.hidden = false;
    elements.answerQuestion.textContent = question ? `“${question}”` : "";
    elements.answerLine.textContent = detail ? `${word}. ${detail}` : word;
    elements.answerLine.classList.toggle("is-correct", kind === "yes" || kind === "probably");
    elements.answerLine.classList.toggle("is-wrong", kind === "no" || kind === "probably-not");
    elements.answerLine.classList.toggle("is-unsure", kind === "unsure");
    elements.answer.classList.remove("is-new");
    void elements.answer.offsetWidth;
    elements.answer.classList.add("is-new");
  }

  function renderReveal(reveal, solved, wrappedUnlock) {
    state.finished = true;
    state.selectedId = "";
    state.secretId = reveal?.id || "";
    elements.form.hidden = true;
    elements.guessLine.hidden = true;
    elements.giveUp.parentElement.hidden = true;
    elements.reveal.hidden = false;
    elements.reveal.replaceChildren();
    renderBoard();
    if (wrappedUnlock) {
      unlockView?.renderChip(elements.unlockChip, wrappedUnlock, { justUnlocked: Boolean(wrappedUnlock.justUnlocked) });
      unlockView?.renderMoment(elements.unlockMoment, wrappedUnlock);
    }
    if (!reveal) return;
    const headline = solved
      ? `found in ${state.questions} ${state.questions === 1 ? "question" : "questions"}${state.guesses ? ` and ${state.guesses} wrong ${state.guesses === 1 ? "guess" : "guesses"}` : ""}`
      : "the secret";
    elements.reveal.append(element("p", "records-eyebrow", headline));
    const head = element("div", "lab-reveal-head");
    head.append(cover(reveal));
    const copy = element("div", "lab-reveal-copy");
    const title = element("a", "lab-reveal-title", `${reveal.title} ↗`);
    title.href = reveal.spotifyUrl;
    title.target = "_blank";
    title.rel = "noopener";
    copy.append(title, element("p", "lab-reveal-subtitle", reveal.subtitle));
    if (reveal.pickers?.length) {
      const line = element("p", "lab-reveal-subtitle", "Picked by ");
      reveal.pickers.forEach((picker, index) => {
        const link = element("a", "", picker.username);
        link.href = picker.href;
        line.append(link);
        if (index < reveal.pickers.length - 1) line.append(", ");
      });
      copy.append(line);
    }
    head.append(copy);
    elements.reveal.append(head);
    for (const note of reveal.notes || []) {
      const quote = element("blockquote", "lab-reveal-note", note.note);
      quote.append(element("cite", "", ` — ${note.by}`));
      elements.reveal.append(quote);
    }
    const again = element("button", "records-text-button game-next");
    again.type = "button";
    again.append("New board ", element("kbd", "", "↵"));
    again.addEventListener("click", start);
    elements.reveal.append(again);
    again.focus({ preventScroll: true });
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
      state.numbers = new Map(result.judgments.filter((item) => item.p !== null).map((item) => [item.id, item.p]));
      if (result.notCounted) {
        showAnswer(text, "Yes or no?", result.label, "unsure");
        return;
      }
      state.questions += 1;
      result.turnedDown.forEach((id) => state.down.add(id));
      if (state.selectedId && state.down.has(state.selectedId)) select(state.selectedId);
      const turned = result.turnedDown.length;
      showAnswer(text, result.label,
        turned ? `${turned} ${turned === 1 ? "record turns" : "records turn"} over.` : "Nothing turns over.", result.answer);
      addHistory(text, result.label, result.answer);
      renderBoard();
      if (result.solved) renderReveal(result.reveal, true, result.wrappedUnlock);
    } catch (error) {
      showAnswer(text, "Hmm", error.message, "unsure");
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
    const question = `Is it ${card.title}?`;
    try {
      const result = await api({ action: "guess", roundId: state.roundId, id });
      state.selectedId = "";
      elements.guessLine.hidden = true;
      if (result.correct) {
        addHistory(question, "Yes", "yes");
        showAnswer(question, "Yes", "", "yes");
        renderReveal(result.reveal, true, result.wrappedUnlock);
      } else {
        state.guesses += 1;
        state.down.add(id);
        addHistory(question, "No", "no");
        showAnswer(question, "No", "It turns over.", "no");
        renderBoard();
      }
    } catch (error) {
      showAnswer(question, "Hmm", error.message, "unsure");
    } finally {
      state.pending = false;
    }
  }

  async function giveUp() {
    if (state.pending || state.finished) return;
    state.pending = true;
    try {
      const result = await api({ action: "give-up", roundId: state.roundId });
      renderReveal(result.reveal, false, result.wrappedUnlock);
    } catch (error) {
      showAnswer("", "Hmm", error.message, "unsure");
    } finally {
      state.pending = false;
    }
  }

  async function start() {
    Object.assign(state, {
      roundId: "", cards: [], down: new Set(), selectedId: "", secretId: "",
      numbers: new Map(), questions: 0, guesses: 0, pending: false, finished: false,
    });
    elements.answer.hidden = true;
    elements.reveal.hidden = true;
    elements.guessLine.hidden = true;
    elements.form.hidden = false;
    elements.giveUp.parentElement.hidden = false;
    elements.history.replaceChildren();
    try {
      const round = await api({ action: "new" });
      state.roundId = round.roundId;
      state.cards = round.cards;
      unlockView?.renderChip(elements.unlockChip, round.wrappedUnlock);
      unlockView?.hideMoment(elements.unlockMoment);
      elements.loading.hidden = true;
      elements.gate.hidden = true;
      elements.app.hidden = false;
      renderBoard();
      elements.input.focus({ preventScroll: true });
    } catch (error) {
      showGate(error.message);
    }
  }

  elements.label.textContent = "ask a yes-or-no question";
  elements.input.placeholder = "Is it by a band?";
  elements.form.addEventListener("submit", submit);
  elements.guess.addEventListener("click", guess);
  elements.guessCancel.addEventListener("click", () => select(state.selectedId));
  elements.giveUp.addEventListener("click", giveUp);
  elements.newRound.addEventListener("click", start);
  elements.numbers.addEventListener("change", renderBoard);
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then((response) => response.json())
    .then((session) => { elements.memberName.textContent = session?.user?.username || ""; })
    .catch(() => {});
  start();
})();
