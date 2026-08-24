# Catalog art production handoff

## Mission

This production run covers exactly eight of the 14 launch-visible games without
changing gameplay, tuning, collision, scoring, AI, or balance. Every updated
playable cabinet must load its generated in-game assets. Every character and
enemy family needs an intentional silhouette and at least one stable animation
loop. Every updated game that travels through a world needs multiple
environments or meaningful environmental variation.

Update and wire art only in Hyper Circuit,
Run 'n Gunner, and Trailbound; generate complete wire-ready asset packs for the
uncreated Brickstorm, Sky Defense, Gem Columns, Kickflip City, and The
Undervault. Do not alter the other existing cabinets (Flap Hero, Starfall
Squadron, Munch Maze, Rockbuster, Boulder Rush, Rune & Ruin, or TypeStorm).
The five uncreated games receive art manifests and integration contracts now,
but no gameplay implementation in this art lane.

This is not a request for 14 posters. Five catalog entries are currently only
key-art teasers and must receive game logic before their gameplay art can be
wired. Keep the art and logic lanes separate so visual work cannot quietly
change game feel.

## Current gate

- Working base: `dev` at `4b130aa`.
- Local art-lab branch: `feature/catalog-art-local`.
- Release PR #4 (`dev` to `prod`) stays open and unmerged. Its art was rejected.
- Do not push the local art-lab branch. Jeff reviews all cabinets on port 8080
  before any GitHub PR is opened.
- Vercel CLI is authenticated as `maydayjeffk`; GitHub CLI is authenticated as
  `Jeff-Kazzee`. Authentication is not a release approval.
- Production is not the proof surface. The first proof surface is the local
  `/dev/<slug>` or `/games/<slug>.html` route.

## Catalog truth

The launch-visible catalog is 14 games: 13 entries in
`src/data/launch-lineup.ts` plus the seeded Run 'n Gunner cabinet.

| Game | Slug | Current state | Delivery |
|---|---|---|---|
| Starfall Squadron | `starfall-squadron` | Playable, thin art | Track A |
| Munch Maze | `munch-maze` | Playable, heavy art | Track A |
| Rune & Ruin | `rune-ruin` | Playable, glyph-only | Track A |
| Brickstorm | `brickstorm` | Poster only | Track A selected in game handoff |
| Rockbuster | `rockbuster` | Playable, embedded sheets | Track B |
| Boulder Rush | `boulder-rush` | Playable, embedded sheets | Track B |
| Hyper Circuit | `hyper-circuit` | Playable, rejected spacecraft art | Track A |
| The Undervault | `the-undervault` | Poster only | Track A flagship |
| Flap Hero | `flap-hero` | Playable, one environment | Track B |
| Sky Defense | `sky-defense` | Poster only | Track A selected in game handoff |
| Gem Columns | `gem-columns` | Poster only | Track A selected in game handoff |
| Kickflip City | `kickflip-city` | Poster only | Track A selected in game handoff |
| Trailbound | `trailbound` | Playable, one environment | Track B |
| Run 'n Gunner | `run-n-gunner` | Playable, repeated boss/background art | Track A |

`public/games/typestorm.html` is a runnable unlisted artifact, not one of the
14 launch-visible games. Give it a separate audit after the launch catalog is
green; do not let it silently become scope number 15.

## Non-negotiable art contract

1. Generate original raster art with the built-in image generator. Do not draw
   actors, enemies, vehicles, props, or effects as canvas primitives or SVG.
2. Gameplay sheets use flat solid colors, no gradients, no paper grain, no
   texture noise, and a pure `#FF00FF` key background. Key art may use restrained
   paper grain.
3. Use the site palette: paper/cream, ink/charcoal, terracotta, olive, mustard,
   plus small game-specific accents. No purple, blue-dominant, neon, glossy 3D,
   stock, or clipart look.
4. Put generous magenta gutters between frames. Nothing touches a sheet edge.
   Detached weapons, exhaust, shadows, or particles may not create accidental
   slice columns.
5. Animation pairs share a normalized canvas, bottom-center anchor, scale, and
   visual mass. Frame changes may not alter collision or actor position.
6. Grounded actors are foot-anchored; wheeled vehicles are tire-contact anchored;
   flying actors are center anchored. Record the anchor in the game manifest.
7. Target less than 1 MiB total art per game, including key art. Working target:
   key art at or below 350 KiB and gameplay art at or below 650 KiB. Track B HTML
   remains below 5 MiB after embedding.
8. Reuse generated frames through transforms only when the result still reads as
   a deliberate animation. Palette swaps do not count as enemy variety.
9. Every generated asset must be loaded and visible in a real play path. Unused
   files are not progress.
10. Do not change gameplay or balance code during an art PR.

## Movement and direction contract

Animation must describe how an actor moves through its actual game, not merely
blink, recolor, or rotate one still image.

- Rear-view racers need authored yaw poses. Hyper Circuit uses hard-left, left,
  straight, right, and hard-right rear-quarter views for every car, plus one
  matched motion pose per direction. Rotating one straight sprite is rejected.
- Side-view actors need authored locomotion, airborne, attack, hit, and grounded
  poses. Horizontal mirroring is allowed for left/right facing when the costume
  and weapon are intentionally mirror-safe.
- Top-down actors need direction frames appropriate to their movement grid. Use
  four directions at minimum; use diagonals when the actual engine moves freely
  rather than on four-way tiles.
- Flying actors need bank or pitch frames matching the game's degrees of
  freedom. A pulsing exhaust on one still hull is not flight animation.
- Vehicles, feet, wheels, hooves, boards, and shadows keep one stable contact
  anchor across the entire direction/animation matrix.
- Renderers choose the nearest authored direction frame from presentation state.
  Directional art must never feed back into physics or collision.

## Required asset set by game

### Hyper Circuit

Files live under `public/assets/games/hyper-circuit/`; integration is confined
to `src/games/hyper-circuit/`.

- Five steering sheets, one per car. Each sheet is a five-column by two-row
  matrix: hard-left, left, straight, right, hard-right; base row plus aligned
  suspension/wheel/taillight motion row. All 50 frames visibly show wheels,
  tires, windows, bumpers, and taillights.
- `alkali-flats.png`: salt-flat street circuit, mesas, olive scrub.
- `terrace-canyon.png`: terracotta canyon road, terraces, guardrails.
- `basalt-rim.png`: volcanic ridge road, olive scrub, mustard dusk.
- `fx-road.png`: boost-only exhaust, tire sparks, shield arc, speed streak.
- `stamps-road.png`: asphalt markings, guardrail/checker/boost-lane details.
- Key art: recognizable cars on a street, never spacecraft.

Visual-only renderer requirements: remove hover bob and continuous cruise flame;
select the nearest authored steering angle for player and rivals, animate the
paired suspension frame, select scenery by course, and keep engine/course data
untouched. Prove both left and right poses on real curved track sections. Proof
command: `node scripts/harness/hyper-circuit.mjs`.

### Run 'n Gunner

Files live under `public/assets/games/run-n-gunner/`; integration is confined to
`src/games/run-n-gunner/`.

- Player sheet: idle, run loop, jump, fire, crouch, hit/death, all foot-aligned.
- Four enemy families with at least three poses each and different silhouettes.
- Six paired boss identities: Sentry Rig, Road Breaker, Mortar Crab, Rampart
  Warden, Coil Hound, Core Custodian. No shared body or palette-swap substitute.
- `background-canyon.png`: canyon road, mesas, poles and barriers.
- `background-ramparts.png`: scrap fortifications, gantries and cranes.
- `background-core.png`: reactor chamber, conduits, turbines and machinery.
- Stage-prop sheet plus coherent projectiles, impacts, and pickups.
- Key art: player facing visibly different boss machinery.

Visual-only renderer requirements: select panorama by `stageIndex`, normalize all
pairs, use explicit boss dimensions, keep floor anchors stable, retain all stage
chunks and collisions. Proof command: `node scripts/harness/run-n-gunner.mjs`.

### Trailbound

Track B remains self-contained in `public/games/trailbound.html` when practical.

- Four mileage-selected panoramas: Split Creek prairie, broad riverlands, high
  mountain pass, Golden Valley approach.
- Four-frame wagon/ox movement loop with aligned wheels, hooves, and ground.
- Event scenes: fort, river crossing, hunt, severe storm, arrival. Add camp,
  illness, and broken axle if the diet allows.
- Smooth interpolation between existing travel ticks and a non-jarring region
  crossfade. Mileage/time/event math stays untouched.

Fable did not destroy this game: the prior Fable changes only optimized the
existing panorama/wagon and stopped travel while the tab was hidden. The visual
expansion was never completed. Preserve every existing choice and outcome.

The existing cabinets Flap Hero, Starfall Squadron, Munch Maze, Rockbuster,
Boulder Rush, Rune & Ruin, and TypeStorm are outside this production run. They
have no asset brief below and must remain untouched.

### Brickstorm (wire-ready art pack only)

- Paddle: idle, move/compress, hit, expanded, damaged frames.
- Ball: four rotation/highlight frames; impacts and trails in an FX sheet.
- At least six brick materials and damaged states, plus power-up icons.
- Three board environments: pottery workshop, olive greenhouse, terracotta kiln.
  Background changes between boards; playfield contrast stays high.
- Include alternate paddle bodies, extra brick damage, board props, UI icons, and
  FX that a later gameplay owner may choose not to use.

### Sky Defense (wire-ready art pack only)

- Three city horizons with intact, damaged, and destroyed states.
- At least eight incoming threat shapes and two-frame motion, no real missiles or
  military insignia copied from references.
- Launcher/defense battery with eight authored aim directions plus idle, fire,
  reload, and hit frames.
- Intercept burst, debris, warning, shield, and city-repair FX.
- Regions: desert relay, river city, mountain observatory.
- Include extra threat, building, weather, radar, cursor, and defense variants.

### Gem Columns (wire-ready art pack only)

- Ten generated gem identities with normal, pulse, matched, cracked, and clear
  frames. Shape and internal mark must carry identity without relying on color.
- Three well surrounds: artisan foundry, conservatory, archaeological archive.
- Cascade, landing, clear, danger, and level-transition FX.
- Include wild, bomb, lock, garbage, triad, ghost, landing-marker, and UI variants.
- No copied Columns board, UI, gem shapes, or sound language.

### Kickflip City (wire-ready art pack only)

- At least three skaters with board-contact-aligned push, coast, crouch, ollie,
  kickflip, heelflip, grab, grind, land, bail, celebrate, and hit frames.
- At least six pedestrian/rival/background-character loops that stay outside
  collision lanes.
- Three traversable districts: terracotta civic steps, olive market underpass,
  mustard warehouse roofs. Each needs foreground props and parallax layers.
- Generated rails, ramps, benches, curbs and signs; no real brands or city marks.
- Include trick trails, landing sparks, score icons, weather, time-of-day, outfit,
  board, wheel, and prop variants beyond the minimum likely runtime set.

### The Undervault (wire-ready art pack only)

- Five depth-region surrounds: gatehouse, ossuary, fungal cistern, buried court,
  deep mechanism. Do not bury the terminal/grid beneath full-screen art.
- At least 12 monster portraits grouped into visibly different families, two
  motion/hit/attack frames for recurring threats, plus five unique bosses.
- Equipment, relic, status, door, trap, and landmark icon sheets.
- Party and NPC portraits plus major scenes for camp, merchant, boss, floor
  descent, death, and completion. Include extra variants for later encounters.

## Image-generation prompt shell

Use one image-generation call per distinct final asset or variant. Replace the
bracketed material with the game-specific specification above.

```text
Production game asset for LLM Arcade: [asset and frame list]. Original design,
warm cream, ink, terracotta, olive and mustard palette, [game-specific mood and
era]. Flat solid-color 2D raster illustration, crisp connected silhouettes,
readable at [render size]. [exact frame count] isolated frames in one horizontal
sheet on pure #FF00FF, generous magenta gutters, identical frame canvases and
[foot/tire/center] anchor, no object touching an edge. No text, logo, trademark,
photorealism, glossy 3D, clipart, gradient, glow, paper grain, texture noise,
blue-dominant color, purple, detached fragments, cropped limbs, or cast shadow
crossing a frame gutter.
```

For opaque panoramas, remove the magenta-sheet language and specify exact aspect
ratio, seam behavior, near/mid/far layers, a clear travel direction, and no actor
silhouettes baked into the background.

## Per-game manifest

Each cabinet creates `public/assets/games/<slug>/art-manifest.json` (Track A) or
an equivalent comment block next to the Track B embedded asset constants. It
records:

```json
{
  "slug": "example",
  "generatedAssets": [
    {
      "file": "actors.png",
      "frames": 8,
      "renderSize": [48, 64],
      "anchor": "bottom-center",
      "animation": "idle/run/hit",
      "promptSummary": "short production prompt summary"
    }
  ],
  "gameplayArtBytes": 0,
  "keyArtBytes": 0,
  "totalArtBytes": 0,
  "budgetBytes": 1048576
}
```

Do not include generated-image service URLs, tokens, or private metadata.

## Production waves

### Wave 1: rejected and unfinished visuals

Hyper Circuit, Run 'n Gunner, Trailbound. These are independent file lanes and
may run concurrently. Complete local play proof before opening any PR.

### Deferred existing cabinets (do not touch)

Flap Hero, Starfall Squadron, Munch Maze, Rockbuster, Boulder Rush, Rune & Ruin,
and TypeStorm are explicitly outside this art run.

### Wave 2: uncreated game asset packs

Brickstorm, Sky Defense, Gem Columns, Kickflip City, and The Undervault. Produce
generated sheets, environment art, key art, exact frame grids, anchors, intended
render sizes, animation timing, and wiring notes. Do not create gameplay files.

### Later gameplay implementation (paused)

Claude or another gameplay owner may later implement Brickstorm, Sky Defense,
Gem Columns, Kickflip City, and The Undervault from their finished art manifests.
Logic commits and art commits stay separate until both are green. Do not start
gameplay implementation during this art run.

The implementation sequence, branch isolation procedure, cabinet contracts,
and copy-paste pickup prompt now live in `GAME-DEVELOPMENT-HANDOFF.md`.

## Local proof gate

For every scoped deliverable, in this order:

1. Inventory every generated file and byte count.
2. Prove deterministic sheet slicing: exact frame count, no equal-column fallback
   unless the sheet was designed for it, and no transparent/blank frame.
3. Run the cabinet harness for the three updated playable games. Hyper and Run
   already have:
   `node scripts/harness/hyper-circuit.mjs` and
   `node scripts/harness/run-n-gunner.mjs`. Use a bounded visual asset probe for
   Trailbound. The five wire-ready packs have no gameplay harness because this
   pass must not create gameplay.
4. Run `pnpm check`. Before PR, run the full `pnpm run ci` gate.
5. Play Hyper Circuit, Run 'n Gunner, and Trailbound on port 8080 with keyboard
   and touch-sized viewports. Exercise movement, animation, event or region
   transitions, pause/resume, and restart. Do not manufacture a playable cabinet
   for any of the five art-pack-only games.
6. Capture desktop and mobile screenshots plus a short frame sequence for each
   looping animation in the three existing games. Inspect every source sheet and
   panorama at original resolution for all eight deliverables.
7. Reject/regenerate any image that reads as clipart, glossy 3D, stock, off-brand,
   wrong vehicle/era, duplicated enemy, or low-contrast scenery.
8. Reject integration if frames jump, resize, clip, sink through the floor,
   overlap incoherently, expose magenta fringe, pop at a background seam, or alter
   a collision outcome.
9. Jeff approves the local cabinet. Local approval is the gate for GitHub.

## Git and release lane

After local approval, split the local art-lab work by game. Each branch starts
from current `dev`, never `main` or `prod`:

```text
feature/art-hyper-circuit
feature/art-run-n-gunner
feature/art-trailbound
feature/art-<slug>
```

Each branch gets one cabinet-scoped PR into `dev`. CI must pass before merge.
Do not combine multiple games into one art PR. Once the approved game PRs are in
`dev`, open a release PR from `dev` to `prod`, run CI again, deploy with Vercel,
publish only the matching database rows/scripts, and prove the guest production
URL with a screenshot. Never use a green preview deploy as permission to publish
an unapproved cabinet.

## Claude continuation prompt

```text
Work in <LOCAL_PATH>. Read
ART-PRODUCTION-HANDOFF.md, AI_RULES.md, PATTERNS.md, ART-HANDOFF.md, HANDOFF.md,
and DEVLOG.md. The current local art lab is feature/catalog-art-local, created
from dev at 4b130aa. Do not merge PR #4, push, publish, or deploy. First inspect
git status and coordinate with any in-flight game owners so files have one
writer. Continue the current production wave only. Use built-in image generation
for raster assets, keep gameplay and balance untouched, enforce the magenta-sheet
and 1 MiB contracts. Wire only Hyper Circuit, Run 'n Gunner, and Trailbound
into their cabinets. For Brickstorm, Sky Defense, Gem Columns, Kickflip City,
and The Undervault, produce assets and exact manifests without gameplay files.
Run the playable cabinet harnesses plus pnpm check, and actually play the three
updated cabinets on the existing port 8080 server. Capture
desktop/mobile evidence and regenerate anything clipart-like, off-palette,
duplicated, clipped, jittery, or wrong for the game's world. Report exact files,
prompt summaries, total bytes, verification, residual risks, and one next gate.
```
