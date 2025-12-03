## Usage

Need to add this

## TODO

- fix highlighting for italicised links

## Personal Website (Eleventy) — Quick Start and Guide

A lightweight, fast personal site built with Eleventy. Markdown-first content, simple layouts, light/dark theme toggle, and an accent palette system. Optimized code blocks use solid token colors without punctuation highlighting.


### Usage

```bash
npm install
npm run serve #build and serve locally to review
```


### Project Structure
```text
.
├─ src/
│  ├─ _includes/
│  │  ├─ layout.njk        Base layout (nav, theme + palette, Prism fallback)
│  │  └─ post.njk          Post layout (injects <h1> and published/updated dates)
│  ├─ posts/               Markdown posts (each becomes /posts/<slug>/)
│  ├─ home.md              Home page (if present)
│  └─ blog.md              Blog index at /blog/
├─ styles/
│  └─ main.css             Theme, palettes, typography, code styles
├─ _site/                  Build output (generated)
├─ export_post.sh          Helper to export/update a post from Obsidian
├─ package.json            Scripts and dependencies
├─ wrangler.toml           Cloudflare Pages config (project `name`, `pages_build_output_dir`)
└─ readme.md               This guide
```

### Writing Posts (Front Matter)
Posts live in `src/posts/` and should include:
- **title**: string
- **layout**: `post.njk`
- **date_published**: `YYYY-MM-DD`
- **date_updated**: `YYYY-MM-DD`
- **tags**: array

Example:
```markdown
---
title: My New Post
layout: post.njk
date_published: 2025-01-31
date_updated: 2025-01-31
tags: [eleventy, notes]
---

Post content in Markdown...
```
Note: `post.njk` injects the page `<h1>` from the front matter title; avoid duplicating a top-level `# Heading` at the top of the body.

### Exporting from Obsidian (Helper Script)
Use `export_post.sh` to move a note into the blog with clean front matter:
```bash
./export_post.sh "/absolute/path/to/note.md"
```
What it does:
- Writes to `src/posts/<note-name>.md` (creating the directory if needed)
- Ensures/upserts required front matter keys
  - `layout: post.njk`
  - `title`: derived from filename if missing
  - `date_published`: added if missing
  - `date_updated`: added, or bumped to today if replacing an existing post
- Strips a leading H1 that duplicates the title
- Also overwrites the source note with the updated front matter (handy round‑trip)
- Quiet by default; set `VERBOSE=1` to see logs

### Images
- Obsidian-style image embeds like `![[My Image.png]]` in your note are automatically converted for the site to standard Markdown images and copied to `assets/images/<post-slug>/`.
- Your source note remains unchanged in spirit: we preserve the original embed syntax when writing back to Obsidian, so your vault keeps working.
- If your images are stored in a centralized folder in your vault, set `ATTACHMENTS_DIR` when running the export:
  ```bash
  ATTACHMENTS_DIR="/absolute/path/to/Vault/Attachments" ./export_post.sh "/absolute/path/to/note.md"
  ```
- If your Excalidraw files live in a dedicated folder, set `EXCALIDRAW_DIR` so the script can find `.excalidraw` exports like `name.excalidraw.png/svg`:
  ```bash
  EXCALIDRAW_DIR="/absolute/path/to/Vault/Excalidraw" ./export_post.sh "/absolute/path/to/note.md"
  ```
- Eleventy is configured to passthrough-copy `assets/`, so image URLs like `/assets/images/<post-slug>/foo.png` work on Cloudflare Pages and are CDN-cached.

### Theming, Palettes, and UX
- **Theme toggle**: light/dark, persisted in `localStorage` (`theme`). Defaults to system preference, falling back to dark.
- **Accent palettes**: `indigo` (default), `forest`, `amber`, `rose`, `teal`, `purple`. Selected via the header picker; stored in `localStorage` (`palette`).
- **Hidden palette cycler**: click the © year 5 times quickly to cycle palettes.
- **Typography**: Inconsolata for headings and body.
- **Links**: internal and external colors tuned per theme/palette in `styles/main.css`.

### Code Highlighting
- The layout includes a Prism fallback via CDN; token colors are tuned in `styles/main.css` to keep backgrounds transparent and emphasis subtle.
- Punctuation and operators inherit the surrounding text color by design, while keywords/strings/numbers/functions use solid colors to stay readable without visual noise.
- A copy‑to‑clipboard button is added on code blocks; labels reflect the detected language.

### Semantic Related Posts (offline, incremental)
- **What it does**: Computes semantic embeddings for each post and writes `src/_data/related.json`. `post.njk` renders a “You might also like” list (up to 5 items) after the post body.
- **Offline + cached**: Uses `@xenova/transformers` (local `all-MiniLM-L6-v2`). Embeddings are cached in `.cache/embeddings.json` by a SHA‑256 hash of each post, so only changed posts are re‑embedded.
- **Runs automatically**:
  - `npm run build` → runs `prebuild` first to refresh embeddings and `related.json`.
  - `npm run serve` → runs `preserve` before Eleventy dev server.
- **Files**:
  - `scripts/build-related.js`: embedding + similarity generator
  - `.cache/embeddings.json`: per‑post `{ hash, vector }` cache
  - `src/_data/related.json`: top‑K related posts per slug (consumed by templates)
  - `src/_includes/post.njk`: renders the related list (date | title)
- **Tuning**: Edit constants in `scripts/build-related.js`:
  - `TOP_K` (default 5) controls how many related posts are shown.
  - Content is chunked with overlap, mean‑pooled, and normalized. Swap the model or pooling strategy if desired.
- **Force refresh**:
  ```bash
  rm -rf .cache && npm run build
  ```
- **Notes**:
  - First run will download the small model into a local cache; subsequent runs are fast.
  - If there are fewer than 5 other posts, the list shows whatever is available and never includes the current post.

### Deploying to Cloudflare Pages

**Overview**
This repo builds with Eleventy to `_site/`. Cloudflare Pages will run the Node build and then deploy `_site/` using Wrangler. Because the build includes an embeddings pre-step and benefits from caching, we also persist a `.cache/` directory between builds.

**Notes**
- The prebuild writes `.cache/embeddings.json` and `src/_data/related.json`; caching `.cache` makes later builds fast.
- `wrangler.toml` for Pages **must not** include `account_id` (that key is for Workers). Pages requires only `name` and `pages_build_output_dir` here.
- The project slug must exactly match your Pages **Project name** (the bit before `.pages.dev`).
- You can list projects during CI while debugging:
  ```bash
  bash -euxo pipefail -c 'npx wrangler whoami; npx wrangler pages project list'
  ```


### Feature Ideas

- client side search using lunr or fuse js to index post titles, tags, excerpts
- tag related search pages
- more hyperlink emoticons
- chatbot?
- dev build in cloudflare using a differen branch
- post changelog? each update comes with a version history?
- eventually add better image storage handling (get out of git, switch to Cloudflare R2)
- blog post-themed banner images.  AI generated, but thematically continuous. seems ambitious!





### License
ISC