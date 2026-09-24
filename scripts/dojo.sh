#!/usr/bin/env bash
# Run one dojo command in a tmux session and print only the output it produced.
# Usage: scripts/dojo.sh <tmux-session> "<command>" [timeout-seconds] [done-regex]
# The command is considered finished when the new output matches done-regex
# (default: the dojo prompt reappears after some output) or the timeout passes.
set -uo pipefail
session="$1"; cmd="$2"; timeout="${3:-120}"; done_re="${4:-}"
# clear whatever is left on the input line
tmux send-keys -t "$session" C-e; sleep 0.3; tmux send-keys -t "$session" C-u; sleep 0.3; for _ in $(seq 1 60); do tmux send-keys -t "$session" BSpace; sleep 0.03; done
sleep 0.5
last="$(tmux capture-pane -p -t "$session" | grep -v '^$' | tail -1)"
case "$last" in *dojo\>) ;; *) echo "dojo prompt not clean: $last" >&2; exit 2;; esac
tmux clear-history -t "$session"
before="$(tmux capture-pane -p -S - -t "$session" | wc -l)"
tmux send-keys -t "$session" -- "$cmd" Enter
elapsed=0
while :; do
  sleep 2; elapsed=$((elapsed+2))
  all="$(tmux capture-pane -p -S - -t "$session")"
  new="$(printf '%s\n' "$all" | tail -n +"$((before+1))")"
  if [ -n "$done_re" ] && printf '%s\n' "$new" | grep -qE "$done_re"; then break; fi
  if [ -z "$done_re" ] && printf '%s\n' "$new" | grep -q '>=' && [ "$(printf '%s\n' "$new" | grep -v '^$' | tail -1)" = "~zod:dojo>" ] && [ "$(printf '%s\n' "$new" | grep -vc '^$')" -gt 2 ]; then break; fi
  [ "$elapsed" -ge "$timeout" ] && break
done
printf '%s\n' "$new" | grep -v '^$'
