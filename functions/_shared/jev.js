import { HttpError } from "./http.js";

// TypeSafe's System One API (the model Jev): many small typed judgments in one request.
// Questions in one request run in parallel and are answered by name. A Noul answer is the
// probability of "yes"; a Choice answer has a probability per option.
// https://docs.typesafe.ai/api
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
const TIMEOUT_MS = 20_000;

export async function askJev(env, { state, questions }) {
  if (!env.TYPESAFE_API_KEY) {
    throw new HttpError("The question games are not configured yet.", 503, "jev_not_configured");
  }
  const body = JSON.stringify({ model: JEV_MODEL, state, questions });
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
          "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      lastStatus = 0;
      continue;
    }
    if (response.ok) {
      const payload = await response.json();
      return {
        model: String(payload.model || JEV_MODEL),
        answers: payload.answers || {},
        inputTokens: Number(payload.usage?.input_tokens || 0),
      };
    }
    lastStatus = response.status;
    // Retry only what may pass a second time: rate limits and server trouble.
    if (response.status !== 429 && response.status < 500) {
      console.error("Jev request failed", response.status, (await response.text()).slice(0, 500));
      break;
    }
  }
  throw new HttpError(
    lastStatus === 429 ? "The game is busy. Try that again in a moment." : "The game could not read that question. Try again.",
    502,
    "jev_unavailable",
  );
}

// The probability of "yes" for a Noul answer, or null when it is missing.
export function noulOf(answers, name) {
  const value = Number(answers?.[name]?.noul);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}
