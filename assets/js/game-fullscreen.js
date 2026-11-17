// Full screen for the Record Club games: the button in the member bar or the F key
// puts the game (the [data-fullscreen-target] element) in full screen and back.
(() => {
  const target = document.querySelector("[data-fullscreen-target]");
  const button = document.querySelector("[data-fullscreen-toggle]");
  if (!target || !button) return;

  const request = target.requestFullscreen || target.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
  // iPhone Safari cannot put a page element in full screen; leave the button hidden there.
  if (!enabled || !request || !exit) return;

  const ICONS = {
    enter: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    exit: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  };

  const active = () => (document.fullscreenElement || document.webkitFullscreenElement) === target;

  function sync() {
    const on = active();
    button.innerHTML = on ? ICONS.exit : ICONS.enter;
    button.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "Exit full screen (F)" : "Full screen (F)";
  }

  async function toggle() {
    try {
      if (active()) await exit.call(document);
      else await request.call(target);
    } catch {
      // Some browsers refuse full screen; the game still works in the page.
    }
  }

  const typing = (node) => node instanceof HTMLElement
    && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName));

  button.addEventListener("click", toggle);
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "f" || event.repeat) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || typing(event.target)) return;
    if (target.hidden || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    void toggle();
  });
  sync();
  button.hidden = false;
})();
