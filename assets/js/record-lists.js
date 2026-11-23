(() => {
  const byId = (id) => document.getElementById(id);
  const elements = {
    loading: byId("lists-loading"),
    gate: byId("lists-gate"),
    gateMessage: byId("lists-gate-message"),
    app: byId("lists-app"),
    memberName: byId("lists-member-name"),
    allLink: byId("lists-all-link"),
    room: byId("lists-room"),
    roomTitle: byId("lists-title"),
    search: byId("lists-search"),
    searchForm: byId("lists-search-form"),
    count: byId("lists-count"),
    shelves: byId("lists-shelves"),
    waiting: byId("lists-waiting"),
    results: byId("lists-results"),
    person: byId("lists-person"),
    personName: byId("lists-person-name"),
    personPosition: byId("lists-person-position"),
    personSummary: byId("lists-person-summary"),
    personBody: byId("lists-person-body"),
    pager: byId("lists-pager"),
  };
  if (!elements.loading) return;
  const baseTitle = document.title;
  let data = null;
  let people = [];
  let viewerName = "";

  async function api(path) {
    const response = await fetch(path, { credentials: "same-origin" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "The room could not be opened.");
    return payload;
  }

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const plural = (count, singular, pluralForm = `${singular}s`) =>
    `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
  const listUrl = (username) => `/records/lists/?member=${encodeURIComponent(username)}`;
  const wordCount = (value) =>
    (String(value || "").match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

  function spotifyLink(kind, id, label) {
    const link = element("a", "", label);
    link.href = `https://open.spotify.com/${kind}/${encodeURIComponent(id)}`;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  }

  function memberLink(href, label, className = "") {
    const link = element("a", className, label);
    link.href = href;
    link.dataset.memberLink = "";
    return link;
  }

  function coverImage(imageUrl) {
    if (!imageUrl) return element("span", "wrapped-record-placeholder", "no cover");
    const image = element("img");
    image.src = imageUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  }

  // The same shelf shape the Wrapped closing card receives from the server.
  function shelfFor(person) {
    return {
      username: person.username,
      href: listUrl(person.username),
      albumCount: person.albums.length,
      standoutCount: person.standouts.length,
      covers: person.albums.filter((row) => row.imageUrl).slice(0, 4),
    };
  }

  function shelfLink(shelf) {
    const link = memberLink(shelf.href, "", "wrapped-shelf");
    const covers = element("span", `wrapped-shelf-covers${shelf.covers.length >= 4 ? " is-grid" : ""}`);
    covers.setAttribute("aria-hidden", "true");
    if (shelf.covers.length >= 4) covers.append(...shelf.covers.slice(0, 4).map((cover) => coverImage(cover.imageUrl)));
    else if (shelf.covers.length) covers.append(coverImage(shelf.covers[0].imageUrl));
    else covers.append(element("span", "wrapped-record-placeholder", "no covers yet"));
    const counts = [plural(shelf.albumCount, "record")];
    if (shelf.standoutCount) counts.push(plural(shelf.standoutCount, "track"));
    link.append(covers, element("span", "wrapped-shelf-name", shelf.username),
      element("span", "wrapped-shelf-count", counts.join(" · ")));
    link.setAttribute("aria-label",
      `${shelf.username}${shelf.username === viewerName ? " (you)" : ""}: ${counts.join(", ")}`);
    const item = element("li");
    item.append(link);
    return item;
  }

  function entryWithCover(article, kind, row) {
    article.classList.add("has-cover");
    const art = element("a", "wrapped-list-cover");
    art.href = `https://open.spotify.com/${kind}/${encodeURIComponent(row.spotifyId)}`;
    art.target = "_blank";
    art.rel = "noopener";
    art.tabIndex = -1;
    art.setAttribute("aria-hidden", "true");
    art.append(coverImage(row.imageUrl));
    const copy = element("div", "wrapped-list-entry-copy");
    article.append(art, copy);
    return copy;
  }

  function albumEntry(person, row, headingTag) {
    const article = element("article", "wrapped-list-entry");
    article.id = `album-note-${person.userId}-${row.spotifyId}`;
    const copy = entryWithCover(article, "album", row);
    const title = element(headingTag);
    title.append(spotifyLink("album", row.spotifyId, row.name));
    copy.append(title, element("p", "wrapped-list-meta", row.artistName
      + (row.releaseDate ? ` · ${String(row.releaseDate).slice(0, 4)}` : "")));
    if (row.review?.trim()) copy.append(element("p", "wrapped-list-note", row.review.trim()));
    const favorites = person.favorites.filter((favorite) => favorite.albumSpotifyId === row.spotifyId);
    if (favorites.length) {
      const list = element("ul", "wrapped-list-tracks");
      for (const favorite of favorites) {
        const item = element("li");
        item.append(spotifyLink("track", favorite.spotifyId, favorite.name || "Saved favorite track"));
        list.append(item);
      }
      copy.append(element("p", "wrapped-list-meta",
        favorites.length === 1 ? "Favorite track" : "Favorite tracks"), list);
    }
    return article;
  }

  function trackEntry(person, row, headingTag) {
    const article = element("article", "wrapped-list-entry");
    article.id = `track-note-${person.userId}-${row.spotifyId}`;
    const copy = entryWithCover(article, "track", row);
    const title = element(headingTag);
    title.append(spotifyLink("track", row.spotifyId, row.name));
    copy.append(title, element("p", "wrapped-list-meta",
      `${row.artistName}${row.albumName ? ` · ${row.albumName}` : ""}`));
    if (row.review?.trim()) copy.append(element("p", "wrapped-list-note", row.review.trim()));
    return article;
  }

  function matches(row, query) {
    return [row.name, row.artistName, row.albumName, row.review]
      .some((value) => String(value || "").toLocaleLowerCase().includes(query));
  }

  function setSeason(season) {
    for (const node of document.querySelectorAll("[data-lists-season]")) node.textContent = season;
  }

  function showView(view) {
    elements.room.hidden = view !== "room";
    elements.person.hidden = view !== "person";
    elements.allLink.hidden = view !== "person";
  }

  function renderRoom() {
    showView("room");
    document.title = baseTitle;
    const query = elements.search.value.trim().toLocaleLowerCase();
    const listed = people.filter((person) => person.albums.length || person.standouts.length);
    const waiting = people.filter((person) => !person.albums.length && !person.standouts.length);
    elements.shelves.hidden = Boolean(query);
    elements.waiting.hidden = Boolean(query) || !waiting.length;
    elements.results.hidden = !query;

    if (!query) {
      elements.shelves.replaceChildren(...listed.map((person) => shelfLink(shelfFor(person))));
      elements.waiting.textContent = waiting.length
        ? `Still choosing: ${waiting.map((person) => person.username).join(", ")}.`
        : "";
      elements.count.textContent = listed.length
        ? `${plural(data.albums.length, "record")} across ${plural(listed.length, "list")}. Choose one to read it in full.`
        : "Nobody has saved a record yet.";
      elements.results.replaceChildren();
      return;
    }

    const sections = [];
    let shownAlbums = 0;
    let shownTracks = 0;
    for (const person of people) {
      const albums = person.albums.filter((row) => matches(row, query)
        || person.favorites.some((favorite) => favorite.albumSpotifyId === row.spotifyId
          && matches(favorite, query)));
      const standouts = person.standouts.filter((row) => matches(row, query));
      if (!albums.length && !standouts.length) continue;
      shownAlbums += albums.length;
      shownTracks += standouts.length;
      const section = element("section", "wrapped-person-list");
      const heading = element("h2");
      heading.append(memberLink(listUrl(person.username), person.username));
      section.append(heading, element("p", "wrapped-list-count",
        `${plural(albums.length, "matching record")}${standouts.length ? ` · ${plural(standouts.length, "matching track")}` : ""}`));
      if (albums.length) {
        section.append(element("h3", "wrapped-list-subheading", "Albums"),
          ...albums.map((row) => albumEntry(person, row, "h4")));
      }
      if (standouts.length) {
        section.append(element("h3", "wrapped-list-subheading", "Standout tracks"),
          ...standouts.map((row) => trackEntry(person, row, "h4")));
      }
      sections.push(section);
    }
    elements.results.replaceChildren(...sections);
    if (!sections.length) elements.results.append(element("p", "wrapped-empty", "Nothing in the room matches that search."));
    elements.count.textContent = sections.length
      ? `${plural(shownAlbums, "record")}${shownTracks ? ` and ${plural(shownTracks, "track")}` : ""} across ${plural(sections.length, "list")} match.`
      : "";
  }

  function pagerLink(person, direction) {
    const wrapper = element("p", `wrapped-list-pager-${direction}`);
    if (!person) return wrapper;
    const label = element("span", "wrapped-list-pager-label", direction === "previous" ? "previous" : "next");
    const link = memberLink(listUrl(person.username),
      direction === "previous" ? `← ${person.username}` : `${person.username} →`);
    link.rel = direction === "previous" ? "prev" : "next";
    wrapper.append(label, link);
    return wrapper;
  }

  function renderPerson(person, requestedName) {
    showView("person");
    elements.personBody.replaceChildren();
    elements.pager.replaceChildren();
    if (!person) {
      document.title = baseTitle;
      elements.personPosition.textContent = "";
      elements.personName.textContent = "No list here";
      elements.personSummary.textContent = `Nobody in this room goes by “${requestedName}”.`;
      const back = element("p");
      back.append(memberLink("/records/lists/", "See everyone’s lists →"));
      elements.personBody.append(back);
      return;
    }

    document.title = `${person.username}’s list · Record Club`;
    const listed = people.filter((entry) => entry.albums.length || entry.standouts.length);
    const index = listed.indexOf(person);
    elements.personPosition.textContent = index >= 0 ? ` · list ${index + 1} of ${listed.length}` : "";
    elements.personName.textContent = person.username;
    const words = [...person.albums, ...person.standouts]
      .reduce((total, row) => total + wordCount(row.review), 0);
    const parts = [plural(person.albums.length, "record"), plural(person.standouts.length, "standout track")];
    if (words) parts.push(plural(words, "word") + " of notes");
    elements.personSummary.textContent = `${person.username === viewerName ? "Your list: " : ""}${
      parts.length === 3 ? `${parts[0]}, ${parts[1]}, and ${parts[2]}` : `${parts[0]} and ${parts[1]}`}.`;

    elements.personBody.append(element("h2", "wrapped-list-subheading", "Albums"));
    if (person.albums.length) {
      elements.personBody.append(...person.albums.map((row) => albumEntry(person, row, "h3")));
    } else {
      elements.personBody.append(element("p", "wrapped-list-meta", "No albums saved yet."));
    }
    if (person.standouts.length) {
      elements.personBody.append(element("h2", "wrapped-list-subheading", "Standout tracks"),
        ...person.standouts.map((row) => trackEntry(person, row, "h3")));
    }

    const all = element("p", "wrapped-list-pager-all");
    all.append(memberLink("/records/lists/", "All lists"));
    elements.pager.append(
      pagerLink(index > 0 ? listed[index - 1] : null, "previous"),
      all,
      pagerLink(index >= 0 && index < listed.length - 1 ? listed[index + 1] : null, "next"),
    );
  }

  function route() {
    const params = new URL(location.href).searchParams;
    if (params.has("member")) {
      const requested = params.get("member").trim();
      const person = people.find((entry) =>
        entry.username.toLocaleLowerCase() === requested.toLocaleLowerCase());
      renderPerson(person, requested);
      return elements.personName;
    }
    elements.search.value = params.get("q") || "";
    renderRoom();
    return elements.roomTitle;
  }

  function scrollToHash() {
    if (!location.hash) return false;
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    target?.scrollIntoView();
    return Boolean(target);
  }

  function navigate(href) {
    history.pushState(null, "", href);
    const heading = route();
    if (!scrollToHash()) window.scrollTo(0, 0);
    heading.focus({ preventScroll: true });
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
      if (!session.authenticated || !session.user.recordClubOwner) return showGate();
      viewerName = session.user.username;
      elements.memberName.textContent = viewerName;
      data = await api("/api/group-lists");
      setSeason(data.season);
      people = data.members.map((member) => ({
        ...member,
        albums: data.albums.filter((row) => row.userId === member.userId),
        standouts: data.standouts.filter((row) => row.userId === member.userId),
        favorites: data.favorites.filter((row) => row.userId === member.userId),
      }));

      elements.searchForm.addEventListener("submit", (event) => event.preventDefault());
      elements.search.addEventListener("input", () => {
        const url = new URL(location.href);
        url.searchParams.delete("member");
        url.hash = "";
        if (elements.search.value.trim()) url.searchParams.set("q", elements.search.value.trim());
        else url.searchParams.delete("q");
        history.replaceState(null, "", url);
        renderRoom();
      });
      // Moving between lists keeps the loaded data instead of fetching the room again.
      document.addEventListener("click", (event) => {
        const link = event.target.closest?.("a[data-member-link]");
        if (!link || event.defaultPrevented || event.button !== 0
          || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(link.href);
      });
      window.addEventListener("popstate", () => {
        route();
        scrollToHash();
      });

      elements.loading.hidden = true;
      elements.app.hidden = false;
      route();
      scrollToHash();
    } catch (error) {
      showGate(error.message);
    }
  }

  void start();
})();
