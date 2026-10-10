import { OAuthProvider, AuthorizationError, CimdFetchError, authorizationErrorRedirect } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { CALLBACK, RESOURCE, SPOTIFY_SCOPE, exchangeSpotifyCode, playlistId, saveToken, spotifyApi, spotifyProfile, trackId, type Env } from "./spotify";

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const failure = (error: unknown) => ({ isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Unknown error" }] });
const uri = (id: string) => `spotify:track:${id}`;

function currentUserId() {
  const userId = getMcpAuthContext()?.props.userId;
  if (typeof userId !== "string" || !userId) throw new Error("Spotify sign-in is required");
  return userId;
}

async function playlistTracks(env: Env, userId: string, id: string, expectedLength: number) {
  const ids: string[] = [];
  for (let offset = 0; offset < expectedLength; offset += 50) {
    const page = await spotifyApi<{ items: Array<{ item?: { id?: string }; track?: { id?: string } }> }>(
      env, userId, `/playlists/${id}/items?limit=50&offset=${offset}`,
    );
    ids.push(...page.items.map((entry) => entry.item?.id || entry.track?.id || ""));
  }
  return ids;
}

async function addInOrder(env: Env, userId: string, playlist: string, ids: string[]) {
  for (let offset = 0; offset < ids.length; offset += 100) {
    await spotifyApi(env, userId, `/playlists/${playlist}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: ids.slice(offset, offset + 100).map(uri) }),
    });
  }
}

function createServer(env: Env) {
  const server = new McpServer({ name: "Spotify Playlist Curator", version: "1.0.0" });
  server.registerTool("search_tracks", {
    description: "Search Spotify recordings. Inspect title, performers, album, duration, and track ID before choosing exact recordings.",
    inputSchema: { query: z.string().min(2).max(200), limit: z.number().int().min(1).max(20).optional() },
  }, async ({ query, limit }) => {
    try {
      const userId = currentUserId();
      const result = await spotifyApi<{ tracks: { items: Array<any> } }>(env, userId, `/search?type=track&limit=${limit || 10}&q=${encodeURIComponent(query)}`);
      return text(result.tracks.items.map((item) => ({
        id: item.id, name: item.name, artists: item.artists?.map((artist: any) => artist.name),
        album: item.album?.name, albumId: item.album?.id, releaseDate: item.album?.release_date,
        durationMs: item.duration_ms, discNumber: item.disc_number, trackNumber: item.track_number,
        url: item.external_urls?.spotify, available: item.is_playable !== false,
      })));
    } catch (error) { return failure(error); }
  });

  server.registerTool("create_private_playlist", {
    description: "Create a private playlist with these exact Spotify tracks in the supplied order, then read it back to verify the order. Duplicate track IDs remain duplicates.",
    inputSchema: {
      name: z.string().min(1).max(100),
      description: z.string().max(300).optional(),
      trackIds: z.array(z.string()).min(1).max(500),
    },
  }, async ({ name, description, trackIds }) => {
    const userId = currentUserId();
    const ids = trackIds.map(trackId);
    let createdId: string | undefined;
    try {
      const created = await spotifyApi<{ id: string; external_urls?: { spotify?: string } }>(env, userId, "/me/playlists", {
        method: "POST", body: JSON.stringify({ name, description: description || "", public: false, collaborative: false }),
      });
      createdId = created.id;
      await addInOrder(env, userId, created.id, ids);
      const actual = await playlistTracks(env, userId, created.id, ids.length);
      if (actual.length !== ids.length || actual.some((id, index) => id !== ids[index])) {
        throw new Error("Spotify returned a different track sequence; inspect the playlist before using it");
      }
      return text({ id: created.id, url: created.external_urls?.spotify, private: true, trackIds: actual, verified: true });
    } catch (error) {
      return failure(new Error(`${error instanceof Error ? error.message : "Playlist creation failed"}${createdId ? `; playlist ID ${createdId} may contain some tracks` : ""}`));
    }
  });

  server.registerTool("append_tracks", {
    description: "Append exact tracks, in order, to one of your existing private playlists and verify the result.",
    inputSchema: { playlistId: z.string(), trackIds: z.array(z.string()).min(1).max(500) },
  }, async ({ playlistId: input, trackIds }) => {
    try {
      const userId = currentUserId();
      const id = playlistId(input);
      const ids = trackIds.map(trackId);
      const playlist = await spotifyApi<{ owner: { id: string }; public: boolean; items: { total: number } }>(env, userId, `/playlists/${id}`);
      if (playlist.owner.id !== userId || playlist.public !== false) throw new Error("This tool only edits private playlists you own");
      const previousCount = playlist.items.total;
      await addInOrder(env, userId, id, ids);
      const all = await playlistTracks(env, userId, id, previousCount + ids.length);
      if (all.length !== previousCount + ids.length || all.slice(previousCount).some((value, index) => value !== ids[index])) {
        throw new Error("Spotify returned a different track sequence; inspect the playlist before using it");
      }
      return text({ id, url: `https://open.spotify.com/playlist/${id}`, appendedTrackIds: ids, verified: true });
    } catch (error) { return failure(error); }
  });
  return server;
}

const apiHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return createMcpHandler(() => createServer(env), {
      route: "/spotify", allowedHostnames: ["mcp.ben-wyatt.com"],
      allowedOriginHostnames: ["claude.ai", "mcp.ben-wyatt.com"],
    })(request, env, ctx);
  },
};

function consentPage(details: { clientName: string; clientDomain?: string; redirectHost: string; redirectIsLoopback: boolean; scope: string[] }, handle: string) {
  return `<!doctype html><meta charset="utf-8"><title>Authorize Spotify Playlist Curator</title>
    <h1>Allow ${escape(details.clientName)} to use your Spotify playlists?</h1>
    <p>${details.clientDomain ? `Published by ${escape(details.clientDomain)}.` : "This app registered itself; its name is not verified."}
    Access will be sent to ${escape(details.redirectHost)}.</p>
    ${details.redirectIsLoopback ? "<p>This sends access to an app on your computer.</p>" : ""}
    <p>It can search tracks and create or add to private playlists after you sign in with Spotify.</p>
    <form method="post"><input type="hidden" name="handle" value="${escape(handle)}">
    ${details.scope.map((scope) => `<input type="hidden" name="scope" value="${escape(scope)}">`).join("")}
    <button name="decision" value="approve">Allow and sign in with Spotify</button>
    <button name="decision" value="deny">Deny</button></form>`;
}

const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const oauth = env.OAUTH_PROVIDER;
    try {
      if (path === "/authorize" && request.method === "GET") {
        const authRequest = await oauth.parseAuthRequest(request);
        const details = await oauth.describeConsent(authRequest);
        const consent = await oauth.beginConsent(authRequest);
        consent.headers.set("content-type", "text/html; charset=utf-8");
        return new Response(consentPage(details, consent.handle), { headers: consent.headers });
      }
      if (path === "/authorize" && request.method === "POST") {
        const form = await request.formData();
        const handle = String(form.get("handle") || "");
        if (form.get("decision") !== "approve") {
          const denied = await oauth.denyConsent(request, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const approved = await oauth.approveConsent(request, handle, { scope: form.getAll("scope").map(String) });
        const upstream = await oauth.beginUpstream(approved.request, { headers: approved.headers });
        const spotify = new URL("https://accounts.spotify.com/authorize");
        spotify.search = new URLSearchParams({
          client_id: env.SPOTIFY_CLIENT_ID, response_type: "code", redirect_uri: CALLBACK,
          scope: SPOTIFY_SCOPE, state: upstream.state,
        }).toString();
        upstream.headers.set("location", spotify.toString());
        return new Response(null, { status: 302, headers: upstream.headers });
      }
      if (path === "/callback" && request.method === "GET") {
        const resumed = await oauth.finishUpstream(request);
        const params = new URL(request.url).searchParams;
        if (params.has("error")) {
          resumed.headers.set("location", authorizationErrorRedirect(resumed.request, "access_denied"));
          return new Response(null, { status: 302, headers: resumed.headers });
        }
        const code = params.get("code");
        if (!code) return new Response("Spotify did not return an authorization code", { status: 400 });
        const token = await exchangeSpotifyCode(env, code);
        const profile = await spotifyProfile(token.accessToken);
        await saveToken(env, profile.id, token);
        const complete = await oauth.completeAuthorization({
          request: resumed.request, userId: profile.id, metadata: {}, scope: resumed.request.scope,
          props: { userId: profile.id },
        });
        resumed.headers.set("location", complete.redirectTo);
        return new Response(null, { status: 302, headers: resumed.headers });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
      if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
        return new Response(error instanceof AuthorizationError ? error.description : "Client verification failed", { status: 400 });
      }
      console.error("Spotify MCP authorization failed", error instanceof Error ? error.message : "unknown error");
      return new Response("Authorization failed", { status: 500 });
    }
  },
};

export default new OAuthProvider<Env>({
  apiRoute: "/spotify", apiHandler, defaultHandler,
  authorizeEndpoint: "/authorize", tokenEndpoint: "/oauth/token", clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["playlist:read", "playlist:write", "offline_access"],
  requiredScopes: ["playlist:read", "playlist:write"],
  resourceMetadata: { resource: RESOURCE, authorization_servers: ["https://mcp.ben-wyatt.com"] },
  clientIdMetadataDocumentEnabled: true,
  refreshTokenTTL: undefined,
});
