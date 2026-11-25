import { getSessionUser } from "../../_shared/auth.js";
import { isLabUser } from "../../_shared/dev-lab.js";

// The lab pages exist only for the Record Club owners; everyone else gets a plain 404.
export async function onRequest(context) {
  const user = await getSessionUser(context.env, context.request);
  if (isLabUser(user)) return context.next();
  return new Response("Not found.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=UTF-8", "cache-control": "private, no-store" },
  });
}
