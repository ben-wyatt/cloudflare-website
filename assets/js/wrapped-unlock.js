// Records Wrapped opens after a member finishes enough game rounds, because Wrapped and the
// full lists give away the games' answers. This draws that progress wherever it appears:
// a card on the ballot, games and locked pages, a chip in the game bar, and a line under a
// finished round. The server decides; this only shows { required, played, unlocked }.
(() => {
  const GAMES = [
    { href: "/records/game/", name: "Whose Wax?" },
    { href: "/records/match/", name: "Staff Picks" },
    { href: "/records/guess/", name: "Flip Side" },
  ];

  const plural = (count, singular, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm);

  function make(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function link(href, text, className = "") {
    const anchor = make("a", className, text);
    anchor.href = href;
    return anchor;
  }

  function progress(unlock) {
    const required = Math.max(Number(unlock?.required || 0), 1);
    const played = Math.max(Number(unlock?.played || 0), 0);
    return {
      required,
      played,
      shown: Math.min(played, required),
      remaining: Math.max(required - played, 0),
      unlocked: Boolean(unlock?.unlocked),
      noGames: Boolean(unlock?.noGames),
    };
  }

  function meter(state, className = "wrapped-unlock-meter") {
    const bar = make("span", className);
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Rounds played toward Liner Notes");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(state.required));
    bar.setAttribute("aria-valuenow", String(state.shown));
    bar.setAttribute("aria-valuetext", `${state.shown} of ${state.required} rounds`);
    for (let index = 0; index < state.required; index += 1) {
      const cell = make("span");
      if (index < state.shown || state.unlocked) cell.className = "is-filled";
      bar.append(cell);
    }
    return bar;
  }

  // The card. A `.wrapped-unlock-why` paragraph already in the container (page copy from
  // record-club-copy.md) is kept and shown while Wrapped is locked.
  function renderCard(container, unlock) {
    if (!container || !unlock) return;
    const state = progress(unlock);
    const why = container.querySelector(".wrapped-unlock-why");
    container.replaceChildren();
    container.classList.add("wrapped-unlock");
    container.dataset.state = state.unlocked ? "unlocked" : "locked";

    const head = make("div", "wrapped-unlock-head");
    head.append(make("p", "wrapped-unlock-eyebrow", state.unlocked ? "records wrapped · unlocked" : "records wrapped · locked"));
    if (!state.noGames) {
      const count = make("p", "wrapped-unlock-count");
      count.append(make("strong", "", String(state.shown)), ` / ${state.required} rounds`);
      head.append(count);
    }
    container.append(head);

    container.append(make(
      "h2",
      "wrapped-unlock-title",
      state.unlocked
        ? "Your Liner Notes are open."
        : `Play ${state.remaining} more ${plural(state.remaining, "round")} to unlock Liner Notes.`,
    ));
    if (!state.noGames) container.append(meter(state));

    if (state.noGames) {
      container.append(make("p", "wrapped-unlock-note", "Your group doesn’t have enough picks for the games yet, so Wrapped opened without them."));
    } else if (why) {
      why.hidden = state.unlocked;
      container.append(why);
    }

    const actions = make("p", "wrapped-unlock-actions");
    if (state.unlocked) {
      actions.append(
        link("/records/wrapped/", "Open Liner Notes →", "wrapped-unlock-primary"),
        link("/records/lists/", "Everyone’s lists →"),
      );
    } else {
      GAMES.forEach((game, index) => {
        actions.append(link(game.href, `Play ${game.name} →`, index === 0 ? "wrapped-unlock-primary" : ""));
      });
    }
    container.append(actions);
    container.hidden = false;
  }

  // The chip in a game's top bar. It always leads to Wrapped; a locked Wrapped explains itself.
  function renderChip(chip, unlock, { justUnlocked = false } = {}) {
    if (!chip || !unlock) return;
    const state = progress(unlock);
    chip.replaceChildren();
    chip.classList.add("wrapped-unlock-chip");
    chip.href = "/records/wrapped/";
    chip.dataset.state = state.unlocked ? "unlocked" : "locked";
    chip.classList.toggle("is-just-unlocked", justUnlocked);
    if (state.unlocked) {
      chip.append("Liner Notes unlocked →");
      chip.setAttribute("aria-label", "Liner Notes are unlocked. Open them.");
    } else {
      chip.append(make("span", "wrapped-unlock-chip-label", "Wrapped"), meter(state, "wrapped-unlock-meter is-mini"), make("span", "", `${state.shown}/${state.required}`));
      chip.setAttribute("aria-label", `Liner Notes unlock after ${state.required} rounds; you have played ${state.shown}.`);
    }
    chip.hidden = false;
  }

  // The line under a finished round: how far is left, or the moment Wrapped opens.
  function renderMoment(element, unlock) {
    if (!element) return;
    element.replaceChildren();
    element.classList.remove("is-unlocked");
    const state = progress(unlock);
    if (!unlock || state.noGames || (state.unlocked && !unlock.justUnlocked)) {
      element.hidden = true;
      return;
    }
    if (unlock.justUnlocked) {
      element.classList.add("is-unlocked");
      element.append(
        make("strong", "", "Liner Notes are unlocked."),
        ` That was round ${state.played}. `,
        link("/records/wrapped/", "Open Liner Notes →"),
      );
    } else {
      element.append(`${state.remaining} more ${plural(state.remaining, "round")} to unlock Liner Notes.`);
    }
    element.hidden = false;
  }

  function hideMoment(element) {
    if (!element) return;
    element.hidden = true;
    element.replaceChildren();
  }

  // Pages without their own script (the games list) mark a card with data-wrapped-unlock-auto.
  async function autoMount() {
    const cards = [...document.querySelectorAll("[data-wrapped-unlock-auto]")];
    const tags = [...document.querySelectorAll("[data-wrapped-unlock-tag]")];
    if (!cards.length && !tags.length) return;
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!response.ok) return;
      const session = await response.json();
      const unlock = session?.user?.recordClub?.wrappedUnlock;
      if (!unlock) return;
      cards.forEach((card) => renderCard(card, unlock));
      const state = progress(unlock);
      tags.forEach((tag) => {
        tag.textContent = state.unlocked ? "unlocked" : `locked · ${state.shown} / ${state.required} rounds`;
        tag.dataset.state = state.unlocked ? "unlocked" : "locked";
        tag.hidden = false;
      });
    } catch {
      // The page works without the card; the Wrapped page explains the lock itself.
    }
  }

  window.RecordClubUnlock = { renderCard, renderChip, renderMoment, hideMoment };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void autoMount());
  } else {
    void autoMount();
  }
})();
