## Personal Website (Eleventy) — Quick Start and Guide

A lightweight, fast personal site built with Eleventy. Markdown-first content, simple layouts, light/dark theme toggle, and an accent palette system. Optimized code blocks use solid token colors without punctuation highlighting.

### Prerequisites
- **Node.js**: 18+ recommended
- **npm**: comes with Node

### Install and Run
- **Install**:
  ```bash
  npm install
  ```
- **Develop (watch + local server)**:
  ```bash
  npm run serve
  ```
  Eleventy will print the local URL when it starts.
- **Build (static output to `_site/`)**:
  ```bash
  npm run build
  ```
- **Clean build output**:
  ```bash
  npm run clean
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

### Deploying to Vercel
- Create a new Vercel project and connect the GitHub repo.
- Build settings:
  - **Framework Preset**: Eleventy
  - **Build Command**: `npm run build` (or `eleventy`)
  - **Output Directory**: `_site`
- Push to `main`; Vercel builds and deploys automatically.

### Tips and Troubleshooting
- If you see missing highlights, ensure only one highlighter is active (Prism CDN is included by default).
- Run `npm run clean && npm run build` to force a fresh build.
- Blog index lives at `src/blog.md` and renders `/blog/`.

### License
ISC