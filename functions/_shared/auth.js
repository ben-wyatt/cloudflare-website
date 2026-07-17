import { HttpError, requireDb } from "./http.js";

const SESSION_COOKIE = "record_session";
const SESSION_DAYS = 30;
// Cloudflare Workers WebCrypto currently caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateUsername(username) {
  return /^[a-z0-9_-]{3,24}$/.test(username);
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PASSWORD_ITERATIONS,
    },
    keyMaterial,
    256,
  );

  return {
    hash: encodeBase64Url(new Uint8Array(bits)),
    salt: encodeBase64Url(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password, storedHash, storedSalt, storedIterations) {
  const salt = decodeBase64Url(storedSalt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: Number(storedIterations),
    },
    keyMaterial,
    256,
  );

  return constantTimeEqual(new Uint8Array(bits), decodeBase64Url(storedHash));
}

export async function verifyAccessCode(candidate, expected) {
  if (!expected) return false;
  const [candidateHash, expectedHash] = await Promise.all([sha256(String(candidate || "")), sha256(expected)]);
  return constantTimeEqual(candidateHash, expectedHash);
}

export async function resolveAccessGroup(env, candidate) {
  const configuredGroups = [
    { groupId: "friends", accessCode: env.SIGNUP_ACCESS_CODE },
    { groupId: "development", accessCode: env.DEV_ENVIRONMENT_ACCESS_CODE },
    { groupId: "ey-mt-juniors", accessCode: env.EY_MT_JUNIORS_ACCESS_CODE },
  ].filter((group) => group.accessCode);

  if (!configuredGroups.length) return { configured: false, groupId: null };

  const matches = await Promise.all(
    configuredGroups.map((group) => verifyAccessCode(candidate, group.accessCode)),
  );
  const matchIndex = matches.findIndex(Boolean);
  return {
    configured: true,
    groupId: matchIndex === -1 ? null : configuredGroups[matchIndex].groupId,
  };
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    const key = cookie.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(cookie.slice(separator + 1).trim());
  }
  return null;
}

function cookieAttributes(request, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSession(env, request, userId) {
  const db = requireDb(env);
  const sessionToken = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = encodeBase64Url(await sha256(sessionToken));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.batch([
    db.prepare("DELETE FROM record_sessions WHERE expires_at <= ?").bind(now.toISOString()),
    db.prepare(
      `INSERT INTO record_sessions (token_hash, user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(tokenHash, userId, now.toISOString(), expiresAt.toISOString()),
  ]);

  return `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; ${cookieAttributes(request, SESSION_DAYS * 24 * 60 * 60)}`;
}

export async function getSessionUser(env, request) {
  const sessionToken = getCookie(request, SESSION_COOKIE);
  if (!sessionToken) return null;

  const db = requireDb(env);
  const tokenHash = encodeBase64Url(await sha256(sessionToken));
  const user = await db.prepare(
    `SELECT u.id, u.username, u.group_id AS groupId
     FROM record_sessions s
     JOIN record_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(tokenHash, new Date().toISOString()).first();

  return user || null;
}

export async function requireUser(env, request) {
  const user = await getSessionUser(env, request);
  if (!user) throw new HttpError("Please sign in to continue.", 401, "not_authenticated");
  return user;
}

export async function destroySession(env, request) {
  const sessionToken = getCookie(request, SESSION_COOKIE);
  if (sessionToken && env.DB) {
    const tokenHash = encodeBase64Url(await sha256(sessionToken));
    await env.DB.prepare("DELETE FROM record_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  return `${SESSION_COOKIE}=; ${cookieAttributes(request, 0)}`;
}
