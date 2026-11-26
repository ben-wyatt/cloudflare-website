import { opensAt } from "./record-access.js";

// The countdown page (src/record-opening.njk), shown in place of the minigames until they open.
export const OPENING_PATH = "/records/opening/";

// Writes the opening time and the server's clock into the page. The page counts down with the
// server's clock, so a phone set a minute fast does not reload before the games open.
export async function withOpeningTime(response, env, now, status = response.status) {
  const opening = opensAt(env);
  const html = (await response.text())
    .replace('data-opens-at=""', `data-opens-at="${opening ? opening.toISOString() : ""}"`)
    .replace('data-server-now=""', `data-server-now="${new Date(now).toISOString()}"`);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("cache-control", "private, no-store");
  return new Response(html, { status, headers });
}
