(() => {
  // The countdown to the minigames. The middleware writes the opening time and the server's
  // clock into the page, so the count follows the server, not this device's clock.
  const root = document.getElementById("opening");
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const elements = { when: $("opening-when"), clock: $("opening-clock"), note: $("opening-note"), play: $("opening-play") };
  const opensAt = Date.parse(root.dataset.opensAt || "");
  const serverNow = Date.parse(root.dataset.serverNow || "");
  const offset = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
  const now = () => Date.now() + offset;
  const UNITS = [["days", 86400], ["hours", 3600], ["minutes", 60], ["seconds", 1]];
  const RELOAD_KEY = "record-club-opening-reload";
  const ZONE = "America/New_York";
  let timer = 0;
  let arrived = false;

  // "Opening at midnight Eastern, the start of Tuesday, December 1." or, for another hour,
  // "Opening Tuesday, December 1 at 8:00 PM EST."
  function describe(time) {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long", month: "long", day: "numeric" }).format(time);
    const clock = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(time);
    if (clock === "00:00") return `Opening at midnight Eastern, the start of ${day}.`;
    const at = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(time);
    return `Opening ${day} at ${at}.`;
  }

  function render(remaining) {
    let rest = Math.max(0, Math.ceil(remaining / 1000));
    for (const [unit, size] of UNITS) {
      const value = Math.floor(rest / size);
      rest -= value * size;
      $(`opening-${unit}`).textContent = unit === "days" ? String(value) : String(value).padStart(2, "0");
      $(`opening-${unit}-label`).textContent = value === 1 ? unit.slice(0, -1) : unit;
    }
  }

  function showOpen() {
    elements.when.textContent = "The minigames are open.";
    elements.clock.hidden = true;
    elements.note.hidden = true;
    elements.play.hidden = false;
  }

  function readReload() {
    try { return Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { return 0; }
  }

  // At zero, load the page again: the server now lets the member in. A second reload within a
  // minute waits longer, in case the server needs a moment.
  function arrive() {
    if (arrived) return;
    arrived = true;
    elements.when.textContent = "Opening…";
    const wait = Date.now() - readReload() < 60000 ? 10000 : 1500;
    setTimeout(() => {
      try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* private mode */ }
      if (window.location.pathname.replace(/\/?$/, "/") === "/records/opening/") window.location.assign("/records/games/");
      else window.location.reload();
    }, wait);
  }

  function tick() {
    window.clearTimeout(timer);
    const remaining = opensAt - now();
    render(remaining);
    if (remaining <= 0) {
      arrive();
      return;
    }
    // Wake just after the shown second changes.
    timer = window.setTimeout(tick, (remaining % 1000 || 1000) + 30);
  }

  if (!Number.isFinite(opensAt)) {
    elements.note.hidden = true;
    return;
  }
  if (opensAt <= now()) {
    showOpen();
    return;
  }
  elements.when.textContent = describe(new Date(opensAt));
  elements.clock.hidden = false;
  tick();
  // Phones pause timers in background tabs; catch up when the page is seen again.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !arrived) tick();
  });
})();
