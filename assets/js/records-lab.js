(() => {
  // The lab remembers which group's picks to play with, and adds it to every link.
  const KEY = "recordLabGroup";
  const groups = ["badabing", "development"];
  const saved = localStorage.getItem(KEY);
  let group = groups.includes(saved) ? saved : groups[0];

  function render() {
    for (const button of document.querySelectorAll("[data-lab-group]")) {
      button.setAttribute("aria-pressed", String(button.dataset.labGroup === group));
    }
    for (const link of document.querySelectorAll("[data-lab-link]")) {
      const url = new URL(link.getAttribute("href"), window.location.origin);
      url.searchParams.set("group", group);
      link.href = `${url.pathname}${url.search}`;
    }
  }

  for (const button of document.querySelectorAll("[data-lab-group]")) {
    button.addEventListener("click", () => {
      group = button.dataset.labGroup;
      localStorage.setItem(KEY, group);
      render();
    });
  }
  render();
})();
