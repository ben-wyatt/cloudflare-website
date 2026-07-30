(() => {
  const elements = {
    loading: document.getElementById("wrapped-loading"),
    gate: document.getElementById("wrapped-gate"),
    gateMessage: document.getElementById("wrapped-gate-message"),
    app: document.getElementById("wrapped-app"),
    memberName: document.getElementById("wrapped-member-name"),
    groupName: document.getElementById("wrapped-group-name"),
    season: document.getElementById("wrapped-season"),
    editionStatus: document.getElementById("wrapped-edition-status"),
    ledger: document.getElementById("wrapped-ledger"),
    metadata: document.getElementById("wrapped-metadata"),
    stories: document.getElementById("wrapped-stories"),
  };
  if (!elements.loading) return;

  let storyNumber = 0;
  let currentPayload = null;
  let enriching = false;

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, options = {}) {
    const request = { credentials: "same-origin", headers: {}, ...options };
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

  function joinNames(people) {
    const names = (people || []).map((item) => item.username).filter(Boolean);
    if (names.length < 2) return names[0] || "Someone";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }

  function possessive(name) {
    return /s$/i.test(name) ? `${name}’` : `${name}’s`;
  }

  function plural(value, singular, pluralForm = `${singular}s`) {
    return `${value.toLocaleString()} ${value === 1 ? singular : pluralForm}`;
  }

  function formatDuration(durationMs) {
    const totalMinutes = Math.max(0, Math.round(Number(durationMs || 0) / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes} min`;
    return `${hours} hr${minutes ? ` ${minutes} min` : ""}`;
  }

  function releaseYear(record) {
    return String(record?.releaseDate || "").slice(0, 4);
  }

  function textParagraph(text, className = "") {
    const paragraph = document.createElement("p");
    paragraph.className = className;
    paragraph.textContent = text;
    return paragraph;
  }

  function recordList(records) {
    const unique = new Map();
    for (const record of records || []) {
      if (record?.spotifyId && !unique.has(record.spotifyId)) unique.set(record.spotifyId, record);
    }
    const list = document.createElement("ul");
    list.className = "wrapped-records";
    for (const record of unique.values()) {
      const item = document.createElement("li");
      item.className = "wrapped-record";
      const coverLink = document.createElement("a");
      coverLink.href = record.spotifyUrl;
      coverLink.target = "_blank";
      coverLink.rel = "noopener";
      coverLink.setAttribute("aria-label", `Open ${record.name} by ${record.artistName} in Spotify`);
      if (record.imageUrl) {
        const image = document.createElement("img");
        image.src = record.imageUrl;
        image.alt = `${record.name} album cover`;
        image.loading = "lazy";
        coverLink.append(image);
      } else {
        const placeholder = document.createElement("span");
        placeholder.className = "wrapped-record-placeholder";
        placeholder.textContent = "no cover";
        coverLink.append(placeholder);
      }

      const copy = document.createElement("div");
      copy.className = "wrapped-record-copy";
      const title = document.createElement("a");
      title.href = record.spotifyUrl;
      title.target = "_blank";
      title.rel = "noopener";
      title.textContent = record.name;
      const meta = document.createElement("span");
      const year = releaseYear(record);
      meta.textContent = `${record.artistName}${year ? ` · ${year}` : ""}`;
      copy.append(title, meta);
      item.append(coverLink, copy);
      list.append(item);
    }
    return list;
  }

  function addStory({ kicker, title, lede, detail = "", records = [] }) {
    storyNumber += 1;
    const article = document.createElement("article");
    article.className = "wrapped-story";
    const number = document.createElement("span");
    number.className = "wrapped-story-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = String(storyNumber).padStart(2, "0");

    const copy = document.createElement("div");
    copy.className = "wrapped-story-copy";
    const eyebrow = textParagraph(kicker, "wrapped-story-kicker");
    const heading = document.createElement("h2");
    heading.textContent = title;
    copy.append(eyebrow, heading, textParagraph(lede, "wrapped-story-lede"));
    if (detail) copy.append(textParagraph(detail, "wrapped-story-detail"));
    if (records.length) copy.append(recordList(records));
    article.append(number, copy);
    elements.stories.append(article);
  }

  function renderLedger(room) {
    const values = [
      [room.contributorCount, "listeners"],
      [room.pickCount, "picks"],
      [room.uniqueAlbumCount, "different records"],
      [room.noteWordCount, "words in the margins"],
    ];
    elements.ledger.replaceChildren(...values.map(([value, label]) => {
      const wrapper = document.createElement("div");
      wrapper.className = "wrapped-stat";
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = Number(value || 0).toLocaleString();
      wrapper.append(term, description);
      return wrapper;
    }));
  }

  function renderStories(payload) {
    storyNumber = 0;
    elements.stories.replaceChildren();
    const { room, sharedTaste, people, records, connections } = payload;
    if (!room.pickCount) {
      const empty = document.createElement("section");
      empty.className = "wrapped-empty";
      const heading = document.createElement("h2");
      heading.textContent = "The sleeves are still blank.";
      empty.append(
        heading,
        textParagraph("Once this group saves a few album picks, the coincidences will start appearing here."),
      );
      elements.stories.append(empty);
      return;
    }

    const closestPairs = sharedTaste.closestListeners || [];
    const closest = closestPairs[0];
    if (closest && closestPairs.length === 1) {
      const pair = joinNames(closest.listeners);
      addStory({
        kicker: closest.exactMatch ? "crate twins" : "same wavelength",
        title: `${pair} kept meeting in the stacks.`,
        lede: closest.exactMatch
          ? `Their album sets match exactly: all ${plural(closest.sharedCount, "record")}.`
          : `They shared ${plural(closest.sharedCount, "record")}—${closest.similarityPercent}% of everything between their two sets.`,
        detail: "Similarity uses shared album membership only. Where a pick appears on the page carries no weight.",
        records: closest.sharedAlbums,
      });
    } else if (closest) {
      addStory({
        kicker: "same wavelength · tie",
        title: `${closestPairs.length} pairs landed on the same frequency.`,
        lede: closestPairs.map((entry) => (
          `${joinNames(entry.listeners)} shared ${plural(entry.sharedCount, "record")} (${entry.similarityPercent}%)`
        )).join("; ").concat("."),
        detail: "Similarity uses shared album membership only. Where a pick appears on the page carries no weight.",
        records: closestPairs.flatMap((entry) => entry.sharedAlbums),
      });
    }

    const roomRecords = sharedTaste.roomRecords || [];
    if (roomRecords.length) {
      const topCount = roomRecords[0].listenerCount;
      addStory({
        kicker: roomRecords.length > 1 ? "the room records" : "the room record",
        title: roomRecords.length > 1
          ? `${roomRecords.length} records tied the room together.`
          : `${roomRecords[0].album.name} kept turning up.`,
        lede: roomRecords.length > 1
          ? `Each appeared in the album sets of ${plural(topCount, "listener", "listeners")}.`
          : `${joinNames(roomRecords[0].listeners)} all made space for it.`,
        records: roomRecords.map((entry) => entry.album),
      });
    }

    const longestRecords = records.longest || [];
    const longest = longestRecords[0];
    if (longest) {
      addStory({
        kicker: "the long sit",
        title: longestRecords.length === 1
          ? `${longest.name} asked for ${formatDuration(longest.totalDurationMs)}.`
          : `${longestRecords.length} records tied for the long sit.`,
        lede: longestRecords.length === 1
          ? `The longest album in the collection came from ${longest.artistName}.`
          : `Each runs ${formatDuration(longest.totalDurationMs)} from first track to last.`,
        detail: `Playing every different record once would take ${formatDuration(room.totalDurationMs)}.`,
        records: longestRecords,
      });
    }

    const writers = people.mostWords || [];
    if (writers.length) {
      const top = writers[0];
      const names = joinNames(writers.map((entry) => entry.person));
      const longestNote = people.longestNotes?.[0];
      addStory({
        kicker: writers.length > 1 ? "co-correspondents" : "liner-note correspondent",
        title: `${names} wrote the most in the margins.`,
        lede: writers.length > 1
          ? `They each left ${plural(top.wordCount, "word")} across their album and track notes.`
          : `${top.person.username} left ${plural(top.wordCount, "word")} across ${plural(top.noteCount, "note")}.`,
        detail: longestNote
          ? `The single longest note was ${possessive(longestNote.person.username)} ${plural(longestNote.wordCount, "word")} dispatch on ${longestNote.subject.name}.`
          : "",
        records: longestNote?.noteType === "album" ? [longestNote.subject] : [],
      });
    }

    const scouts = people.scouts || [];
    if (scouts.length) {
      const top = scouts[0];
      const names = joinNames(scouts.map((entry) => entry.person));
      addStory({
        kicker: "far edge of the crate",
        title: `${names} wandered furthest from the group.`,
        lede: scouts.length > 1
          ? `Each brought back ${plural(top.count, "record")} nobody else picked.`
          : `${top.person.username} brought back ${plural(top.count, "record")} nobody else picked.`,
        records: scouts.flatMap((entry) => entry.albums).slice(0, 8),
      });
    }

    const oldest = records.oldest?.[0];
    const newest = records.newest?.[0];
    const travelers = people.widestTimeSpans || [];
    if (oldest && newest) {
      const traveler = travelers[0];
      addStory({
        kicker: "time machine",
        title: `${releaseYear(oldest)} met ${releaseYear(newest)}.`,
        lede: oldest.spotifyId === newest.spotifyId
          ? `${oldest.name} set the room’s timestamp.`
          : `The shelves stretched from ${oldest.name} by ${oldest.artistName} to ${newest.name} by ${newest.artistName}.`,
        detail: traveler
          ? travelers
            .map((entry) => `${entry.person.username} covered ${entry.earliestYear}–${entry.latestYear}`)
            .join("; ")
            .concat(".")
          : "",
        records: oldest.spotifyId === newest.spotifyId ? [oldest] : [oldest, newest],
      });
    }

    const artistThread = connections.artistThreads?.[0];
    if (artistThread) {
      addStory({
        kicker: "same artist, different door",
        title: `${artistThread.artist.name} had more than one way into the room.`,
        lede: `${joinNames(artistThread.listeners)} chose ${plural(artistThread.albumCount, "different album")}.`,
        records: artistThread.albums,
      });
    }

    const pileOn = connections.favoritePileOns?.[0];
    if (pileOn) {
      addStory({
        kicker: "same song, same little heart",
        title: `${pileOn.track.name} got the group underline.`,
        lede: `${joinNames(pileOn.listeners)} independently marked it as a favorite track.`,
        records: pileOn.album ? [pileOn.album] : [],
      });
    }

    const crossover = connections.standoutCrossovers?.[0];
    if (crossover) {
      addStory({
        kicker: "single on one side, album on the other",
        title: `${crossover.track.name} crossed the aisle.`,
        lede: `${crossover.standoutListener.username} called out the song; ${joinNames(crossover.albumListeners)} chose the whole album.`,
      });
    }
  }

  function renderMetadata(payload, message = "") {
    elements.metadata.classList.remove("is-error");
    elements.metadata.replaceChildren();
    if (message) {
      elements.metadata.textContent = message;
      return;
    }
    if (payload.snapshot) {
      elements.metadata.textContent = "This edition is sealed; its stories will no longer change.";
      return;
    }
    if (!payload.metadataPending) {
      elements.metadata.textContent = "Spotify track lengths and artist credits are filled in.";
      return;
    }
    const text = document.createElement("span");
    text.textContent = `${plural(payload.metadataPending, "record")} still need full Spotify credits.`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Fill in two more";
    button.addEventListener("click", () => {
      void enrichBatch(false);
    });
    elements.metadata.append(text, button);
  }

  function renderPayload(payload) {
    currentPayload = payload;
    elements.groupName.textContent = payload.group.name;
    elements.season.textContent = payload.season;
    elements.editionStatus.textContent = payload.snapshot
      ? `Sealed edition · generated ${new Date(payload.generatedAt).toLocaleDateString()}`
      : payload.preparingSnapshot
        ? "Ballots are closed · preparing the sealed edition."
        : payload.seasonStatus === "locked"
          ? "Ballots are closed · final stories are taking shape."
          : "Live draft · these stories change as the group saves picks.";
    renderLedger(payload.room);
    renderStories(payload);
    renderMetadata(payload);
  }

  async function enrichBatch(automatic) {
    if (enriching || !currentPayload?.metadataPending || currentPayload.snapshot) return;
    enriching = true;
    renderMetadata(currentPayload, automatic
      ? "Quietly adding full Spotify credits for two records…"
      : "Adding full Spotify credits for two records…");
    try {
      await api("/api/wrapped", { method: "POST", body: { action: "enrich" } });
      const payload = await api("/api/wrapped");
      renderPayload(payload);
    } catch (error) {
      elements.metadata.classList.add("is-error");
      renderMetadata(currentPayload, `The social stats are ready. Spotify details can wait: ${error.message}`);
      elements.metadata.classList.add("is-error");
    } finally {
      enriching = false;
    }
  }

  function showGate(message) {
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.gate.hidden = false;
    if (message) elements.gateMessage.textContent = message;
  }

  async function start() {
    try {
      const session = await api("/api/auth/me");
      if (!session.authenticated) {
        showGate();
        return;
      }
      elements.memberName.textContent = session.user.username;
      const payload = await api("/api/wrapped");
      elements.loading.hidden = true;
      elements.gate.hidden = true;
      elements.app.hidden = false;
      renderPayload(payload);
      if (payload.metadataPending && !payload.snapshot) void enrichBatch(true);
    } catch (error) {
      showGate(error.message);
    }
  }

  void start();
})();
