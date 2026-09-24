#!/usr/bin/env bash
# Sync the desk into a mounted %browser desk and commit it from the dojo.
# Usage: scripts/install.sh <pier>/browser [tmux-session]
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:?usage: install.sh <pier>/browser [tmux-session]}"
session="${2:-}"
node "$here/scripts/build-runtime.mjs" >/dev/null
rsync -a --delete --exclude '.git' "$here/desk/" "$target/"
echo "synced desk -> $target"
if [ -n "$session" ]; then
  tmux send-keys -t "$session" "|commit %browser" Enter
  echo "sent |commit %browser to tmux session $session"
fi
