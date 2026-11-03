---
name: verify
description: Prove llmarcade.fun (this repo, a Vite and React single-page app with canvas games) works the way an anonymous visitor sees it. Runs pnpm run ci on the exact tree, serves the build with vite preview, drives Chromium over the DevTools protocol through every page, redirect, missing page and cabinet, and judges every row of the answer key against both the build and live production. Use before merging any PR into dev, after a deploy, and whenever a change touches pages, links, cabinets, the design system or the rules files.
---

# Verify llmarcade.fun

The answer key is `acceptance.md` in this folder, read from `origin/dev` only. Every check gets
its expected value from the key or from live production, never from the build under test. A
branch that edits the key fails KEY. The key changes only in its own PR.

The skill drives the site as an anonymous visitor. It never submits a form, never signs up or
logs in, and never uploads. The local build reads production Supabase with the public anon key,
so a write would be real. The tab fails every request to Supabase that is not a read (GET, or a
POST to an RPC named `get_*`) before it leaves the browser. D11 is the one row that presses PLAY.
That click calls `increment_play_count`, and the guard is there to stop it (on 2026-11-02 the app
never sent it, because it does not await the query). Every blocked write is tagged with its
phase. One made while D11's game plays goes to `blockedDuringD11`. Any other, before D11 or after
it (H1's `/dev` pages included), goes to `unexpectedWrites` and fails GUARD.

The skill runs on two hosts, because each reaches something the other cannot:

| Half | Host | Why |
|---|---|---|
| Live, `scripts/live.sh` | Any host that reaches `https://www.llmarcade.fun`, with Node 22 or later and Chrome or Chromium. It installs nothing | The Daytona sandbox resets TLS to `www.llmarcade.fun` and most other sites. It reaches GitHub, npmjs.com, Google Fonts and Supabase (checked 2026-11-02) |
| Build, `scripts/run-all.sh` | The build sandbox: Node 22, pnpm 10 and Chromium. 2 vCPU and 2 GiB worked on 2026-11-02, with memory near the limit while vite dev, vite preview and Chromium all ran | `pnpm install` and `pnpm run ci` need a writable checkout |

The build host's browser must also reach every third-party origin the pages load, or A8 fails
on the build side with `net::ERR_CONNECTION_RESET`. On 2026-11-02 that origin was
`lh3.googleusercontent.com` (leaderboard avatars on most cabinets), which the Daytona sandbox
resets. A8 has no exemption for the host's network. Such a FAIL is the host, not the site, when
the live side loads the same URL: say so in the report and rerun on a host with full egress.

Both halves run the same `scripts/browser.mjs`. Chromium is driven with a small DevTools client
over Node's global `WebSocket` (`scripts/cdp.mjs`), so the skill adds no dependency to the app.

## Results

Each row prints one line per side: `PASS`, `FAIL`, `WARN` (A7 only: an external link that
answers 4xx, times out or fails on the network), `KNOWN` (a failure the key lists under Known
defects), `CHANGED` (A11 only) or `HUMAN` (H rows, never `PASS`). Target rows print
`[target, step N]` with their build step from `llmarcade-DESIGN.md`.

The summary ends with these lines:

- `PASS|FAIL RECEIPT`: every result file passed `receipt.mjs`. It checks each file's schema, side and
  rows against the key, takes each row's status from the key, rejects a verdict the row cannot have
  (`WARN` outside A7, `CHANGED` outside A11, `KNOWN` for a row the key does not list, anything
  else unknown), requires a browser receipt to carry the rendered text of every Pages route and
  missing state and both guard lists, and accepts `browser-live.json` only when it was made against
  `https://www.llmarcade.fun`. A rejected file contributes no results.
- `PASS|FAIL COVER`: every key row has a result on every side it applies to, and every H row
  says `HUMAN`. A10, A11 and D12 have one result, on the build side. Every other row needs a
  build result and a live result. A result on one side never covers the other.
- `PASS|FAIL INVARIANTS failed_build=N failed_live=N`: invariant rows that failed, per side.
- `PASS|FAIL GUARD`: whether the site tried to write to Supabase while the skill browsed.
- `TARGETS targets_failed_build=N targets_failed_live=N build:[...] live:[...]`.
- `VERIFY_RESULT=pass|fail ...`. `pass` means KEY, RECEIPT, every invariant on both sides, COVER and
  GUARD passed. Targets and CHANGED do not change it. A PR that claims a target row must show
  that row out of `build:[...]`. After the deploy it must leave `live:[...]` too.

A missing key, browser, live run, or a live run older than 6 hours is FAIL. Nothing is skipped.

## Launch

### 1. The build sandbox, once

Any Linux host with Node 22, pnpm 10 (corepack), git, curl and Chromium. On Daytona, this
image works (2 vCPU, 2 GiB, 10 GiB disk):

```dockerfile
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core git ca-certificates
RUN corepack enable && corepack prepare pnpm@10 --activate
```

Check out the branch under test with `origin` pointing at GitHub, so `git fetch origin dev`
works. The sandbox holds no GitHub credential. If it cannot fetch, give it a read-only copy
of the repo as `origin`. Commits leave the sandbox as a patch and are pushed from a host with
push rights.

### Windows laptop

Jeff approved his Windows laptop as a host for this skill's verify runs on 2026-11-02, as an
exception to server-first coding. It covers verify runs only: `pnpm install` and the build
inside the llm-arcade checkout, then the browser rows. Both halves can run there.

- Git for Windows' Git Bash, Node 22 or later, Google Chrome at its default path (or `CHROME`
  set). `run-all.sh` finds `taskkill` instead of `setsid` and stops each server's whole Windows
  process tree.
- pnpm's major version must match the one `.github/workflows/ci.yml` pins. `run-all.sh` fails
  its preflight otherwise. Without changing the global pnpm, put a run-local folder first on
  `PATH` holding a `pnpm` script that runs `exec corepack pnpm@10 "$@"` and a `pnpm.cmd` that
  runs `corepack pnpm@10 %*`, both with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.
- Clone with `core.autocrlf false`, so the files the build and D12 read are the repo's bytes.
- `summary.txt` records the Node and pnpm versions on its `TOOLS` line.

### 2. The live half, each run

On a host that reaches production, with the key exactly as `origin/dev` has it:

```bash
git -C REPO show origin/dev:.claude/skills/verify/acceptance.md > /tmp/key.md
# or: gh api 'repos/Jeff-Kazzee/jolly-bear-cheer/contents/.claude/skills/verify/acceptance.md?ref=dev' --jq .content | base64 -d > /tmp/key.md
bash .claude/skills/verify/scripts/live.sh /tmp/arcade-live /tmp/key.md [CHROME]
# LIVE_RESULT=done browser_exit=0 out /tmp/arcade-live
```

Takes about 3 minutes. Copy the folder into the build sandbox (on Daytona, the toolbox file
upload). `run-all.sh` fails KEY if its `key.md` is not byte-identical to the origin/dev key, and
stops if `receipt.mjs` rejects its `browser-live.json`. `live.sh` takes a fourth argument, a
site other than production, for controls against a fixture. Such a receipt is never accepted as
the live verdict.

`live.sh` owns its output folder. It deletes the folder first, works in `OUT.partial`, and moves
it into place with its `stamp` only when the browser wrote a receipt. A failed rerun therefore
leaves no receipt at all, never an old one with a fresh stamp.

### 3. The run

```bash
bash .claude/skills/verify/scripts/run-all.sh /root/arcade-live /root/repo
```

`run-all.sh` does, in order: preflight, KEY, RECEIPT, A10 (removing any old `dist`, then
`pnpm install --frozen-lockfile` and `pnpm run ci`), D12, `vite preview` on port 4420 serving the `dist` that ci built, `vite` dev on
port 4431 for the `/dev/<slug>` screenshots, `browser.mjs build`, `parity.mjs` (A11),
`cover.mjs`, and cleanup. It took 4 minutes on 2 vCPU and 2 GiB on 2026-11-02. It sets
`NODE_OPTIONS=--max-old-space-size=1536` unless you set it.

## Drive

To look at one thing again after a run:

```bash
H=.claude/skills/verify/scripts; E=EVIDENCE_DIR
pnpm exec vite preview --host 127.0.0.1 --port 4420 --strictPort &
node $H/browser.mjs build http://127.0.0.1:4420 $E/key.json /usr/bin/chromium $E [http://127.0.0.1:4431]
node $H/parity.mjs $E/key.json $E
node $H/cover.mjs $E/key.json $E
```

How the checks see the page:

- Chromium runs headless with a fresh profile, a 1280 by 800 viewport, the UTC time zone and
  the `en-US` locale on both sides, whatever the host's settings.
- One tab is reused for every route. A route has rendered when it shows an `h1` with text, no
  `.animate-pulse` or `.animate-spin` element is visible, every finite animation has finished,
  and the path has not changed for 600 ms. The DevTools protocol has no network-idle wait.
- Visible means `checkVisibility` with opacity, a box larger than 1 px, and inside the page area
  a visitor can scroll to. Text is the rendered text of visible nodes, with a word break at every
  element that is not inline, and whitespace collapsed (non-breaking spaces included).
- Styles are effective computed values, read with `getComputedStyle`, pseudo-elements included.
- A7 opens every internal link target in the tab and judges it by the Missing pages table, so
  a `/game/<slug>` link anywhere is checked, not only the `/games` cards. External targets get
  one `HEAD` (or `GET` after 403 or 405) from the host's Node.
- Every route check compares origin and path, never the path alone. A link, redirect, click or
  page that ends on the key's path on another host fails A2, A3, A4, A6, A7 and D11, and a page
  that leaves the site cannot pass A1. D2's typestorm exemption, H1's `/dev` list and the load
  rows count only this site's own URLs.
- The live tab revalidates repeat assets and `vite preview` answers 304. No check reads an
  asset's status, so a 304 never fails a row.

The feature map in `features/` says which rows prove which visitor feature and the exact
selectors each check uses.

## Evidence

Each run writes `~/verify-evidence/<UTC>-<short head>/` (or `$VERIFY_EVIDENCE_ROOT/...`):

| File | What |
|---|---|
| `summary.txt` | Every result line and `VERIFY_RESULT` |
| `key.md`, `key.json` | The key exactly as read from `origin/dev`, and its parsed rows |
| `install.log`, `ci.log` | A10's two commands |
| `repo.json`, `browser-build.json`, `browser-live.json`, `parity.json` | The receipts: each row's verdict and details, per side. The two browser receipts also hold the rendered text of every route A11 compares |
| `cover.txt` | RECEIPT, COVER, INVARIANTS, GUARD and TARGETS |
| `screens/` | Per side: every Pages route (full page), every cabinet, both missing states, each A4 click, H2's form, H3's home page at 1440 and 390, D11's running game, and on the build side every `/dev/<slug>` |
| `live.log`, `preview.log`, `dev.log` | The live half's output and the two servers |

H1 lists every cabinet route with its screenshot, and on the build side the cabinets this
branch changes (from `git diff origin/dev HEAD` under `src/games/` and `public/games/`). For a
cabinet PR, Jeff plays the changed cabinet on `/dev/<slug>` with `pnpm dev`, then on
`/game/<slug>` after the deploy.

## Cleanup

`run-all.sh` stops both servers by process group when it exits, even on failure, or by process
when a server leads no group. On Windows it stops each server's process tree with `taskkill`. `run` executes in the script's own shell, not in a pipeline, so the
EXIT trap sees the servers it started. Chrome exits with `browser.mjs`, even when the run dies.
Its temporary profile is removed after Chrome exits when the tab closes and when launch or setup
fails. When the run dies, removal is best effort, because an exit hook cannot wait for Chrome.
Evidence stays. Stop the sandbox when you
pause.

## Isolation

One run at a time per host. The ports are fixed: 4420 for preview and 4431 for dev. `run-all.sh`
refuses to start while either answers.

## Gotchas

Known limits of the checks, proved by the Reviewer on PR #40 (2026-11-02). None appears in the
approved mockups. Fix the check before a design uses one.

- D9 matches each text piece on its own. An unlinked number split across elements, such as
  `<span>3</span>90`, is not seen as 390 and passes.
- D10 leaves out linked text in the strip, though the key does not. A strip whose own number is
  a link, such as `<a href="/game/brickstorm">303</a>`, fails D10.
- D4 takes any `radial-gradient` on a tile of 32px or less as ground dots. A small radial wash,
  such as a red-to-blue tile of 20px behind a heading, passes.
- Text drawn with CSS `content` is read only where a check says so (D3, D9, D10). Its box is
  taken as its element's.
- D6 reads a `::before` or `::after` fill only when it is absolutely positioned. It ignores
  `background-image`, a pseudo-element's border radius, and any transform but a translation.
- D3 and D6 judge computed values, as the key says. A `transform: scale()` can draw VT323 text
  smaller than its computed 20px, and an ancestor's `opacity` can lighten ink text. Neither fails.
- An event is tagged with the page the tab showed when it arrived. One that arrives just after a
  navigation commits is counted against the new page.
- A receipt is not signed. `receipt.mjs` checks its origin, side, schema, rows, verdicts and the
  key, and `run-all.sh` checks its age from the `stamp` file, but a hand-edited receipt can still
  lie. Run `live.sh` yourself.

## Helpers

| Script | Purpose |
|---|---|
| `scripts/live.sh OUT KEY_MD [CHROME] [SITE]` | The live half |
| `scripts/run-all.sh LIVE_DIR [REPO]` | The whole build run |
| `scripts/browser.mjs SIDE BASE KEY_JSON CHROME EVIDENCE [DEV_URL]` | Every browser row on one side |
| `scripts/cdp.mjs` | The DevTools client and the Supabase write guard |
| `scripts/repo.mjs` | A10 from `ci.log`, and D12 |
| `scripts/parity.mjs KEY_JSON EVIDENCE` | A11 |
| `scripts/receipt.mjs KEY_JSON FILE` | Checks one receipt against the key, and live against production |
| `scripts/cover.mjs KEY_JSON EVIDENCE` | RECEIPT, COVER, INVARIANTS, GUARD and TARGETS |
| `scripts/key.mjs KEYFILE` | Parses the key to JSON |

To keep this skill true as the site changes, run `/maintain-verification-skill`.
