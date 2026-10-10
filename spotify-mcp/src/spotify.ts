export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: any;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
}

export const RESOURCE = "https://mcp.ben-wyatt.com/spotify";
export const CALLBACK = "https://mcp.ben-wyatt.com/callback";
export const SPOTIFY_SCOPE = "playlist-modify-private playlist-read-private";

type TokenRecord = { refreshToken: string; accessToken: string; expiresAt: number };

function keyFor(userId: string) {
  return `spotify:token:${userId}`;
}

async function encryptionKey(env: Env) {
  const bytes = Uint8Array.from(atob(env.TOKEN_ENCRYPTION_KEY), (character) => character.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("Token encryption key must be 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function saveToken(env: Env, userId: string, record: TokenRecord) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(env),
    plaintext,
  );
  const data = [...iv, ...new Uint8Array(ciphertext)];
  await env.OAUTH_KV.put(keyFor(userId), btoa(String.fromCharCode(...data)));
}

async function loadToken(env: Env, userId: string): Promise<TokenRecord> {
  const stored = await env.OAUTH_KV.get(keyFor(userId));
  if (!stored) throw new Error("Spotify authorization is missing. Reconnect this connector.");
  const bytes = Uint8Array.from(atob(stored), (character) => character.charCodeAt(0));
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(userId) },
    await encryptionKey(env),
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(clear));
}

export async function exchangeSpotifyCode(env: Env, code: string) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CALLBACK }),
  });
  if (!response.ok) throw new Error(`Spotify authorization failed (${response.status})`);
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!token.refresh_token) throw new Error("Spotify did not return a refresh token");
  return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
}

async function accessToken(env: Env, userId: string) {
  const token = await loadToken(env, userId);
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refreshToken }),
  });
  if (!response.ok) throw new Error(`Spotify token refresh failed (${response.status}); reconnect this connector`);
  const refreshed = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const updated = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || token.refreshToken,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
  };
  await saveToken(env, userId, updated);
  return updated.accessToken;
}

export async function spotifyApi<T>(env: Env, userId: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken(env, userId)}`, "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Spotify ${response.status}: ${body.error?.message || "request failed"}`);
  }
  return response.json() as Promise<T>;
}

export async function spotifyProfile(accessTokenValue: string) {
  const response = await fetch("https://api.spotify.com/v1/me", { headers: { authorization: `Bearer ${accessTokenValue}` } });
  if (!response.ok) throw new Error(`Spotify profile lookup failed (${response.status})`);
  return response.json() as Promise<{ id: string }>;
}

export function trackId(value: string) {
  const match = value.trim().match(/^(?:spotify:track:|https:\/\/open\.spotify\.com\/track\/)?([A-Za-z0-9]{22})(?:\?.*)?$/);
  if (!match) throw new Error(`Invalid Spotify track ID: ${value}`);
  return match[1];
}

export function playlistId(value: string) {
  const match = value.trim().match(/^(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)?([A-Za-z0-9]{22})(?:\?.*)?$/);
  if (!match) throw new Error("Invalid Spotify playlist ID");
  return match[1];
}
