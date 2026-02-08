# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal website and blog built with Eleventy (11ty), deployed to Cloudflare Pages. It features:
- Markdown-first content workflow with Obsidian integration
- Semantic related posts using offline ML embeddings
- Light/dark theme with accent palette system
- Wiki-style links (`[[Page Name]]`) between posts
- Optimized code highlighting with copy-to-clipboard

## Development Commands

```bash
# Install dependencies
npm install

# Build and serve locally (runs prebuild step automatically)
npm run serve

# Build for production (runs prebuild step automatically)
npm run build

# Clean build output
npm run clean

# Force rebuild of embeddings cache (if needed)
rm -rf .cache && npm run build
```

## Architecture

### Build Pipeline

The build process has two phases:

1. **Prebuild** (`scripts/build-related.js`): Runs before Eleventy
   - Computes semantic embeddings for all posts using `@xenova/transformers` (all-MiniLM-L6-v2 model)
   - Caches embeddings by content hash in `.cache/embeddings.json`
   - Only re-embeds changed posts (incremental)
   - Generates `src/_data/related.json` with top-K similar posts per slug
   - First run downloads the ML model locally; subsequent runs are fast

2. **Build** (Eleventy): Generates static site
   - Processes Markdown posts with frontmatter
   - Applies layouts and templating (Nunjucks)
   - Outputs to `_site/` directory

### Content Flow

**Obsidian → Blog workflow:**

1. Use `export_post.sh` to export notes from Obsidian:
   ```bash
   ./export_post.sh "/path/to/note.md"
   # With custom attachment paths:
   ATTACHMENTS_DIR="/path/to/Vault/Attachments" EXCALIDRAW_DIR="/path/to/Vault/Excalidraw" ./export_post.sh "/path/to/note.md"
   ```

2. Script handles:
   - Upserts frontmatter (`layout`, `title`, `date_published`, `date_updated`)
   - Strips duplicate H1 that matches title
   - Converts Obsidian image embeds `![[image.png]]` → Markdown `![](path)`
   - Copies images to `assets/images/<post-slug>/`
   - Writes back to source note (preserves original embed syntax in vault)

3. Posts appear at `/posts/<slug>/` with related posts automatically linked

### Key Directories

- `src/posts/` - Markdown blog posts (each becomes a page)
- `src/_includes/` - Nunjucks layouts (`layout.njk` base, `post.njk` for posts)
- `src/_data/` - Global data (e.g., `related.json` for post recommendations)
- `scripts/` - Build scripts (embeddings generator)
- `styles/main.css` - Theme, palettes, typography, code highlighting
- `assets/` - Static files (images, icons) copied to output
- `.cache/` - Embeddings cache (persisted between builds)
- `_site/` - Build output (git-ignored)

### Eleventy Configuration (`.eleventy.js`)

**Collections:**
- `post` collection: all `src/posts/*.md` sorted by `date_published` (newest first)

**Filters:**
- `date(format)` - Format dates with Luxon
- `prettyDate` - Human-friendly dates like "Friday August 8th 2025"

**Markdown Extensions:**
- **Wiki links**: `[[Page Name]]` → `/posts/page-name/`
  - Supports aliases: `[[Page Name|Alias]]`
  - Supports anchors: `[[Page Name#Section]]`
- **Heading anchors**: auto-generated IDs for in-page links (markdown-it-anchor)

**Code Highlighting:**
- Optional server-side: Shiki plugin (if `@11ty/eleventy-plugin-shiki` installed)
- Fallback: client-side Prism via CDN (configured in `layout.njk`)

### Related Posts System

**How it works:**
- Pre-build script embeds each post's content (title + body, code blocks stripped)
- Content is chunked (1500 chars, 200 overlap) and mean-pooled
- Embeddings are L2-normalized for cosine similarity via dot product
- Top-K (default 5) most similar posts are written to `related.json`
- `post.njk` template renders related posts at bottom of each post

**Tuning:**
- Edit `TOP_K` in `scripts/build-related.js` to show more/fewer recommendations
- Change model or pooling strategy if needed
- Cache invalidation: delete `.cache/` directory

### Theme and UI

**Theme toggle:**
- Light/dark mode button in header
- Respects `prefers-color-scheme`, stored in `localStorage.theme`
- Defaults to dark if detection fails

**Accent palettes:**
- Six palettes: indigo (default), forest, amber, rose, teal, purple
- Hidden easter egg: click footer year 5× quickly to cycle palettes
- Stored in `localStorage.palette`

**Code blocks:**
- Client-side enhancements in `layout.njk`:
  - Language badge (e.g., "JavaScript", "Python")
  - Copy-to-clipboard button
  - Styled with subtle colors in `styles/main.css`

### Frontmatter Schema

Required for posts:
```yaml
---
title: Post Title
layout: post.njk
date_published: YYYY-MM-DD
date_updated: YYYY-MM-DD
tags: [tag1, tag2]
---
```

**Important:** `post.njk` injects `<h1>` from `title`, so don't add duplicate H1 in body.

## Deployment (Cloudflare Pages)

**Configuration:** `wrangler.toml`
- `name`: must match Cloudflare Pages project name (e.g., `personal-website`)
- `pages_build_output_dir`: `_site/`
- **Do not include** `account_id` (Pages projects don't use it; Workers do)

**Build settings:**
- Build command: `npm run build` (triggers prebuild automatically)
- Output directory: `_site`
- Cache `.cache/` directory between builds for fast incremental embeddings

**Notes:**
- First deploy downloads ML model (~25MB) into build cache
- Subsequent deploys reuse cached embeddings for unchanged posts
- To force full rebuild in CI: clear cache or delete `.cache/` before build

## Obsidian Integration

**Wiki links in Markdown:**
- Use `[[Post Name]]` in posts to link to `/posts/post-name/`
- Aliases: `[[Post Name|Display Text]]`
- Anchors: `[[Post Name#Heading]]` → `/posts/post-name/#heading`

**Image handling:**
- Obsidian embeds `![[image.png]]` are converted to standard Markdown by `export_post.sh`
- Images copied to `assets/images/<post-slug>/` and referenced as `/assets/images/<post-slug>/image.png`
- Set `ATTACHMENTS_DIR` and `EXCALIDRAW_DIR` env vars if images aren't co-located with note

## Fonts and Typography

- Inconsolata (Google Fonts): headings and body text
- Monospace-first aesthetic with clean spacing
- Link decorations: internal vs external differentiated by color

## Customization Notes

**To add a new accent palette:**
1. Define CSS custom properties in `styles/main.css` under `[data-palette="newcolor"]`
2. Add to `palettes` array in `layout.njk` easter egg script

**To adjust related posts count:**
- Change `TOP_K` constant in `scripts/build-related.js`
- Delete `.cache/` and rebuild

**To swap ML model:**
- Edit `loadEmbedder()` in `scripts/build-related.js`
- Change model ID (must support feature-extraction with mean pooling)
- Delete `.cache/` to force re-embedding

## Testing Locally

After editing posts or templates:
```bash
npm run serve
```
- Watches for file changes
- Rebuilds related posts on each run (preserve hook)
- Serves at `http://localhost:8080` (default Eleventy port)
