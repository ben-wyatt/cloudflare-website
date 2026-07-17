export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function apiError(message, status = 400, code = "bad_request") {
  return json({ error: { code, message } }, status);
}

export async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError("Expected a JSON request.", 415, "unsupported_media_type");
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError("The request body is not valid JSON.", 400, "invalid_json");
  }
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const requestUrl = new URL(request.url);
  if (origin !== requestUrl.origin) {
    throw new HttpError("This request came from an unexpected origin.", 403, "invalid_origin");
  }
}

export class HttpError extends Error {
  constructor(message, status = 400, code = "bad_request") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function handleApiError(error) {
  if (error instanceof HttpError) {
    return apiError(error.message, error.status, error.code);
  }

  console.error(error);
  return apiError("Something went wrong on the server.", 500, "server_error");
}

export function requireDb(env) {
  if (!env.DB) {
    throw new HttpError("The records database is not configured yet.", 503, "database_not_configured");
  }
  return env.DB;
}
