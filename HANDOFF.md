# LLM Arcade — Handoff

A social arcade built entirely by AI agents. 30 games at launch, high scores,
achievements, badges, streaks. Full product spec: `.dyad/plans/chat-1-plan.md`.
Decision history: `DEVLOG.md`.

**Production domain: `llmarcade.fun`** — Supabase auth URL config (Site URL
+ `/**` redirect allow-list, alongside `http://localhost:8080/**` for dev)
and Google OAuth origins use it.

## Current state

**Cloudflare recovery / PR #2 (2026-11-09):** the isolated task branch retains
guest cards and persistent scores plus optional Clerk accounts; production still
uses its existing deployment. The parent confirmed creation of the free LLM Arcade
Development app with verified email codes, passwords/email links/Google off. No
keys have been accessed or placed. The Cloudflare FAQ now describes that flow and
the guest cookie/recovery limits; the legacy FAQ copy stays on the legacy path.
Backup download and Worker HTTP remain blocked by executor CONNECT 403; Vercel
project/API access and exact preview origin remain unresolved. Preserve those
gates: verified backup → additive storage upgrade → Worker → frontend preview →
full acceptance before any merge or production deployment. Exact setup and key
placement approvals: `cloudflare-backend/SETUP_AND_ACCEPTANCE.md`.
The guest rate-limit regression now controls the clock across a minute boundary
instead of assuming eleven HTTP requests share a wall-clock minute; HTTP route
limiter wiring remains covered. Production rate limits are unchanged.

**Session 23: Lastwatch, the 3D flagship, is playable end to end on
`feature/lastwatch-game`** (engine + harness + three.js realm + synth
audio + live playtest round one). `/dev/lastwatch` on the worktree's dev
server; `pnpm test:games` now includes its harness. Blocked on: key art
(image generation down) and Jeff's final playtest verdict before the PR
to dev. Seed and publish SQL are files under `db/`, unrun.

**Branch and release contract (session 19):** `dev` is the default
integration branch, `prod` is the only production release branch, and
legacy `main` is frozen. Cabinet work uses one
`feature/<game>-<scope>` branch per game, opened from `dev`; CI must pass
before PR merge to `dev`, and again on the `dev → prod` release PR.
GitHub protection requires the `check` job and pull requests for admins too.
The gate is `pnpm run ci` (lint, typecheck, build, Hyper Circuit harness,
Run 'n Gunner harness). Full procedure: `docs/BRANCH-WORKFLOW.md`.

**Phase 4 complete; Phase 6 in progress (sessions 11–18, user-directed:
games before chat).** Shipped so far: **Munch Maze** (A,
`src/games/munch-maze/`, 7 ach), **Rune & Ruin** (A, `src/games/rune-ruin/`,
8 ach), **Trailbound** (B, `public/games/trailbound.html`, 7 ach),
**Starfall Squadron** (A, `src/games/starfall-squadron/`, 7 ach),
**Rockbuster** (B, `public/games/rockbuster.html`, 7 ach), **Boulder Rush**
(B, `public/games/boulder-rush.html`, 7 ach), and **Hyper Circuit** (A,
`src/games/hyper-circuit/`, 7 ach), and **Run 'n Gunner** (A,
`src/games/run-n-gunner/`, 7 ach) — all published.
**TypeStorm** (B, `public/games/typestorm.html`, 8 ach) is built and
tuned but has NO games row on purpose: it goes through the upload
wizard as the pipeline's first real submission, and the approval RPC
creates its rows. **User-set queue for the next builds: the flagship
trio.** The Phase-4 pipeline test with a
second account was explicitly skipped (user decision) — the upload
wizard/admin queue remain untested with real traffic. Site still gated
(`site_settings.launched = false`, guests → Landing, signed-in → Arcade
Home + preview banner). **1 account (the admin), 9 published cabinets. The
six session-11–15 cabinets have NOT been playtested by a human yet.**

**⚖️ Asset diet (user-mandated, session 13 — see AI_RULES):** in-game art
must be light. Prompt sprites as **flat solid color, NO grain/noise/
gradients** (grain is what bloats PNGs — key-art tiles only), few small
sheets, flat-color backgrounds, instancing over extra frames. Starfall
proof: 1.18 MB total vs Munch Maze 4.3 MB / Trailbound 4.5 MB.

| Route | Page | Notes |
|---|---|---|
| `/` | `LaunchGate` → `Landing` (guests) or `Home` (signed-in) | Spotlight hero honors the admin pick (`site_settings.spotlight_game_id`), falls back to featured/most-played |
| `/games`, `/game/:slug` | open pre-launch | unchanged |
| `/creator/:username` | `CreatorProfile` | unchanged |
| `/login` + `/signup` | `Login` | sign-up-first via `na-known-player`; all CTAs via `authCta()` |
| `/upload` | `Upload` (auth-gated) | 3-step wizard: metadata + manifest editor → files → **test flight** (srcDoc sandbox + SDK checklist; submit needs READY + SCORE) |
| `/uploads` | `MyUploads` (auth-gated) | status chips, rejection reasons verbatim, "Upload new version" / "Fix & resubmit" (carries prior submission via location state) |
| `/admin` | `Admin` (admin role only) | Review queue (badge count) · Games · Players · Signups · Site |
| `/settings`, `/faq`, `/playtest` | unchanged | |

## The upload pipeline (implemented)

1. Creator runs the wizard: manifest edited as a form (max 12, slugs
   auto-kebab), HTML ≤5 MB validated client-side, key art required for new
   games (optional on versions — keeps current art), test flight boots the
   file with `srcDoc` + `sandbox="allow-scripts"` and records the checklist
   (ready/score/achievement/save + invalid slug warnings).
2. Files upload to the **public `games` Storage bucket** (5 MB cap,
   html/png/jpg/webp only; INSERT policy restricts to `<uid>/…` folder; no
   client update/delete — files immutable per version). Row inserted into
   `game_submissions` (`pending`; RLS: own+admin SELECT, own INSERT only —
   max 3 pending, manifest must be array ≤12).
3. Admin reviews in `/admin`: sandbox preview straight from Storage,
   **manifest diff** vs the approved `achievements` set (+/~/− with a
   "removed = unlocks deleted" warning), submit-time checklist chips.
4. `admin_review_submission` RPC (SECURITY DEFINER): reject stores the
   reason verbatim; approve validates the manifest server-side, creates or
   updates the `games` row (track B, published, `html_path`/`art_url` =
   full Storage public URLs), **syncs `achievements` by (game_id, slug)**
   (upsert + prune, prune cascades user_achievements), awards the
   **Creator badge** (idempotent), stamps the submission.

## Admin console (all writes via SECURITY DEFINER RPCs, `is_admin()` inside)

`admin_review_submission` · `admin_wipe_scores` (returns count) ·
`admin_set_role` (can't change own role; playtester badge auto-fires via
existing trigger) · `admin_update_game` (status/featured) ·
`admin_set_spotlight` (published-only, NULL = automatic) ·
`admin_set_launched` · `admin_review_playtest` (approve → sets profile role
to playtester by email match iff current role is player). EXECUTE revoked
from PUBLIC/anon, granted to authenticated; the role check is server-side.

## Munch Maze (Track A reference implementation)

`src/games/munch-maze/` — registered in `src/games/registry.ts` (lazy):

- `maze.ts` — original 19×21 layout as strings (`#.o =GTP` legend), grid
  helpers, scatter corners, house/door/berry tiles. NOT the classic maze
  (IP hygiene).
- `engine.ts` — framework-free class: center-snapped grid movement
  (`stepActor` — turns only at tile centers, tunnel wrap, instant player
  reversal), 4 ghost personalities (chase / 4-ahead ambush / mirror-through-
  Rusty / shy), 7s scatter · 20s chase cycles (frightened pauses the clock),
  staggered house releases, eaten ghosts fade + respawn in house (**no eyes
  sprite — deliberate, avoids programmatic art**), berry at 60/120 seeds,
  per-run achievement flags, event queue drained by the component.
- `sprites.ts` — runtime magenta chroma-key + **gap-based sheet slicing**
  (falls back to equal columns), per-frame bbox trim. Track A is
  same-origin so canvas readback is legal — no data-URI trick needed.
- `render.ts` — hedge-pattern walls, sprite placement only (rotate/mirror
  muncher, bob ghosts, pulse acorns, death spin = transforms, not drawing).
- `audio.ts` — tiny WebAudio synth blips, `M` mute.
- `MunchMaze.tsx` — rAF loop, HUD (score/maze/lives/pause/mute), arrows +
  WASD + swipe, auto-pause on tab hide, READY/PAUSED/CLEAR overlays.

Assets: `public/assets/games/munch-maze/{muncher,ghosts,items,hedge}.png`
(muncher = 2-frame sheet, ghosts = 5-frame: 4 colors + frightened cream,
items = seed/acorn/berry, hedge = seamless texture). Achievement slugs fired
by the engine MUST match the seeded `achievements` rows: `first-maze`,
`full-course`, `untouchable`, `ghost-hunter`, `seed-baron`, `deep-runner`,
`maze-legend`.

## Rune & Ruin (Track A, the Text & Originals shelf)

`src/games/rune-ruin/` — classic-Rogue homage, **rendered as a real
character grid** (JetBrains Mono spans in the DOM — typography, not canvas;
this is the house style for text-shelf games and sits cleanly inside the
no-programmatic-art rule). Turn-based: the shell calls
`engine.playerAct()` per input and drains the same event-queue contract as
Munch Maze — no rAF loop.

- `dungeon.ts` — 40×22 procgen (scattered rooms + L-corridors + one loop),
  Bresenham LOS, radius-7.5 FOV with remembered-tile dimming.
- `content.ts` — 9-monster bestiary (depth-banded, traits: slow/fast/
  erratic), 5 weapons / 4 armors, the board palette (warm terminal, no blue).
- `engine.ts` — bump combat, XP levels (×1.7 curve), auto-equip gear,
  bitterroot tonics (Q), gold/runes, staggered monster wake (LOS + radius 8),
  regen 1 HP/10 turns, score = descents + kills·3xp + gold + runes·150,
  cap 200k. Death fires `gameover` → GamePlayer's own RUN OVER panel handles
  restart (no in-game restart flow needed for turn-based cabinets).
- `RuneRuin.tsx` — ResizeObserver-fitted glyph grid, HUD (HP bar, tonic
  button), 3-line message log with tones, touch D-pad with hold-repeat
  (`pointer: coarse` only), vi keys supported, 80 ms input throttle so held
  keys walk instead of sprint.

Achievement slugs (must match seeded rows): `first-blood`, `delver`,
`deep-delver`, `abyss-walker`, `rune-keeper`, `slayer`, `hoarder`,
`golem-breaker`. Key art: `public/assets/games/rune-ruin.png`.

## Trailbound (Track B, dev-hosted like Flap Hero)

`public/games/trailbound.html` — Oregon Trail homage, single **1.17 MB**
file (dieted in session 16 from 4.48 MB: panorama quantized, wagon
pre-keyed + pre-trimmed at build time so the runtime chroma-key block is
gone), **fully original geography** (Split Creek → Golden
Valley, 1,120 mi; invented forts/rivers — zero MECC IP). Day-tick travel
loop (640 ms auto-days), pace × rations × weather, 5-member party HP,
choice-modal events, fort trading, depth-based river fords, stop-the-marker
hunt. Survivor score = survivors·500 + health·2 + supplies + speed bonus
(party wipe → miles·2), cap 10k. Journey panorama pans with trail progress;
wagon sprite is magenta-keyed at runtime (data URIs aren't origin-tainted
in the sandbox). Achievement slugs: `wheels-west`, `halfway-there`,
`river-runner`, `sharp-eye`, `golden-valley`, `swift-wheels`,
`no-one-left`. Balance knobs: PACES/RATIONS/LANDMARKS/event weights at the
top of the `<script>`.

## Starfall Squadron (Track A, Arcade shelf)

`src/games/starfall-squadron/` — Galaga homage, second sprite-pipeline
cabinet, registered lazy in the registry. Portrait 360×560 logical canvas.
`engine.ts`: 40-enemy formation (sway + breathe), bezier entries/dives,
dive scheduler scaling by wave, aimed diver shots, challenge waves every
4th (perfect = +3000), kill chains (×2 at 5, ×3 at 10), extra ship at 30k.
**Capture loop:** captor beam-dives → tractor cone → captured fighter rides
the captor; kill it MID-DIVE to rescue → dual fighter; kill it in
formation → fighter lost. `sprites.ts` is the Munch Maze gap-slicer
pointed at two flat sheets (`public/assets/games/starfall-squadron/
{ships,fx}.png`, 1.18 MB total — the asset-diet reference). Starfield and
beam are instanced/stretched generated sprites. Wave breather runs on
engine time (pause-safe, no setTimeout). Achievement slugs: `first-sortie`,
`hot-streak`, `unbroken`, `wingmate`, `perfect-volley`, `squadron-leader`,
`star-ace`. Balance knobs: difficulty getters (`diveInterval`, `maxDivers`,
`enemyShotSpeed`) + POINTS/RADII at the top of `engine.ts`.

## Rockbuster (Track B, dev-hosted, the asset-diet Track-B reference)

`public/games/rockbuster.html` — Asteroids homage, single **1.26 MB** file
(vs Trailbound's 4.48 MB — the diet works for Track B too). Two flat
magenta sheets inlined as data URIs (ships/fx: ship, flame, saucer,
bullet, spark · rocks: 3 variants), keyed + gap-sliced at runtime with
equal-column fallback and bbox trim. **Instancing:** one rock sheet at 3
scales = L/M/S; saucer at 2 scales = big/small; the spark sprite is
starfield + explosions + saucer bullets. Classic loop: wraparound, rocks
split L→2M→4S (20/50/100), max-4 bullets inherit ship velocity, big
saucer (200, random fire) / small saucer (1000, aim error shrinks with
score), Shift/H hyperspace (14% death risk), extra ship per 10k,
safe-spot respawn, fields 4→11 rocks. Balance knobs in `TUNE` at the top
of the `<script>`. Touch pads via `pointer: coarse`; WebAudio synth; M
mute; auto-pause on tab hide. Achievement slugs: `first-blast`,
`clean-sweep`, `saucer-down`, `dead-eye`, `untouchable`, `deep-space`,
`rock-legend` (15k; run economy ≈ 2–6k per field + saucers, cap 5M).
One `ARCADE_SCORE` per run at game over.

## Boulder Rush (Track B, dev-hosted, second diet cabinet)

`public/games/boulder-rush.html` — Boulder Dash homage, single **1.43 MB**
file. Two flat magenta sheets inlined as data URIs (tiles: dirt, brick,
steel, hatch closed/open · actors: miner, boulder, gem, gnat, beetle,
spark), keyed + gap-sliced at runtime (Rockbuster's recipe). **Procedural
caves** (40×22, steel border, brick segments, carved pockets, critter
chambers) — no handcrafted layouts, difficulty scales to cave 10: quota
10+2n, time 135−5n (min 80), boulder density up, gnats/beetles up. Classic
falling-rock physics at 8 ticks/s: single top-down scan with per-tick
`moved` flags, boulders/gems fall 1 cell/tick, roll off rounded surfaces
(boulder/gem/brick), **only falling objects kill**; resting boulders are
supported by the player beneath (dig-under escape works). Wall-follower
critters (gnats hug left, beetles hug right, move into EMPTY only);
touching the miner detonates them; crushing a beetle rains a 3×3 of gems.
Push boulders sideways at 55%/tick; Shift+dir (or the touch GRAB pad)
digs/collects without moving; R self-detonates to escape softlocks (costs
a life). Gems: 15 pts pre-quota, 30 after the hatch opens (border-wall
exit, opens at quota); clear bonus = 2×seconds left; bugs 50; extra life
per 2,000 (max 6); death regenerates the same cave number fresh. Score cap
250k. Balance knobs in `TUNE` at the top of the `<script>`. Achievement
slugs: `first-spark`, `daylight`, `bug-squasher`, `gem-hoard` (30 gems/one
cave — beetle farming), `swift-pick` (60+ s left), `deep-digger` (cave 5),
`rush-legend` (7,500; ≈500–900/cave deep). One `ARCADE_SCORE` at game over
with stats (cave, gems, bugs_squashed).

## Hyper Circuit (Track A, mode-7 racer, published session 18)

`src/games/hyper-circuit/` — F-Zero homage grand prix, fully original.
Three circuits (Alkali Flats, Terrace Canyon with a 145-radius hairpin,
Basalt Rim), 3 laps each, four rivals (Saltflat Comet, Basalt Bull, Dust
Moth, Cinder Fox), player craft the Copperhead. Shield is the one
resource: manual boost costs 18, rail hits drain 3-12 plus grinding,
rival bumps 3, the olive pit strip regenerates 28/s, zero = blowout DNF.
Boost pads on the road give free burns. Best lap per circuit is recorded
at 30 Hz and replayed as a translucent session ghost ("Ghost times" hook,
ARCADE_SAVE persistence deferred platform-wide).

- `courses.ts` — control-point loops through a centripetal Catmull-Rom
  (uniform parameterization cusps on uneven points), arc-length resampled
  at 4-unit steps, Menger curvature on a 96-unit chord (shorter chords
  measure spline ripple, not corner radius). Physics and the ground
  texture share this one table.
- `engine.ts` — frameless class, event queue, engine time only. Brake
  beats an active burn (a boost carried into a corner has an out). Rubber
  band clamps rivals to [0.94, 1.03] of base speed; 1.06 glued the pack
  to the player and bled shield through bumps.
- `track-texture.ts` — ground composed once per circuit at 1 texel/unit
  into a 1536² canvas: flat road/terrain fills (Munch Maze level-geometry
  exception) plus stamped transforms of generated sprites (rails, start
  checkers, pad chevrons, hedge scrub). Read back once into a Uint32Array.
- `render.ts` — the mode-7 pass: per-row depth precomputed, incremental
  world-space walk per pixel into a reused ImageData, nearest sample, fog
  blend toward the horizon, sprites projected far-to-near through a
  preallocated slot queue. No per-frame allocation. Logical 400×260,
  smoothing off.
- `audio.ts` — Starfall-shape blips plus a continuous engine hum (saw +
  sub sine through a lowpass) pitched by speed, stopped on pause/mute.
- `HyperCircuit.tsx` — Starfall shell idiom. Touch: drag steers, hold
  accelerates, DOM BOOST button on coarse pointers. Dev lever: in DEV
  builds the engine instance hangs on `window.__hc` so a console
  autopilot can drive playtests.

**Original art:** four generated, flat-color assets under
`public/assets/games/hyper-circuit/`: `ships.png` (five craft), `fx.png`
(four effects), `stamps.png` (rail/checker/pit-pad), and
`terrain-scrub.png`. The three magenta sheets take the gap-slice path at
5/4/3 frames. All four PNGs are palette-quantized and metadata-stripped:
18,302 bytes total, 1.75% of the 1 MiB cabinet budget. The browser playtest
loaded every asset with 200 responses, showed no magenta fringe, and drove
a real keyboard run to a rail-hit DNF before the row was published.

**Animation quality pass (session 19):** steering bank is damped instead
of snapping, rivals bank from their track heading with independent hover
and thruster phases, near-camera rival scale is capped, cruise/boost flames
share one anchored draw path, and the generated shield sprite now pulses
behind the player during boosts and low-shield warnings. The canvas uses
container-relative sizing and holds its exact 400:260 ratio at desktop and
390 px mobile widths; the old mobile layout stretched it vertically.
Browser stress proof sampled 120 moving frames at 6.95 ms average / 7.3 ms
p95 / 7.9 ms max with no frame over 25 ms, no console errors, and no boost
flame clipping after the corrected player anchor.

Balance knobs: `TUNE` at the top of `engine.ts` (all units commented),
`parLap`/`rivalSpeed`/`halfWidth` per course in `courses.ts`. Scoring:
positions [4000, 2600, 1800, 1200, 800] + 500 finish + shield·5 + par
bonus (200/s under par, cap 1200/lap) + 150 per clean boost + 50 per pad.
Cap 40,000, seeded in `db/seed-hyper-circuit.sql` and published with
`db/publish-hyper-circuit.sql`.

**Beatability harness (rerun it):** `node scripts/harness/hyper-circuit.mjs`
proves geometry validity (no self-overlap, curv·halfWidth < 0.5), an ace
bot finishing and winning, a cruiser bot proving clean-circuit, every
achievement reachable, cap never exceeded. Exit 0 = PASS. `--calibrate`
prints par suggestions from ace lap medians. Slugs seeded + fired:
`first-finish`, `front-runner`, `clean-circuit`, `ghost-chaser`,
`boost-artist` (5 clean boosts), `grand-circuit`, `circuit-legend` (18k).

**Dev playtest route (permanent lever):** `/dev/:slug` in DEV builds
(`src/pages/DevGame.tsx`) mounts any registry component with console-log
stubs, for cabinets whose DB row is still coming_soon.

## Run 'n Gunner (Track A, run-and-gun, published session 18)

`src/games/run-n-gunner/` — Contra homage, fully original. Three
chunk-built stages (Canyon Road, Scrap Ramparts, Dynamo Core), a
forward-only camera, and six parameterized bosses: Sentry Rig, Road
Breaker, Mortar Crab, Rampart Warden, Coil Hound, and the hovering Core
Custodian, which sits above head height and is fought with vertical fire.
Enemies: trickle-spawned runner bots, aimed turret pods (some on
platforms), mortar lobbers, and supply drones that drop weapon crates.
Weapons: RIFLE base plus FAN (3-way), RAKER (fast auto), SLUG (slow,
piercing, 3 dmg) — one fixed crate per stage, death drops you back to the
rifle. 3 HP per life, 3 lives, 1.5 s i-frames, checkpoint at each stage
start and after the mid-boss, pits kill outright. Drop-through platforms
via Down+jump.

- `stages.ts` — `TUNE` (every balance knob, unit-commented), `WEAPONS`,
  chunk library, stage compositions, `BossDef` table, `buildStage()`.
- `engine.ts` — frameless class, event queue, engine time only.
  **Fairness rules (found by the harness, kept for humans):** enemies aim
  at the standing center at the player's last grounded height so a jump
  is a real dodge; boss volleys keep 1.25 s of daylight; bosses never
  fire mid-charge; boss patrol floor `arenaX + 220` so holding distance
  never corners you on the camera wall.
- `sprites.ts` — the Starfall gap-slicer copy, now loading five original
  generated sheets: gunner.png (3 frames), foes.png (5), foes-motion.png
  (5 alternate poses), fx.png (5), and pickups.png (3). Deterministic
  gutters resolve exactly 3/5/5/5/3 at runtime.
- `render.ts` — camera-translated sprite placement; ground/platform/ridge
  flat fills are the Munch Maze level-geometry exception. Player, grounded
  foes, and non-hovering bosses share foot-anchored draw paths so changing
  frame proportions cannot move them through the floor.
- `RunNGunner.tsx` — Starfall shell idiom. Touch: run pads left, JUMP +
  FIRE right (`pointer: coarse`). Dev lever: `window.__rg` in DEV builds.

Scoring: runner 100 / lobber 150 / turret 200 / drone 150, mid-boss 2000,
end-boss 3000, no-hit boss +1000, stage clear +1000, victory +2000, and a
**one-life full clear doubles the final score** (the catalog's social
hook). Cap 100,000. Slugs seeded + fired: `open-road`, `arsenal`,
`wrecking-crew` (60 kills), `flawless-duel`, `long-march`,
`one-life-run`, `gunner-legend` (40k, realistically needs the one-life
double). Seed: `db/seed-run-n-gunner.sql`; publication update:
`db/publish-run-n-gunner.sql`.

**Beatability harness (rerun it):** `node scripts/harness/run-n-gunner.mjs`
proves a grunt bot clears all 3 stages within the lives budget, an ace
bot completes a full one-life clear, every achievement threshold fires in
simulation, and the score never exceeds the cap. Exit 0 = PASS. Prints a
per-stage table per bot.

**Original art proof:** the five palette-quantized in-game sheets total
12,955 bytes; the 768 px key-art tile is 320,084 bytes; all Run 'n Gunner
art totals 333,039 bytes (31.76% of the 1 MiB cabinet budget). Real keyboard
play on `/dev/run-n-gunner` covered running, firing, jumping, damage, and
enemy encounters with no keying fringe or palette clash before publish.
The animation pass pairs each of the five base foe frames with a generated
alternate pose: runner stride, turret recoil, lobber brace, drone rotor/fire,
and boss leg/cannon recoil. A 120-frame move-and-fire stress sample measured
6.88 ms average / 7.4 ms p95 / 7.7 ms max with zero frames over 25 ms. The
canvas holds its exact 16:9 ratio at desktop and 390 px mobile widths.

## Brickstorm (Track A, brick breaker, built session 21, NOT published)

`src/games/brickstorm/` — brick breaker over the session-20 art pack, the
first cabinet with a physics dependency (matter-js 0.20.0, pinned).

- `engine.ts` — frameless seeded class, `TUNE` on top, event queue. Matter
  runs ball contacts at fixed 120 Hz substeps (max 6 per update); paddle,
  bricks, walls are static bodies, ball velocity is renormalized to the
  target speed after every substep with a 0.22 minimum vy ratio. Paddle
  bounce angle comes from hit offset (62-degree clamp from vertical, 12%
  minimum deflection so dead-center returns cannot loop). The collision
  paddle body is rescaled whenever expand starts, expires, or serve resets.
  Powerups draw from a reshuffled 8-item bag: expand, split, slow, fire,
  shield (one floor save), sticky, extra life (max 5), x2 score.
- `levels.ts` — six materials indexed to the bricks.png columns with
  engine-owned hp (1/1/3/2/2/4); three 8x6 char-grid layouts, ~38 bricks
  each. Damage row shown = maxHp - hp.
- `sprites.ts` — exact-grid slicer from the art manifest (throws on a
  non-divisible sheet or blank cell), 4px inset, chroma key with magenta
  despill (subtract min(r,b)-g; the old soft-fringe rule left purple halos
  on the dark panel), per-family anchor normalization (paddle rows
  bottom-center, icon/pulse pairs together, fx cells individually).
- `render.ts` — board JPG, rounded ink panel (190..770 x 90..500), sprite
  placement only. Speed-streak ball frames are sized by height so the ball
  core never shrinks; the board-clear moment draws the badge + sparkle
  chrome from the props row.
- Scoring: destroy 20*maxHp + 10 per chain link, x2 while multi is active;
  clear 500, untouched board +300, victory 1500, cap 50,000. Slugs seeded +
  fired: `first-break`, `workshop-clear`, `triple-ball`, `untouched-board`,
  `brick-chain` (chain 4 — measured: a single ball breaks at most 3 per
  paddle trip, so it's a multiball reward), `kiln-master`, `storm-legend`
  (12k). Seed `db/seed-brickstorm.sql` (upsert over the teaser row),
  publish `db/publish-brickstorm.sql`; neither run against Supabase yet.

**Beatability harness (in `test:games`):** `node
scripts/harness/brickstorm.mjs` proves an ace full clear (15,020, no lives
lost, all 7 slugs), a grunt board-1 clear, an idle loss path, same-seed
determinism, expanded-paddle contact, corner speed keeping, double destroys
in one substep, multiball drain bookkeeping, 60 s max-speed containment,
serve/board-handover state, chain reset, and the cap under forced multi.

## The progression engine (Phase 3, unchanged)

Client never writes progression tables — SECURITY DEFINER functions +
triggers: `unlock_achievement` RPC (manifest-validated, published games
only), XP ledger (`xp_events`, score +10 capped 200/day, first play +25,
badge rarity 25/50/100/200, #1 takeover +50), **level =
min(50, floor(sqrt(xp/40))+1)** (mirrored in `src/lib/progression.ts` —
change both!), UTC streaks in the score trigger, 8 badges seeded (7 + new
`creator`), activity feed, follows.

## Stack

- Vite + React + TS + React Router (routes in `src/App.tsx`), Tailwind +
  customized shadcn/ui, TanStack Query, lucide-react
- Supabase: Postgres + RLS (client at `src/integrations/supabase/client.ts`),
  Storage bucket `games`
- Design system "down to earth" v3 — see `AI_RULES.md` hard rules.

## Database (Supabase)

All tables RLS + **explicit grants only** — session 10 revoked the blanket
Supabase default grants from every table AND changed default privileges so
new tables start with zero client grants (see Gotchas).
**Never write to `supabase/migrations/` — schema changes via the SQL tool.**

| Table | Client access | Purpose |
|---|---|---|
| `profiles` | SELECT all; UPDATE column-grant (username/display_name/avatar_url/bio) | first signup → admin |
| `games` | SELECT only (admin writes via RPC) | + `art_url` (Storage art for uploads; `gameArt()` helper falls back to `/assets/games/<slug>.png`) |
| `scores` | SELECT + INSERT (RLS: cap, rate limit) | wipes via RPC |
| `ratings` | SELECT + INSERT/UPDATE/DELETE own | |
| `favorites`, `comments`, `follows` | SELECT + INSERT/DELETE own | |
| `waitlist`, `playtest_applications` | INSERT (anon+auth); SELECT admin-only policy | admin Signups panel |
| `site_settings` | SELECT | + `spotlight_game_id` |
| `achievements`, `badges`, `user_badges`, `user_achievements`, `activity_events` | SELECT only | |
| `xp_events` | SELECT own | |
| `game_submissions` | SELECT own+admin; INSERT own (pending only, ≤3 in queue) | upload pipeline |

**Functions:** Phase 2/3 set (`get_leaderboard`, `increment_play_count`,
`handle_new_user`, `level_for_xp`, `grant_xp`/`award_badge` internal-only,
`unlock_achievement`, `get_game_achievements`, `get_user_top_scores`,
triggers) + `is_admin()` + the 7 `admin_*` RPCs above.

## Key files

```
src/
  hooks/useSiteSettings.ts       shared settings hook (gate + Home + admin)
  hooks/useSubmissions.ts        my submissions, submit mutation (Storage upload)
  hooks/useAdmin.ts              admin queries + RPC mutations (toasts inside)
  pages/Upload.tsx               3-step wizard
  pages/MyUploads.tsx            status/rejections/new-version
  pages/Admin.tsx                section chips + role guard
  components/upload/             ManifestEditor (kebab/validation), TestFlight
  components/admin/              ReviewQueue (manifest diff), GamesPanel,
                                 UsersPanel, SignupsPanel, SitePanel
  hooks/useGames.ts              Game type + gameArt() art resolver
```

## Asset pipeline

Unchanged (AI_RULES + DEVLOG session 6). Uploaded games: key art lives in
Storage (`games` bucket) via `games.art_url`; in-repo games keep
`public/assets/games/<slug>.png`. Track-B cap 5 MB, sprites inlined as data
URIs (sandbox can't read external images back).

## Next up

1. **Playtest the six new cabinets** (all desk-checked only). Munch Maze:
   speed/fright constants top of its `engine.ts`; watch sprite-sheet
   slicing. Rune & Ruin: Tuning block in its `engine.ts` + `content.ts`;
   verify the glyph grid fits small screens. Trailbound: PACES/RATIONS/
   event weights in its `<script>`; verify panorama pan + wagon keying,
   fort/river/hunt flows, score on arrival AND on party wipe. Starfall:
   verify both sheets sliced into 4 + 5 frames (fallback = equal columns
   shows clipped sprites), beam capture + rescue flow, touch drag.
   Rockbuster: verify both inlined sheets slice into 5 + 3 frames (a
   fallback slice shows clipped sprites), saucer aim/warble, hyperspace,
   touch pads; `TUNE` knobs at the top of its `<script>`. Boulder Rush:
   verify sheets slice into 5 + 6 frames, falling/rolling feel (tick
   0.125s), push chance, cave solvability across regenerations, quota/time
   curve, touch D-pad + GRAB; `TUNE` knobs at the top of its `<script>`.
2. **The user's game queue: the flagship trio.** Sprite games follow Munch Maze/Starfall;
   text-shelf follows Rune & Ruin; self-contained Track-B follows
   Rockbuster **on the asset diet** (flat sprites, small sheets inlined
   as data URIs — no fat panoramas). Track-B briefs can also be
   dispatched through the real wizard anytime.
3. **Phase 5 — Chat** (deferred behind games by user decision, session 11).
4. **Phase 7 — flip `launched`** (button exists in `/admin` → Site).
5. (Whenever convenient) run one Track-B submission through the upload
   pipeline end-to-end — it's still untested with real traffic.

**Deferred:** avatar upload, `ARCADE_SAVE/LOAD` persistence, friend filter +
board virtualization, mod comment deletion, streak freeze, seasonal badges /
weekly Spotlight prize + anomaly flags (spec §4.10), Warm Seat / Dynasty /
Founding Player badges, in-browser thumbnail cropping.

## Gotchas

- **Grants are now explicit everywhere (session 10).** Supabase's default
  `GRANT ALL` to anon/authenticated was revoked on every table and via
  `ALTER DEFAULT PRIVILEGES` for future tables. **After CREATE TABLE you
  MUST add grants yourself** or every request 42501s — that's by design.
  RLS remains the row boundary; grants are the verb boundary.
- `admin_review_submission` **prunes achievements** missing from the new
  manifest — cascades `user_achievements` deletes. The review UI warns, but
  don't "optimize" the prune away: manifest = approved set is the contract.
- Uploaded games get **full Storage public URLs** in `games.html_path` /
  `art_url`; dev-hosted cabinets (Flap Hero) keep relative paths. Use
  `gameArt(game)` for art everywhere — never `gameArtPath` directly for DB
  games.
- The profiles column-grant rule stands: after ANY `ALTER TABLE profiles`,
  re-verify `information_schema.column_privileges`. `updated_at` is
  trigger-set; clients must not write it.
- Level curve in TWO places (`level_for_xp` + `src/lib/progression.ts`).
- Chart-topper fires only when #1 changes hands; ScoreTicker needs ≥5 rows
  to animate; streaks are UTC days; sandbox stays `allow-scripts`-only
  (test flight uses `srcDoc` = same opaque-origin guarantee).
- `authCta()` for every logged-out CTA — never hardcode `/login` or
  "Sign in" copy. `na-known-player` flag is device-level, never cleared.
- Slug inputs sanitize to `[a-z0-9-]` on keystroke but must NOT run
  `kebab()` per keystroke (it strips trailing hyphens — you couldn't type
  one). `kebab()` is only for deriving slugs from names/titles.
- Google provider still disabled in the dashboard (email/password works;
  the login button probes and fails friendly).
- **Track-A game rules distilled from Munch Maze:** engine fires achievement
  slugs that must exactly match seeded `achievements` rows (Track A skips
  the upload pipeline — seed via SQL and publish the games row manually).
  Sprites still AI-generated on magenta, keyed at runtime; sheet slicing is
  gap-based with equal-column fallback. Transforms (rotate/mirror/fade/
  scale) of generated sprites are fine; *drawing* shapes is not. Eaten
  ghosts respawn via fade instead of "eyes" for exactly that reason.
- **Text-shelf games render with typography** (session 12 precedent:
  Rune & Ruin). A DOM glyph grid in JetBrains Mono is fonts, not drawn
  art — the no-programmatic-art rule targets canvas/SVG shape-drawing.
  ASCIIBURG and The Undervault should follow this pattern. Each game still
  needs generated *key art* at `public/assets/games/<slug>.png`.
- Turn-based Track-A cabinets don't need an in-game restart: fire
  `onScore` on death and let GamePlayer's RUN OVER panel remount the
  component (its `key={frameKey}` gives a fresh engine).
- **`games.era` is CHECK-constrained** — allowed values: Arcade, Atari,
  NES, SNES, Genesis, Amiga, DOS, PS1, Mobile, Original (no "Amiga/DOS").
- **Teaser rows already exist** (`status='coming_soon'`) for launch-lineup
  games, with lineup entries in `src/data/launch-lineup.ts` and key-art
  slots in `public/assets/games/`. When shipping a catalog game: UPDATE
  the games row (INSERT hits the slug unique key), check the lineup file
  before adding, and overwriting the teaser art is expected.
- Munch Maze scoring: ~15k max/maze early (158 seeds ·10 + 4 acorns ·50 +
  full combos 12k + berries). `seed-baron` 10k / `maze-legend` 30k tuned to
  that — retune both if the economy changes. Score cap 500k.
