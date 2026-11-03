#!/usr/bin/env bash
# The whole run on the build host. Usage: run-all.sh LIVE_DIR [REPO]
# LIVE_DIR is a live.sh folder less than 6 hours old. Runs KEY, A10 and D12 on the checkout,
# serves the build with vite preview (and vite dev for the /dev screenshots), drives the build
# side, compares text with live (A11) and checks COVER. Prints VERIFY_RESULT=pass|fail and exits
# to match. Keeps the evidence folder.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LIVE_DIR="$(cd "${1:?usage: run-all.sh LIVE_DIR [REPO]}" && pwd)" || exit 1
REPO="$(cd "${2:-$HERE/../../../..}" && pwd)"
KEY_PATH=.claude/skills/verify/acceptance.md
PREVIEW_PORT=4420
DEV_PORT=4431
CHROME="${CHROME:-$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
# Git Bash on Windows (SKILL.md, Windows laptop) has no setsid. There each server is stopped with
# taskkill over its Windows process tree instead of with a process-group signal.
WINDOWS=0
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) WINDOWS=1 ;; esac
[ $WINDOWS = 1 ] && [ -z "$CHROME" ] && [ -x "/c/Program Files/Google/Chrome/Application/chrome.exe" ] && CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"

for tool in node pnpm git curl $([ $WINDOWS = 1 ] && echo taskkill || echo setsid); do
  command -v "$tool" > /dev/null || { echo "VERIFY_RESULT=fail $tool is missing"; exit 1; }
done
[ -n "$CHROME" ] || { echo "VERIFY_RESULT=fail no Chromium on this host, set CHROME"; exit 1; }
# A10 runs the repo's own CI, so pnpm's major version must be the one the CI workflow pins.
ci_pnpm=$(sed -n '/pnpm\/action-setup/,/version:/s/^ *version: *\([0-9][0-9]*\).*/\1/p' "$REPO/.github/workflows/ci.yml" | head -1)
host_pnpm=$(pnpm -v 2> /dev/null)
[ -n "$ci_pnpm" ] && [ "${host_pnpm%%.*}" = "$ci_pnpm" ] || { echo "VERIFY_RESULT=fail pnpm $host_pnpm here, the CI workflow pins pnpm $ci_pnpm"; exit 1; }
for f in browser-live.json key.md stamp; do
  [ -s "$LIVE_DIR/$f" ] || { echo "VERIFY_RESULT=fail $LIVE_DIR/$f is missing, run live.sh first"; exit 1; }
done
age=$(( $(date -u +%s) - $(cat "$LIVE_DIR/stamp") ))
[ "$age" -lt 21600 ] || { echo "VERIFY_RESULT=fail the live run is $((age / 3600)) hours old, run live.sh again"; exit 1; }
for p in $PREVIEW_PORT $DEV_PORT; do
  ! curl -s -o /dev/null -m 2 "http://127.0.0.1:$p/" || { echo "VERIFY_RESULT=fail port $p is busy, an earlier run is still up"; exit 1; }
done

RUN="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$REPO" rev-parse --short HEAD)"
EVIDENCE="${VERIFY_EVIDENCE_ROOT:-$HOME/verify-evidence}/$RUN"
mkdir -p "$EVIDENCE/screens"
cp "$LIVE_DIR"/browser-live.json "$EVIDENCE/"
cp "$LIVE_DIR"/live.log "$EVIDENCE/" 2> /dev/null
cp "$LIVE_DIR"/screens/live-* "$EVIDENCE/screens/" 2> /dev/null
PIDS=()
# Stops each server's process group, or the server itself when it leads no group. On Windows it
# stops the server's Windows process tree, so vite's own node children go too.
stop_servers() {
  for p in "${PIDS[@]}"; do
    if [ $WINDOWS = 1 ]; then
      # A server that already exited has no Windows PID left, and nothing to stop.
      local winpid
      winpid=$(cat "/proc/$p/winpid" 2> /dev/null) && taskkill //T //F //PID "$winpid" > /dev/null 2>&1
    else kill -- "-$p" 2> /dev/null || kill "$p" 2> /dev/null; fi
  done
  PIDS=()
}
trap stop_servers EXIT
trap 'exit 130' INT TERM

# Starts a server in its own session (on Linux) so cleanup can stop the whole group, and waits
# for 200 on /.
serve() {
  local port=$1 log=$2; shift 2
  if [ $WINDOWS = 1 ]; then (cd "$REPO" && exec "$@" > "$log" 2>&1) &
  else (cd "$REPO" && exec setsid "$@" > "$log" 2>&1) &
  fi
  PIDS+=($!)
  for _ in $(seq 1 90); do
    [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$port/")" = 200 ] && return 0
    sleep 1
  done
  return 1
}

run() {
  local status=0
  echo "BUILD $(git -C "$REPO" rev-parse HEAD) tree $(git -C "$REPO" rev-parse 'HEAD^{tree}')$(git -C "$REPO" diff --quiet HEAD || echo ' plus uncommitted changes')"
  echo "TOOLS node $(node -v) pnpm $host_pnpm $(uname -s)"

  # KEY: the key comes from origin/dev. A branch that edits it, no copy on dev, or a live run
  # judged with another key, fails.
  local key_ok=1
  git -C "$REPO" fetch -q origin dev || key_ok=0
  # Git Bash would rewrite "origin/dev:<path>" as a Windows path list. Elsewhere this is ignored.
  MSYS2_ARG_CONV_EXCL='origin/dev:' git -C "$REPO" show "origin/dev:$KEY_PATH" > "$EVIDENCE/key.md" 2> /dev/null || key_ok=0
  [ -s "$EVIDENCE/key.md" ] || key_ok=0
  # The checkout's key, as git stores it, so a Windows clone that writes CRLF compares equal.
  [ "$(git -C "$REPO" hash-object "$KEY_PATH")" = "$(MSYS2_ARG_CONV_EXCL='origin/dev:' git -C "$REPO" rev-parse "origin/dev:$KEY_PATH")" ] || key_ok=0
  git -C "$REPO" diff --quiet origin/dev HEAD -- "$KEY_PATH" || key_ok=0
  node "$HERE/key.mjs" "$EVIDENCE/key.md" > "$EVIDENCE/key.json" || key_ok=0
  if [ $key_ok = 0 ]; then
    echo "FAIL    KEY  the key is missing on origin/dev, unreadable, or changed by this branch"; echo "VERIFY_RESULT=fail no trustworthy key"; return 1
  fi
  if ! cmp -s "$EVIDENCE/key.md" "$LIVE_DIR/key.md"; then
    echo "FAIL    KEY  the live run used a key that differs from origin/dev, run live.sh again"; echo "VERIFY_RESULT=fail"; return 1
  fi
  echo "PASS    KEY  the key is the origin/dev copy, this branch does not change it, and live used the same"
  # The live receipt counts only when it was made against production and fits the key.
  if ! node "$HERE/receipt.mjs" "$EVIDENCE/key.json" "$EVIDENCE/browser-live.json"; then echo "VERIFY_RESULT=fail the live receipt is not a production live run"; return 1; fi
  echo "LIVE    $(( age / 60 )) minutes old"

  # A10 and D12 on the exact tree. A dist left by an earlier build must not stand in for this one.
  rm -rf "$REPO/dist"
  (cd "$REPO" && pnpm install --frozen-lockfile) > "$EVIDENCE/install.log" 2>&1
  local install_exit=$? ci_exit=skipped
  if [ $install_exit = 0 ]; then (cd "$REPO" && pnpm run ci) > "$EVIDENCE/ci.log" 2>&1; ci_exit=$?; fi
  node "$HERE/repo.mjs" "$EVIDENCE/key.json" "$REPO" "$EVIDENCE" "$install_exit" "$ci_exit" || status=1

  # The browser rows on the dist that ci just built.
  if [ ! -f "$REPO/dist/index.html" ]; then echo "FAIL    the build produced no dist, nothing to drive"; echo "VERIFY_RESULT=fail"; return 1; fi
  if ! serve $PREVIEW_PORT "$EVIDENCE/preview.log" pnpm exec vite preview --host 127.0.0.1 --port $PREVIEW_PORT --strictPort; then
    echo "FAIL    vite preview did not answer on $PREVIEW_PORT, see preview.log"; echo "VERIFY_RESULT=fail"; return 1
  fi
  local dev_url=""
  if serve $DEV_PORT "$EVIDENCE/dev.log" pnpm exec vite --host 127.0.0.1 --port $DEV_PORT --strictPort; then dev_url="http://127.0.0.1:$DEV_PORT"
  else echo "NOTE    vite dev did not start, H1 has no /dev screenshots, see dev.log"; fi
  CHANGED_CABINETS="$(git -C "$REPO" diff --name-only origin/dev HEAD | sed -nE 's#^src/games/([a-z0-9-]+)/.*#\1#p; s#^public/games/([a-z0-9-]+)\.html$#\1#p' | sort -u | tr '\n' ' ')" \
    node "$HERE/browser.mjs" build "http://127.0.0.1:$PREVIEW_PORT" "$EVIDENCE/key.json" "$CHROME" "$EVIDENCE" $dev_url || status=1
  stop_servers

  echo "LIVE    results from $LIVE_DIR/live.log:"
  grep -E '^(PASS|FAIL|WARN|KNOWN|HUMAN) +[ADH][0-9]+ +live|GUARD' "$EVIDENCE/live.log" | sed 's/^/        /'
  node "$HERE/parity.mjs" "$EVIDENCE/key.json" "$EVIDENCE" || status=1
  node "$HERE/cover.mjs" "$EVIDENCE/key.json" "$EVIDENCE" > "$EVIDENCE/cover.txt" || status=1
  cat "$EVIDENCE/cover.txt"
  echo "VERIFY_RESULT=$([ $status = 0 ] && echo pass || echo fail) $(sed -n 's/^TARGETS //p' "$EVIDENCE/cover.txt") evidence $EVIDENCE"
  return $status
}
# run stays in this shell, so the PIDs serve() records are the ones the EXIT trap stops. Only
# the output goes through tee.
exec > >(tee "$EVIDENCE/summary.txt") 2>&1
run
exit $?
