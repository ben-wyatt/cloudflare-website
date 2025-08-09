#!/usr/bin/env bash
set -euo pipefail

# Quiet by default; set VERBOSE=1 to see progress logs on stderr
VERBOSE="${VERBOSE:-0}"
log() { if [[ "$VERBOSE" == "1" ]]; then printf '%s\n' "$*" >&2; fi; }

# --- CONFIG ---
# Update this to your local repo path if different:
REPO_DIR="$HOME/Repos/personal/website"
POSTS_DIR="$REPO_DIR/src/posts"
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
body="$tmpdir/body.md"
newfront="$tmpdir/newfront.yml"
assembled="$tmpdir/assembled.md"

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

# Reassemble once to a temp file
{
  echo "---"
  cat "$front"
  echo "---"
  cat "$body"
} > "$assembled"

# Copy assembled content to destination in repo
if cp "$assembled" "$DEST"; then
  log "Exported to: $DEST"
else
  echo "Error: failed to write destination: $DEST" >&2
  exit 1
fi

# Also overwrite the original source file with updated content
if cp "$assembled" "$SRC"; then
  log "Overwrote source with updated content: $SRC"
else
  log "Warning: failed to overwrite source file: $SRC"
fi

if (( replacing )); then
  echo "updated $dest_base"
else
  echo "exported new $dest_base to blog."
fi