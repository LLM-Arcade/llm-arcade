#!/usr/bin/env bash
# The live half, on any host that reaches https://www.llmarcade.fun.
# Usage: live.sh OUT KEY_MD [CHROME] [SITE]
#   KEY_MD is the key exactly as origin/dev has it. run-all.sh fails KEY if it differs.
# Needs Node 22 or later and a Chrome or Chromium. Installs nothing.
# OUT belongs to this script. A run first removes OUT, so an earlier receipt never outlives a
# failed rerun. It works in OUT.partial and moves it to OUT, stamp last, only when the browser
# wrote a receipt.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?usage: live.sh OUT KEY_MD [CHROME] [SITE]}"
KEY_MD="${2:?usage: live.sh OUT KEY_MD [CHROME] [SITE]}"
SITE="${4:-https://www.llmarcade.fun}"
CHROME="${3:-}"
if [ -z "$CHROME" ]; then
  for c in chromium chromium-browser google-chrome "/c/Program Files/Google/Chrome/Application/chrome.exe"; do
    if command -v "$c" > /dev/null 2>&1 || [ -x "$c" ]; then CHROME="$c"; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "LIVE_RESULT=fail no Chrome or Chromium found, pass its path as the third argument"; exit 1; }
case "$OUT" in / | . | .. | "$HOME") echo "LIVE_RESULT=fail OUT must be a folder of its own, not $OUT"; exit 1 ;; esac
STAGE="$OUT.partial"
rm -rf "$OUT" "$STAGE"
mkdir -p "$STAGE"
started=$(date -u +%s)
cp "$KEY_MD" "$STAGE/key.md"
node "$HERE/key.mjs" "$STAGE/key.md" > "$STAGE/key.json" || { echo "LIVE_RESULT=fail the key does not parse"; exit 1; }
node "$HERE/browser.mjs" live "$SITE" "$STAGE/key.json" "$CHROME" "$STAGE" 2>&1 | tee "$STAGE/live.log"
rc=${PIPESTATUS[0]}
# browser.mjs writes its receipt last, so a receipt here means it finished. Exit 1 with a receipt
# is a finished run whose invariants failed. run-all.sh judges those.
[ -s "$STAGE/browser-live.json" ] || { echo "LIVE_RESULT=fail browser.mjs exit $rc wrote no receipt, nothing published"; exit 1; }
echo "$started" > "$STAGE/stamp"
mv "$STAGE" "$OUT"
[ "$SITE" = https://www.llmarcade.fun ] || echo "NOTE    $SITE is not production. run-all.sh and cover.mjs reject this receipt as a live verdict"
echo "LIVE_RESULT=done browser_exit=$rc out $OUT"
