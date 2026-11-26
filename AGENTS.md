# AGENTS.md

## Product and philosophy

This repository is a personal website and Markdown-first blog whose public personality is intentionally quiet: clean text, strong reading flow, a restrained monospace instrument-panel aesthetic, and small playful experiences for friends rather than a generic app shell or a content-heavy marketing site. The Record Club is the clearest product expression: a private listening room where invited friends keep personal top-ten records, add notes, search Spotify, rank or reorder selections, and play “Who Picked It?”—a social guessing game in which clues are revealed after misses and scoring rewards recognition. New features should preserve the hierarchy of readable text first, useful structure second, and play as an optional layer; visual novelty should serve clarity, warmth, or shared activity.

## Stack and source of truth

The site is static Eleventy 3.1.2 with Nunjucks layouts and Markdown content, deployed to Cloudflare Pages; Pages Functions under `functions/api/` provide the small dynamic surface for auth, Spotify search, and Record Club/game APIs. The principal sources are `src/posts/`, `src/_includes/layout.njk` and `post.njk`, `src/_data/`, `styles/main.css`, `styles/records.css`, `assets/`, `assets/js/records.js`, `assets/js/record-game.js`, `functions/api/`, and `migrations/`. Markdown is extended with wiki links (`[[Page Name]]`, aliases, and anchors), heading anchors, Luxon date filters, and optional Shiki highlighting with a Prism CDN fallback. Posts require `title`, `layout`, `date_published`, `date_updated`, and tags; `post.njk` supplies the H1, so exported notes must not retain a duplicate title H1.

The prebuild hook `scripts/build-related.js` computes offline semantic recommendations with Xenova Transformers (`all-MiniLM-L6-v2`): post text is chunked at roughly 1500 characters with 200-character overlap, mean-pooled, L2-normalized, compared by dot-product cosine similarity, and written as top-five results to `src/_data/related.json`. Embeddings are content-hash cached in `.cache/embeddings.json`; the first uncached build downloads the model (about 25 MB), while subsequent builds reuse unchanged vectors. Obsidian notes flow through `export_post.sh`, which upserts frontmatter, strips a duplicate title H1, converts image embeds, and copies attachments into `assets/images/<post-slug>/`.

## Visual system

Typography is local, not dependent on Google Fonts: `assets/fonts/inconsolata.woff2` supplies Inconsolata for the blog, site chrome, controls, code, design guide, Record Club, and games. Do not introduce a serif or other alternate font treatment. Light/dark mode is set before paint, respects the system preference, and persists in `localStorage.theme`; six accents—indigo, forest, amber, rose, teal, and purple—cycle through the hidden footer-year five-click easter egg and persist in `localStorage.palette`. There is deliberately no visible palette picker.

Palette data lives in `src/_data/palettes.js`, the single source of truth for metadata, light/dark raw values, semantic status colors, and swatches. `src/palettes.css.njk` generates `/styles/palettes.css`; `styles/main.css` owns the semantic foundation and fallback mapping. New UI should consume semantic variables such as `--color-bg`, `--color-surface`, `--color-surface-soft`, `--color-surface-sunken`, `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-border`, `--color-border-strong`, `--color-primary`, `--color-primary-strong`, `--color-secondary`, `--color-secondary-strong`, `--color-on-primary`, `--color-on-secondary`, `--color-focus`, `--color-success`, `--color-warning`, `--color-danger`, and `--color-info`, rather than scattering raw hex values. Preserve visible focus states, meaningful status text or icons in addition to color, and the established internal/external link distinction.

## Local design lab

`src/design.njk` is a local design guide, not public website content. It documents the visual philosophy, token roles, all palette/theme swatches, and representative controls so the system can be reviewed in one place without adding another production destination. It is ignored unless `DESIGN_GUIDE=1`; `npm run serve:design` serves an isolated `_design-site` at `/design/` (normally `http://localhost:8080/design/`, or `8081` when 8080 is occupied). The ordinary `npm run build` must continue to exclude the design route and its navigation/footer links and must write only the deployable `_site/`. The guide’s `styles/design.css` may remain a copied static asset, but the page itself must stay unreachable from the production build. The palette data and generated palette CSS are shared production infrastructure; only the guide route is local-only.

## Content workflow and commands

Use `npm install` for dependencies, `npm run serve` for the normal Eleventy watcher/server, `npm run build` for the production build, `npm run clean` to remove generated output, and `rm -rf .cache && npm run build` only when embeddings need a forced rebuild. `npm run serve:app` builds and runs `_site` through `wrangler pages dev` for Pages Functions; normal Eleventy serving does not provide the API backend. Local function secrets belong in an untracked `.dev.vars` based on the example file. The development preview may choose the next port when 8080 is already bound; inspect the command output rather than assuming the URL.

## Cloudflare deployment

`wrangler.toml` is configured for Cloudflare Pages with the project `name` and `pages_build_output_dir = "_site"`; Pages projects do not need an `account_id`, so do not add one. Production uses build command `npm run build`, deploys `_site`, and should cache `.cache/` for incremental embedding work. The dynamic surface expects secrets such as `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, the group-specific Record Club access-code bindings, and optional `MAX_RECORD_MEMBERS`; never commit them. D1 schema changes are tracked as ordered SQL files in `migrations/`; never rely on editing an already-applied migration to change production. `_routes.json` and `assets/` are passed through as part of the static output.

## Adding a Record Club access group

Each access code represents one real group. Never create a generic `friends` group, reuse one code for multiple groups, or assign users to a group based on their username. The current group IDs are `development`, `wyatt-fam`, `badabing`, and `ey-mt-juniors`; game album selection, answers, and member choices must remain filtered by the signed-in user's `group_id`.

To add another group correctly:

1. Create the next numbered D1 migration. Insert a stable kebab-case ID and display name into `record_groups`; do not change an applied migration as the production fix.
2. Add one explicit mapping in `resolveAccessGroup()` in `functions/_shared/auth.js`, using a group-specific secret such as `NEW_GROUP_ACCESS_CODE`. Do not restore or overload `SIGNUP_ACCESS_CODE`.
3. Add the placeholder binding to `.dev.vars.example`. Put the real production value with the interactive `wrangler pages secret put NEW_GROUP_ACCESS_CODE --project-name cloudflare-website` prompt; never put a secret in source, a command argument, or tool output.
4. Run `npm run build`, test access-code resolution, commit, and push. Apply the new migration with `npm run db:migrate:remote`. A Pages secret change only reaches the Function after a new production deployment, so verify the deployment after setting the secret.
5. Query production D1 read-only and confirm the exact `record_groups` rows. Test the live registration API with a known-taken username: `username_taken` with HTTP 409 proves the code was accepted without creating an account; `invalid_access_code` with HTTP 403 means it was rejected. Also verify obsolete or generic codes are rejected.

Do not declare success from a build, secret upload, migration, or HTTP 200 alone. Confirm the expected commit is the active Pages deployment, every intended code is accepted live, unwanted codes are rejected, and no test accounts were created.

## Working rules and recent corrections

Treat `src/_data/palettes.js`—not a hand-maintained palette array in the layout or a collection of duplicated rules in `main.css`—as the palette authority. Treat `npm run serve:design`—not the normal production preview—as the way to inspect the design page. Do not add the design page to the public nav merely because it exists locally, and do not infer that a preview on port 8081 means deployment configuration changed. Earlier attempts exposed or implied a visible palette control and relied on stale “Google Fonts”/hard-coded palette guidance; the current implementation intentionally uses the hidden easter egg, local Inconsolata, generated palette CSS, semantic tokens, and an explicit build-time design-guide gate. After template, style, or content changes, run the relevant build or preview and verify both sides of the boundary: the isolated guide is present when enabled, while a clean `npm run build` contains no `/design/` page or design navigation.
