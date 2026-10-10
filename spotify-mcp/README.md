# Spotify Playlist MCP

Remote MCP Worker for choosing exact Spotify recordings and creating private playlists in order.

## Endpoints

- Claude connector URL: `https://mcp.ben-wyatt.com/spotify`
- OAuth authorization: `https://mcp.ben-wyatt.com/authorize`
- Spotify redirect URI: `https://mcp.ben-wyatt.com/callback`

Add the redirect URI **exactly** to the Spotify developer app whose client ID and secret are stored as Worker secrets. Claude's connector sign-in starts a consent page, then sends the user to Spotify. Spotify tokens remain in Cloudflare KV, encrypted with `TOKEN_ENCRYPTION_KEY`.

## Tools

- `search_tracks`: returns recording details and Spotify track IDs.
- `create_private_playlist`: creates a private playlist, adds exact track IDs in order, and reads them back.
- `append_tracks`: appends tracks to a private playlist owned by the signed-in Spotify user and verifies the appended order.

The tools accept Spotify track IDs, track URIs, or track links. Creation and append calls accept up to 500 tracks and send them to Spotify in batches of 100.

## Deployment

From this directory:

```sh
npm ci
npm run check
npm run deploy
```

`wrangler.toml` binds a dedicated KV namespace and requires these Worker secrets: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and a base64 encoded 32-byte `TOKEN_ENCRYPTION_KEY`. Set secrets with `wrangler secret put NAME` using the interactive prompt. Do not commit their values.

Spotify authorization requests only `playlist-modify-private` and `playlist-read-private`. The MCP OAuth server grants only the scopes its tools need. Both the MCP access token and Spotify refresh token can be revoked by disconnecting the connector and revoking the Spotify app, respectively.
