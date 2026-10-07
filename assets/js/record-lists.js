(() => {
  const elements = {
    loading: document.getElementById("lists-loading"),
    gate: document.getElementById("lists-gate"),
    gateMessage: document.getElementById("lists-gate-message"),
    app: document.getElementById("lists-app"),
    memberName: document.getElementById("lists-member-name"),
    season: document.getElementById("lists-season"),
    search: document.getElementById("lists-search"),
    searchForm: document.getElementById("lists-search-form"),
    count: document.getElementById("lists-count"),
    members: document.getElementById("lists-members"),
    people: document.getElementById("lists-people"),
  };
  if (!elements.loading) return;
  let data = null;

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

  function spotifyLink(kind, id, label) {
    const link = element("a", "", label);
    link.href = `https://open.spotify.com/${kind}/${encodeURIComponent(id)}`;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  }

  function noteMatches(item, query) {
    return [item.name, item.artistName, item.albumName, item.review]
      .some((value) => String(value || "").toLocaleLowerCase().includes(query));
  }

  function render() {
    if (!data) return;
    const query = elements.search.value.trim().toLocaleLowerCase();
    const memberNodes = [];
    const peopleNodes = [];
    let shownAlbums = 0;

    for (const member of data.members) {
      const allAlbums = data.albums.filter((row) => row.userId === member.userId);
      const allStandouts = data.standouts.filter((row) => row.userId === member.userId);
      const albums = allAlbums.filter((row) => noteMatches(row, query)
        || data.favorites.some((favorite) => favorite.userId === member.userId
          && favorite.albumSpotifyId === row.spotifyId && noteMatches(favorite, query)));
      const standouts = allStandouts.filter((row) => noteMatches(row, query));
      if (query && !albums.length && !standouts.length) continue;
      shownAlbums += albums.length;

      const section = element("section", "wrapped-person-list");
      section.id = `member-${member.userId}`;
      const heading = element("h2", "", member.username);
      const count = element("p", "wrapped-list-count",
        `${allAlbums.length} ${allAlbums.length === 1 ? "record" : "records"} · ${allStandouts.length} standout ${allStandouts.length === 1 ? "track" : "tracks"}`);
      section.append(heading, count);
      const jump = element("a", "", member.username);
      jump.href = `#member-${member.userId}`;
      memberNodes.push(jump);

      if (albums.length) {
        const albumHeading = element("h3", "wrapped-list-subheading", "Albums");
        section.append(albumHeading);
        for (const row of albums) {
          const article = element("article", "wrapped-list-entry");
          article.id = `album-note-${member.userId}-${row.spotifyId}`;
          const title = element("h4");
          title.append(spotifyLink("album", row.spotifyId, row.name));
          const meta = element("p", "wrapped-list-meta", row.artistName
            + (row.releaseDate ? ` · ${String(row.releaseDate).slice(0, 4)}` : ""));
          article.append(title, meta);
          if (row.review?.trim()) article.append(element("p", "wrapped-list-note", row.review.trim()));
          const favorites = data.favorites.filter((favorite) =>
            favorite.userId === member.userId && favorite.albumSpotifyId === row.spotifyId);
          if (favorites.length) {
            const label = element("p", "wrapped-list-meta", "Favorite tracks");
            const list = element("ul", "wrapped-list-tracks");
            for (const favorite of favorites) {
              const item = element("li");
              item.append(spotifyLink("track", favorite.spotifyId,
                favorite.name || "Saved favorite track"));
              list.append(item);
            }
            article.append(label, list);
          }
          section.append(article);
        }
      } else if (!query) {
        section.append(element("p", "wrapped-list-meta", "No albums saved yet."));
      }

      if (standouts.length) {
        section.append(element("h3", "wrapped-list-subheading", "Standout tracks"));
        for (const row of standouts) {
          const article = element("article", "wrapped-list-entry");
          article.id = `track-note-${member.userId}-${row.spotifyId}`;
          const title = element("h4");
          title.append(spotifyLink("track", row.spotifyId, row.name));
          article.append(title, element("p", "wrapped-list-meta",
            `${row.artistName}${row.albumName ? ` · ${row.albumName}` : ""}`));
          if (row.review?.trim()) article.append(element("p", "wrapped-list-note", row.review.trim()));
          section.append(article);
        }
      }
      peopleNodes.push(section);
    }

    elements.members.replaceChildren(...memberNodes);
    elements.people.replaceChildren(...peopleNodes);
    elements.count.textContent = query
      ? `${shownAlbums} matching ${shownAlbums === 1 ? "record" : "records"} across ${peopleNodes.length} ${peopleNodes.length === 1 ? "member" : "members"}.`
      : `${data.albums.length} records across ${data.members.length} members.`;
    if (!peopleNodes.length) elements.people.append(element("p", "wrapped-empty", "Nothing in the room matches that search."));
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
      elements.memberName.textContent = session.user.username;
      data = await api("/api/group-lists");
      elements.season.textContent = data.season;
      elements.search.value = new URL(location.href).searchParams.get("q") || "";
      elements.searchForm.addEventListener("submit", (event) => event.preventDefault());
      elements.search.addEventListener("input", () => {
        const url = new URL(location.href);
        if (elements.search.value.trim()) url.searchParams.set("q", elements.search.value.trim());
        else url.searchParams.delete("q");
        history.replaceState(null, "", url);
        render();
      });
      elements.loading.hidden = true;
      elements.app.hidden = false;
      render();
      if (location.hash) {
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        target?.scrollIntoView();
      }
    } catch (error) {
      showGate(error.message);
    }
  }

  void start();
})();
