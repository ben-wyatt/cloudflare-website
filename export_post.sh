#!/usr/bin/env bash
set -euo pipefail

# Quiet by default; set VERBOSE=1 to see progress logs on stderr
VERBOSE="${VERBOSE:-0}"
log() { if [[ "$VERBOSE" == "1" ]]; then printf '%s\n' "$*" >&2; fi; }

# --- CONFIG ---
# Update this to your local repo path if different:
REPO_DIR="$HOME/Repos/cloudflare-website"
POSTS_DIR="$REPO_DIR/src/posts"
# Where images will be copied to (served via Eleventy passthrough)
ASSETS_DIR="$REPO_DIR/assets/images"
# Optional: path to your Obsidian attachments dir (if images aren't next to the note)
ATTACHMENTS_DIR="${ATTACHMENTS_DIR:-}"
# Optional: path to your vault's Excalidraw folder (for .excalidraw and exported .png/.svg)
EXCALIDRAW_DIR="${EXCALIDRAW_DIR:-}"
# --------------

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /absolute/path/to/current-note.md" >&2
  exit 1
fi

SRC="$(perl -MCwd -e 'print Cwd::abs_path(shift)' "$1")"
if [[ ! -f "$SRC" ]]; then
  echo "Source file does not exist: $SRC" >&2
  exit 1
fi

log "Source file: $SRC"

mkdir -p "$POSTS_DIR"

filename="$(basename "$SRC")"
name_no_ext="${filename%.*}"
DEST="$POSTS_DIR/$name_no_ext.md"

today="$(date +%F)"
replacing=0
[[ -f "$DEST" ]] && replacing=1

dest_base="$(basename "$DEST")"

log "Posts directory: $POSTS_DIR"
log "Destination file: $DEST"
log "Operation date: $today"
log "Replacing existing post: $replacing (1=yes, 0=no)"

# Read the file and split frontmatter/body
tmpdir="$(mktemp -d)"
front="$tmpdir/front.yml"
body="$tmpdir/body.md"          # body for source note (H1 stripped, embeds kept)
body_images="$tmpdir/body_img.md" # body for site output (with image rewrites)
newfront="$tmpdir/newfront.yml"
assembled_src="$tmpdir/assembled_src.md"
assembled_dest="$tmpdir/assembled_dest.md"

# Initialize
> "$front"
> "$body"

# Detect and extract frontmatter if present
# (frontmatter is the first block between --- and ---)
awk '
  BEGIN { infront=0; havefront=0 }
  NR==1 && $0 ~ /^---[[:space:]]*$/ { infront=1; havefront=1; next }
  infront && $0 ~ /^---[[:space:]]*$/ { infront=0; next }
  {
    if (infront) print >> FRONT;
    else print >> BODY;
  }
' FRONT="$front" BODY="$body" "$SRC"

# Report on detected sections
if [[ -s "$front" ]]; then
  log "Detected frontmatter block (lines: $(wc -l < "$front"))"
else
  log "No frontmatter detected at top; treating entire file as body"
fi
log "Body lines: $(wc -l < "$body")"

# If there was no frontmatter at the top, treat entire file as body
if [[ ! -s "$front" && -s "$body" ]]; then
  : # already set correctly
elif [[ ! -s "$front" ]]; then
  # file was empty — ensure body exists
  > "$body"
fi

# Helper: check if key exists in current frontmatter (strict at line start)
has_key() {
  local key="$1"
  grep -Eiq "^[[:space:]]*$key[[:space:]]*:" "$front"
}

# Helper: update (replace) a key if present, else append
upsert_key() {
  local key="$1"
  local value="$2"
  if has_key "$key"; then
    log "Updating key '$key' to: $value"
    # replace the first matching line
    # keep original indentation if present
    awk -v k="$key" -v v="$value" '
      BEGIN{IGNORECASE=1}
      function repl(line) {
        # preserve leading spaces before key
        match(line, /^[[:space:]]*/)
        lead=substr(line, RSTART, RLENGTH)
        return lead k ": " v
      }
      BEGINFILE{done=0}
      {
        if (!done && match($0, "^[[:space:]]*" k "[[:space:]]*:")) {
          print repl($0)
          done=1
        } else {
          print
        }
      }
    ' "$front" > "$newfront"
    mv "$newfront" "$front"
  else
    log "Adding key '$key' with value: $value"
    echo "$key: $value" >> "$front"
  fi
}

# Ensure required keys:
# title: default to filename (no extension)
if ! has_key "title"; then
  # Replace dashes/underscores with spaces for a nicer default
  pretty_title="${name_no_ext//_/ }"
  pretty_title="${pretty_title//-/ }"
  upsert_key "title" "$pretty_title"
else
  log "Keeping existing 'title'"
fi

# layout: default to post.njk; migrate legacy 'layout.njk' to 'post.njk' for posts
if ! has_key "layout"; then
  upsert_key "layout" "post.njk"
else
  # If layout is explicitly 'layout.njk', switch to 'post.njk' for post pages
  if grep -Eiq '^[[:space:]]*layout[[:space:]]*:[[:space:]]*layout\.njk[[:space:]]*$' "$front"; then
    log "Migrating layout from 'layout.njk' to 'post.njk'"
    upsert_key "layout" "post.njk"
  else
    log "Keeping existing 'layout'"
  fi
fi

# date_published: add only if missing
if ! has_key "date_published"; then
  upsert_key "date_published" "$today"
else
  log "Keeping existing 'date_published'"
fi

# tags: ensure exists as YAML list; default to empty list
if ! has_key "tags"; then
  upsert_key "tags" "[]"
else
  log "Keeping existing 'tags'"
fi

# date_updated: must always exist; if replacing, bump to today; else set if missing
if (( replacing )); then
  upsert_key "date_updated" "$today"
else
  if ! has_key "date_updated"; then
    upsert_key "date_updated" "$today"
  else
    log "Keeping existing 'date_updated'"
  fi
fi

# Remove a leading H1 that duplicates the title (so layout can inject the H1)
# Determine the final title from front matter or filename fallback
title_line="$(grep -Ei '^[[:space:]]*title[[:space:]]*:' "$front" | head -n1 || true)"
if [[ -n "$title_line" ]]; then
  title_value="$(echo "$title_line" | sed -E 's/^[[:space:]]*[Tt][Ii][Tt][Ll][Ee][[:space:]]*:[[:space:]]*//')"
  # Strip surrounding single or double quotes
  title_value="${title_value%\"}"; title_value="${title_value#\"}"
  title_value="${title_value%\'}"; title_value="${title_value#\'}"
else
  # Fallback to a prettified filename
  title_value="${name_no_ext//_/ }"
  title_value="${title_value//-/ }"
fi

# Also compute a prettified filename variant to match common H1s like "# My Post Name"
file_pretty="${name_no_ext//_/ }"
file_pretty="${file_pretty//-/ }"

body2="$tmpdir/body_stripped.md"
awk -v t1="$title_value" -v t2="$file_pretty" '
  BEGIN { removed=0; skipBlank=0; started=0; t1l=tolower(t1); t2l=tolower(t2); }
  {
    if (!started) {
      if ($0 ~ /^[[:space:]]*$/) { print; next }
      started=1
      if ($0 ~ /^[[:space:]]*#[[:space:]]+/) {
        lineTitle=$0
        sub(/^[[:space:]]*#[[:space:]]+/, "", lineTitle)
        sub(/[[:space:]]+$/, "", lineTitle)
        tl=tolower(lineTitle)
        if (tl==t1l || tl==t2l) {
          removed=1
          skipBlank=1
          next
        }
      }
    }
    if (removed && skipBlank && $0 ~ /^[[:space:]]*$/) { skipBlank=0; next }
    skipBlank=0
    print
  }
' "$body" > "$body2"
mv "$body2" "$body"

# Prepare a copy used for site output where image embeds will be rewritten
cp "$body" "$body_images"

# --- Rewrite Obsidian image embeds and copy assets (for site output only) ---
slugify_post() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}
post_slug="$(slugify_post "$name_no_ext")"
POST_ASSETS_DIR="$ASSETS_DIR/$post_slug"
mkdir -p "$POST_ASSETS_DIR"

note_dir="$(dirname "$SRC")"

find_asset_for() {
  # $1 = page (may include extension)
  local page="$1"
  local has_ext=0
  local ext=""
  local base_no_ext="$page"
  if [[ "$page" == *.* ]]; then
    has_ext=1
    ext="${page##*.}"
    base_no_ext="${page%.*}"
  fi
  # Candidate filenames
  local names=()
  if (( has_ext )); then
    if [[ "$ext" == "excalidraw" ]]; then
      # Prefer exported image formats for excalidraw entries
      names+=("${page}.png" "${page}.svg" "${base_no_ext}.png" "${base_no_ext}.svg")
    else
      names+=("$page")
    fi
  else
    names+=("${base_no_ext}.png" "${base_no_ext}.jpg" "${base_no_ext}.jpeg" "${base_no_ext}.webp" "${base_no_ext}.gif" "${base_no_ext}.svg")
  fi

  local cand
  for cand in "${names[@]}"; do
    if [[ -f "$note_dir/$cand" ]]; then
      printf '%s\n' "$note_dir/$cand"
      return 0
    fi
    if [[ -n "$ATTACHMENTS_DIR" && -f "$ATTACHMENTS_DIR/$cand" ]]; then
      printf '%s\n' "$ATTACHMENTS_DIR/$cand"
      return 0
    fi
    if [[ -n "$EXCALIDRAW_DIR" && -f "$EXCALIDRAW_DIR/$cand" ]]; then
      printf '%s\n' "$EXCALIDRAW_DIR/$cand"
      return 0
    fi
  done
  return 1
}

# Collect unique embeds like ![[...]] from the stripped body (Bash 3.2 compatible)
EMBEDS=()
while IFS= read -r _embed_line; do
  EMBEDS+=("$_embed_line")
done < <(grep -oE '!\[\[[^]]+\]\]' "$body" | sed -E 's/^!\[\[//; s/\]\]$//' | sort -u || true)

export_excalidraw_to_svg() {
  # $1 = input .excalidraw path, $2 = output svg path
  local in="$1"
  local out="$2"
  if command -v npx >/dev/null 2>&1; then
    # Try to export via headless browser-based CLI for fidelity
    if npx -y excalidraw-brute-export-cli -i "$in" --format svg -o "$out" >/dev/null 2>&1; then
      [[ -f "$out" ]] && return 0
    fi
  fi
  return 1
}

if (( ${#EMBEDS[@]} > 0 )); then
  log "Found ${#EMBEDS[@]} embed(s) to process"
  for inner in "${EMBEDS[@]}"; do
    page="$inner"; alias=""
    if [[ "$inner" == *"|"* ]]; then
      page="${inner%%|*}"; alias="${inner#*|}"
    fi
    page="$(printf '%s' "$page" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    alias="$(printf '%s' "$alias" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"

    # If embed references a .excalidraw, try to resolve exported image first,
    # then auto-export to SVG if raw file exists and no export found.
    page_ext="${page##*.}"
    if [[ "$page_ext" == "excalidraw" ]]; then
      src_path=""
      if src_path="$(find_asset_for "$page")"; then
        : # found exported image variant
      else
        # Look for raw excalidraw file to export
        raw=""
        if [[ -f "$note_dir/$page" ]]; then raw="$note_dir/$page"; fi
        if [[ -z "$raw" && -n "$EXCALIDRAW_DIR" && -f "$EXCALIDRAW_DIR/$page" ]]; then raw="$EXCALIDRAW_DIR/$page"; fi
        if [[ -n "$raw" ]]; then
          base_no_ext="${page%.*}"
          out_svg="$POST_ASSETS_DIR/${base_no_ext}.svg"
          log "Exporting Excalidraw to SVG: $raw -> $out_svg"
          if export_excalidraw_to_svg "$raw" "$out_svg"; then
            src_path="$out_svg"
          else
            log "Warning: Excalidraw export failed for '$raw' (ensure Playwright deps may be installed: npx playwright install)"
          fi
        fi
      fi
    else
      src_path="$(find_asset_for "$page")" || src_path=""
    fi

    if [[ -n "$src_path" ]]; then
      base="$(basename "$src_path")"
      cp "$src_path" "$POST_ASSETS_DIR/$base"
      log "Copied asset: $src_path -> $POST_ASSETS_DIR/$base"
      alt="$alias"; [[ -z "$alt" ]] && alt="${base%.*}"
      old="![[${inner}]]"
      # Encode URL-sensitive chars (spaces, parentheses, #)
      encoded_base="$(printf '%s' "$base" | sed -e 's/ /%20/g' -e 's/(/%28/g' -e 's/)/%29/g' -e 's/#/%23/g')"
      new="![${alt}](/assets/images/${post_slug}/${encoded_base})"
      EMBED_OLD="$old" EMBED_NEW="$new" perl -0777 -pe 'BEGIN{$o=$ENV{"EMBED_OLD"};$n=$ENV{"EMBED_NEW"};} s/\Q$o\E/$n/g' "$body_images" > "$body_images.tmp" && mv "$body_images.tmp" "$body_images"
    else
      log "Warning: could not resolve asset for '$inner' (looked in '$note_dir', '$ATTACHMENTS_DIR', '$EXCALIDRAW_DIR')"
      # Leave as-is so it is visible during review
    fi
  done
fi
# --- End image handling ---

# Reassemble to temp files (site output uses rewritten body; source keeps embeds)
{
  echo "---"
  cat "$front"
  echo "---"
  cat "$body_images"
} > "$assembled_dest"

{
  echo "---"
  cat "$front"
  echo "---"
  cat "$body"
} > "$assembled_src"

# Copy assembled content to destination in repo
if cp "$assembled_dest" "$DEST"; then
  log "Exported to: $DEST"
else
  echo "Error: failed to write destination: $DEST" >&2
  exit 1
fi

# Also overwrite the original source file with updated content (embeds preserved)
if cp "$assembled_src" "$SRC"; then
  log "Overwrote source with updated content: $SRC"
else
  log "Warning: failed to overwrite source file: $SRC"
fi

if (( replacing )); then
  echo "updated $dest_base"
else
  echo "exported new $dest_base to blog."
fi