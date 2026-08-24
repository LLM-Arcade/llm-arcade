# Game development handoff

## Objective

Build the five catalog games that already have finished, wire-ready local art:

1. Brickstorm
2. Gem Columns
3. Sky Defense
4. Kickflip City
5. The Undervault

Build one complete cabinet at a time. Each game gets its own feature branch,
deterministic harness, local browser proof, pull request, deployment proof, and
publication step. Do not start the next game until the current game clears its
local gate.

Do not change Hyper Circuit, Run 'n Gunner, Trailbound, Flap Hero, Starfall
Squadron, Munch Maze, Rockbuster, Boulder Rush, Rune & Ruin, or TypeStorm.

## Repository truth

- Repository: `<LOCAL_PATH>`
- Integration branch: `dev`
- Production branch: `prod`
- Frozen legacy branch: `main`
- Art-lab branch: `feature/catalog-art-local`
- Art-lab base: `dev` at `4b130aa`
- Local server: `http://127.0.0.1:8080`
- Supabase project: `afcqhievsmnepxopetkt`

The five asset packs exist only as uncommitted files in the art-lab worktree.
Do not add gameplay to that dirty branch. Do not commit all eight games as one
change. Preserve the art worktree until Jeff approves or rejects each cabinet.

The completed local art gate is recorded in `ART-PRODUCTION-HANDOFF.md`. Every
target pack is below the 1 MiB budget:

| Game | Total art bytes | Manifest |
|---|---:|---|
| Brickstorm | 668,816 | `public/assets/games/brickstorm/art-manifest.json` |
| Gem Columns | 496,808 | `public/assets/games/gem-columns/art-manifest.json` |
| Sky Defense | 473,989 | `public/assets/games/sky-defense/art-manifest.json` |
| Kickflip City | 240,728 | `public/assets/games/kickflip-city/art-manifest.json` |
| The Undervault | 441,348 | `public/assets/games/the-undervault/art-manifest.json` |

Treat each manifest as the source of truth for grid dimensions, frame order,
anchors, render sizes, animation timing, and intended wiring. Do not regenerate,
redraw, crop, resize, rename, or recompress the finished art during gameplay
development.

## First branch procedure

Use a sibling worktree so the dirty art lab remains intact. Start Brickstorm
from `origin/dev`, then copy only Brickstorm's finished art into it.

```powershell
cd <LOCAL_PATH>
git fetch origin
git worktree add ..\jolly-bear-cheer-brickstorm -b feature/brickstorm-game origin/dev

$source = '<LOCAL_PATH>'
$target = '<LOCAL_PATH>'
New-Item -ItemType Directory -Force "$target\public\assets\games\brickstorm"
Copy-Item -Path "$source\public\assets\games\brickstorm\*" -Destination "$target\public\assets\games\brickstorm" -Recurse
Copy-Item -LiteralPath "$source\public\assets\games\brickstorm.png" -Destination "$target\public\assets\games\brickstorm.png"
```

Copy the shared art-budget and grid-probe tools into the Brickstorm branch if
they are not yet on `dev`:

- `scripts/art-budget.mjs`
- `scripts/probe-sprite-grid.py`
- the `art:budget` entry from `package.json`

Before editing code, confirm that `git status --short` in the new worktree lists
only Brickstorm art and the approved shared tooling. If it lists another cabinet,
stop and remove that file from the branch without changing the art-lab copy.

For later games, create `feature/<slug>-game` from the latest green
`origin/dev`. Copy only that game's asset directory and square key art from the
art lab. Never copy the three repaired playable cabinets into these branches.

## Architecture decision

Build all five games as Track A cabinets. Loose assets already live under
`public/assets/games/<slug>/`, and Track A keeps engine logic typed and directly
testable.

Each cabinet uses this structure:

```text
src/games/<slug>/
  <GameName>.tsx
  engine.ts
  render.ts
  sprites.ts
  audio.ts
  content.ts or levels.ts when needed
scripts/harness/<slug>.mjs
db/seed-<slug>.sql
db/publish-<slug>.sql
```

Register the React shell lazily in `src/games/registry.ts`. Follow the
`ArcadeGameProps` contract. The engine queues achievements and game-over events.
The React shell drains the queue and calls `onAchievement` or `onScore`.

Use an exact grid slicer driven by the manifest. Reject a sheet whose width or
height is not divisible by its declared grid. Apply the declared inset before
trimming. Normalize animation families to one anchor and canvas. Do not use
sprite dimensions for collision bounds.

The renderer places generated images and transforms them. It may draw static
playfield geometry, collision guides, HUD text, bars, and flat backgrounds.
It may not draw actors, enemies, vehicles, props, pickups, or effects with
canvas paths, canvas shapes, CSS art, or SVG.

Use a fixed logical canvas with a stable responsive aspect ratio. Disable image
smoothing for low-resolution sheets when that produces the intended result.
Keep every movement, collision, damage, score, spawn, and balance value in the
engine or a named tuning object. Animation state must never change gameplay
bounds.

Brickstorm and Kickflip City need a proven 2D physics library because contact
quality defines the game. Use Matter.js unless the branch already contains an
equivalent maintained library. Add one dependency in the first branch that
needs it, record its license, use a fixed step with bounded substeps, and write
logic tests around high-speed contact and restart behavior.

Gem Columns, Sky Defense, and The Undervault use deterministic framework-free
rules. Their harnesses must accept a seed or fixed scripted state.

## Shared cabinet contract

Every game must support:

- Keyboard controls and coarse-pointer touch controls.
- Pause with `P`, mute with `M`, and auto-pause when the tab becomes hidden.
- A fresh engine after GamePlayer remounts the cabinet.
- One score submission per completed run.
- A non-negative integer score below the seeded `score_cap`.
- Achievement slugs that exactly match `db/seed-<slug>.sql`.
- No missing assets, magenta fringe, clipped frames, anchor jumps, or animation
  resizing.
- A start state, full play loop, loss state, clear or victory state, and replay.
- A deterministic harness that proves both a plausible clear and a loss path.
- Real browser play at `/dev/<slug>` on desktop and mobile-sized viewports.

Do not publish a cabinet because its harness passes. A human must play it and
approve its feel, art use, difficulty, and responsive fit.

## Build 1: Brickstorm

### Core loop

Build an original brick-breaking game across three boards: pottery workshop,
olive greenhouse, and terracotta kiln. The player moves one generated paddle,
keeps the ball in play, breaks a field of material-specific bricks, catches
powerups, and clears all three boards in one run.

Use the generated brick damage rows as visual health states. Keep brick health
in engine data. Use at least five shipped powerups, including expand, split,
slow, sticky, and shield. A missed ball costs one life. A cleared board changes
the environment and brick layout without resetting the score.

Controls:

- `A`/`D` or Left/Right move the paddle.
- Pointer movement positions the paddle within the board.
- Space launches a held ball.
- Coarse pointers get left, right, and launch controls.

Physics proof must cover paddle edge angles, wall corners, simultaneous brick
contacts, multiball cleanup, a high-speed ball, life loss, and board reset.

### Art wiring

- `paddles.png`: 5 columns by 3 rows.
- `ball-fx.png`: 8 columns by 3 rows.
- `bricks.png`: 6 columns by 4 rows.
- `powerups-props-ui.png`: 8 columns by 3 rows.
- Three `board-*.jpg` environments.

Use every board environment, all six brick materials, all four damage rows,
one full paddle animation family, ball rotation, impact effects, and five
powerup icons in reachable play.

Suggested achievement slugs: `first-break`, `workshop-clear`, `triple-ball`,
`untouched-board`, `kiln-master`, `brick-chain`, `storm-legend`.

## Build 2: Gem Columns

### Core loop

Build a six-column falling-triad puzzle. A piece contains three gems in a
vertical stack. The player moves it, soft-drops it, and cycles the gem order.
Three or more matching identities clear horizontally, vertically, or
diagonally. Gravity resolves cascades before the next piece spawns.

Use six gem families per level from the ten shipped identities. Change the gem
set and environment across the foundry, conservatory, and archive. Increase
fall speed only after measured clears. End the run when the spawn area remains
blocked after cascade resolution.

Controls:

- `A`/`D` or Left/Right move.
- `S` or Down soft-drops.
- Space, `W`, or Up cycles the triad.
- Coarse pointers get left, right, drop, and cycle controls.

The harness must prove diagonal matches, overlapping matches, multi-step
cascades, spawn blocking, deterministic piece order, and score-cap safety.

### Art wiring

- `gems-set-a.png` and `gems-set-b.png`: 5 columns by 5 rows each.
- `specials.png`, `effects.png`, and `ui-states.png`: 4 columns by 3 rows.
- `well-surrounds.png` and `environment-strip.png`: 3 columns by 1 row.

Use normal, pulse, matched, cracked, and clear states. Use all three
environments. Do not recolor one gem to represent another identity.

Suggested achievement slugs: `first-match`, `cascade`, `foundry-clear`,
`conservatory-clear`, `archive-clear`, `danger-dancer`, `gem-legend`.

## Build 3: Sky Defense

### Core loop

Build an original interception game across the desert relay, river city, and
mountain observatory. The player aims an eight-direction defense battery and
fires interceptors toward a selected detonation point. Expanding bursts destroy
fictional incoming threats. Threats that reach the ground damage the region.

Each region moves through intact, damaged, and destroyed art states from engine
health. A run clears after three escalating regions. It ends when the protected
region loses all health or the player exhausts all lives or repair capacity.

Use only the fictional threat vocabulary in the manifest. Do not rename or
redraw threats as missiles, rockets, bombs, aircraft, or real military weapons.

Controls:

- Pointer or touch selects the intercept point and fires.
- Left/Right or `A`/`D` changes the authored aim direction.
- Space fires toward the current reticle.

The harness must prove interception timing, chain bursts, ground damage, region
state changes, ammunition or cooldown recovery, victory, defeat, and score-cap
safety.

### Art wiring

- Three region state sheets with manifest-specific grid directions.
- `battery-aim.png`: 8 columns by 1 row.
- `battery-actions.png`: 4 columns by 1 row.
- `threats.png`, `effects.png`, and `props-ui.png`: 4 columns by 4 rows.

Use all eight threat families across the campaign. Use all three region state
sets and the battery's idle, fire, reload, and hit states.

Suggested achievement slugs: `first-intercept`, `relay-held`,
`river-guardian`, `observatory-held`, `shield-wall`, `perfect-sky`,
`defense-legend`.

## Build 4: Kickflip City

### Core loop

Build a side-scrolling skate run through civic steps, market underpass, and
warehouse roofs. The player pushes, coasts, crouches, jumps, performs tricks,
grinds, lands, and can bail. The score comes from completed trick lines, not
button presses. A fall breaks the line multiplier and costs time or health.

Use stable board contact and a proven physics engine. Separate contact state
from animation. A trick scores only after a valid landing. Grinding requires
board contact with a marked rail or ledge. Decorative street life stays outside
collision lanes.

Controls:

- Left/Right or `A`/`D` steer and adjust speed.
- Space jumps.
- `J`, `K`, and `L` select trick families while airborne.
- Down crouches or stabilizes a landing.
- Coarse pointers get steer, jump, trick, and crouch controls.

The harness must prove grounded contact, jump apex, trick completion, failed
landing, grind entry and exit, checkpoint restart, district transition, and
score-cap safety.

### Art wiring

- `skaters.gif`: 3 columns by 8 rows.
- `street-life.gif`, `props-obstacles.gif`, and `pickups-fx-ui.gif`: 8 columns
  by 3 rows.
- `parallax-weather.gif`: 6 columns by 2 rows.
- Three `district-*.jpg` environments.

Use one complete skater family in play and expose the other two as selectable
cosmetics or later unlocks. Use all three districts. Use the supplied street
life, props, effects, and parallax art without turning decorative actors into
unexpected collision hazards.

Suggested achievement slugs: `first-ollie`, `line-starter`, `rail-worker`,
`market-run`, `roofline`, `clean-landing`, `city-legend`.

## Build 5: The Undervault

### Core loop

Build a turn-based dungeon expedition through five depth regions: gatehouse,
ossuary, fungal cistern, buried court, and deep mechanism. The player chooses a
portrait, explores a generated grid, fights monsters, equips relics, manages
status effects, and defeats one distinct boss per region.

Use a deterministic seed and a finite action economy. One player action allows
each active enemy one response. Combat, movement, loot, traps, doors, and floor
descent resolve in the engine before the React shell renders the next state.
The run ends on player death or after the deep mechanism boss falls.

Follow Rune & Ruin's turn-based event queue and input throttle. The Undervault
may use a DOM tile grid or a sprite canvas, but generated monster, boss, item,
portrait, and event art must remain visible. Typography may represent floor
geometry. Do not replace the shipped actors with glyphs.

Controls:

- Arrows, WASD, or vi keys move or attack.
- Number keys or an inventory panel use equipped actions.
- Coarse pointers get a directional pad and explicit inventory controls.

The harness must prove deterministic generation, reachable stairs, turn order,
combat, status expiry, inventory limits, every boss encounter, victory, death,
achievement emission, and score-cap safety.

### Art wiring

- `monsters.gif`: 12 columns by 4 rows.
- `bosses.gif`: 5 columns by 3 rows.
- `portraits.gif`: 8 columns by 2 rows.
- `icons.gif`: 8 columns by 4 rows.
- `events.gif`: 3 columns by 2 rows.
- `ui-panels.gif`: 5 columns by 2 rows.
- Five `depth-*.jpg` environments.

Use all 12 monster families and all five bosses across a complete run. Use the
portrait, equipment, relic, status, door, trap, event, and depth-region art in
reachable flows.

Suggested achievement slugs: `first-descent`, `monster-breaker`,
`relic-bearer`, `ossuary`, `deep-mechanism`, `boss-breaker`, `vault-legend`.

## Per-game implementation gate

Complete these steps before asking Jeff to approve a cabinet:

1. Read `AI_RULES.md`, `PATTERNS.md`, `CLAUDE.md`, this handoff, and the game's
   art manifest.
2. Confirm the branch contains only one game's assets and source changes.
3. Write the engine and deterministic harness before tuning visual polish.
4. Wire every required sprite family through an exact manifest-driven slicer.
5. Add the cabinet to `src/games/registry.ts`.
6. Add its harness to `pnpm test:games` and `pnpm run ci`.
7. Create idempotent seed SQL with `status='coming_soon'` and a separate publish
   SQL file that only changes the matching row to `published`.
8. Run the sprite probes and `pnpm art:budget`.
9. Run the cabinet harness and `pnpm run ci`.
10. Play the complete loop at `/dev/<slug>` with real controls.
11. Check desktop and mobile layouts, pause, mute, tab hiding, restart, score,
    achievements, network loads, and browser console output.
12. Capture screenshots of the start, active play, a major transition, and the
    loss or victory state.

Reject the cabinet if any sprite clips, changes size while animating, crosses
another frame, floats above its contact point, exposes magenta, or reads as a
decorative poster pasted over unrelated gameplay.

## Git and release gate

Keep all remote actions behind Jeff's local approval.

1. Commit one cabinet on `feature/<slug>-game`.
2. Run `pnpm run ci` again from the clean commit.
3. Show Jeff the local cabinet and screenshots.
4. After approval, push the feature branch and open a PR into `dev`.
5. Wait for the protected `check` job before merging.
6. Confirm the Vercel preview loads the cabinet.
7. Promote `dev` to `prod` through a separate release PR.
8. Wait for the production deployment and verify the deployed commit.
9. Run the matching seed SQL if needed, then run its publish SQL against
   Supabase project `afcqhievsmnepxopetkt`.
10. Play `https://llmarcade.fun/game/<slug>` as a signed-out guest and capture
    the final screenshot.

Do not combine two games in one PR. Do not push directly to `dev`, `prod`, or
`main`. Do not publish a database row before the production asset and game URLs
return successfully.

## Pickup prompt

```text
Work in <LOCAL_PATH>. Read
GAME-DEVELOPMENT-HANDOFF.md, ART-PRODUCTION-HANDOFF.md, AI_RULES.md,
PATTERNS.md, CLAUDE.md, HANDOFF.md, and the target game's art manifest.

Begin with Brickstorm only. The current feature/catalog-art-local worktree is
dirty because it holds eight finished art deliveries. Do not develop or commit
on that branch. Create a sibling worktree and feature/brickstorm-game from
origin/dev exactly as GAME-DEVELOPMENT-HANDOFF.md describes. Copy only the
Brickstorm asset directory, Brickstorm key art, and missing shared art-probe
tooling into the new worktree.

Build Brickstorm as a Track A cabinet with a typed framework-free engine,
Matter.js fixed-step physics, manifest-driven exact sprite slicing, three
complete boards, deterministic beatability and failure harnesses, keyboard and
touch controls, pause, mute, achievements, score submission, seed SQL, and
publish SQL. Do not modify another game. Do not regenerate or alter finished
art. Run pnpm run ci, pnpm art:budget, the sprite probes, and actual browser
play at http://127.0.0.1:8080/dev/brickstorm. Inspect desktop and mobile views,
network requests, console errors, collisions, anchors, animation, loss,
restart, and full three-board victory.

Stop before commit, push, PR, merge, deployment, or Supabase writes. Report the
changed files, harness evidence, exact art bytes, screenshots, remaining risks,
and the single next approval gate.
```
