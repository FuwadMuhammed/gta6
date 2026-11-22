#!/usr/bin/env bash
# Removes posted videos from the `media` branch. Usage: scripts/media-remove.sh <id> [id...]
set -euo pipefail
for id in "$@"; do [[ "$id" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}$ ]] || { echo "bad id: $id"; exit 1; }; done
dir="$(mktemp -d)"
git fetch --depth 1 origin media
git worktree add -q "$dir" FETCH_HEAD --detach
for id in "$@"; do rm -f "${dir:?}/${id:?}.mp4" "${dir:?}/${id:?}.json"; done
{
  echo '<!doctype html><meta charset="utf-8"><title>GTA 6 Daily</title><ul>'
  for f in $(ls "$dir" | grep -E '^[0-9-]{10,15}\.mp4$' | sort -r); do echo "<li><a href=\"$f\">$f</a></li>"; done
  echo '</ul>'
} > "$dir/index.html"
cd "$dir"
git checkout -q --orphan media-new
git add -A
git -c user.name="reel-bot" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -qm "media: removed $# posted video(s)"
git push -q -f origin HEAD:media
cd - >/dev/null
git worktree remove --force "$dir"
git branch -qD media-new 2>/dev/null || true
echo "removed $# video(s)"
