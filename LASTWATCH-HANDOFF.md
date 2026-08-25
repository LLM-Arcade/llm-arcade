# Lastwatch: the 3D flagship handoff

**Status 2026-08-24: phase 1 delivered.** The complete GDD is at
`docs/LASTWATCH-GDD.md` and awaits Jeff's approval. Phase 2 (sim core +
harness) does not start until he approves it and picks the name.

The brief, context, and build contract for the most ambitious cabinet in
the catalog: a real-time 3D co-op horde defense. Working title
**Lastwatch** (the keep is the Lastwatch; alternates: Emberhold, The Last
Levy). Jeff picks the final name. The name "Varlamore" from the original
pitch is RuneScape IP and is banned by the no-existing-IP rule.

## What Jeff asked for, verbatim in spirit

A complete 3D realm. The player is a mage, a knight, or an archer in a
kingdom's last military hold, fighting hordes trying to overwhelm it,
side by side with an AI partner or a second player. Call of Duty Zombies
in structure: waves, escalation, holding ground. The mage fires ranged
spells and heals the party. The archer is ranged with a dagger for close
work. The knight is armored, devastating, and must be up close. This is
the deepest, most fleshed-out, most skill-driven game in the catalog. It
is enjoyed in full screen and it has music and sound effects.

## The design pillars (expand these into the full GDD)

1. **Story.** The kingdom has fallen behind you; the Lastwatch is the
   final gate. Each run is one night of the siege. The horde comes with
   the dark, wave after wave, and dawn never comes; the score is how long
   the watch held and how much of the horde it took down. Companion
   banter and a short opening crawl carry the tone: worn, warm, defiant,
   never grimdark. Original mythology only, secular language only.
2. **Feel.** Weighty and readable. Three to five seconds of quiet between
   waves that feels earned. The knight feels like a wall, the mage like
   artillery with a lifeline, the archer like tempo. Hordes feel
   overwhelming but every death is legible (the quality bar applies in
   full). Warm palette even in 3D: terracotta stone, olive banners,
   mustard torchlight, ink-dark night. No purple, no blue-dominant light,
   no neon.
3. **Play.** Third-person WASD + mouse-look (pointer lock in
   fullscreen). One shared keep arena with lanes, a gate, barricades,
   and high ground that matters per class. Waves escalate endlessly with
   named milestone waves; between waves, spend banked valor on repairs,
   ammo/mana wells, barricade upgrades, and class kit upgrades (the
   Zombies economy loop, originalized). Downed allies bleed out unless
   revived; the run ends when both the player and partner are down or
   the keep's heart falls.
4. **Classes.**
   - Knight: heavy melee arcs, block/brace, taunt, highest armor,
     shortest reach. Skill is spacing and crowd shaping.
   - Archer: charged shots, headshot multipliers, dagger with a quick
     backstep for point-blank panic, traps as an upgrade line. Skill is
     kiting and priority targets.
   - Mage: arcing bolts and a channel beam, area burn, and the only
     party heal; healing spends the same mana as damage. Skill is
     resource triage.
5. **The partner.** Default: an AI companion of a class the player did
   not pick, with real behavior (holds a lane, calls targets, revives,
   retreats to heal range when hurt) and a simple command wheel (hold F:
   defend gate / push / follow / regroup). Optional local second player
   on the same keyboard (documented split layout) is a stretch goal
   behind the AI partner working well; do not let it block the game.
6. **Audio.** First cabinet with music. All audio is synthesized in
   WebAudio (no external files, no licensed anything): a low drone-pulse
   siege theme that layers intensity with the wave number, a quiet
   between-waves motif, and full SFX coverage (footsteps by class weight,
   bow draw, spell cast, heal chime, horde snarls, gate damage, wave
   horn). Mute and music-volume controls, `M` mute as house standard.
7. **Fullscreen first.** The cabinet promotes fullscreen on start (the
   GamePlayer fullscreen control already exists) and its HUD is designed
   at fullscreen scale first, windowed second.

## Technical contract

- **Renderer: Three.js, pinned exact version** (pnpm add three@<current
  exact> plus @types/three; verify the release is older than 72 hours per
  the security law; never @latest). This is the repo's first 3D cabinet
  and it is an explicit, Jeff-commissioned exception to the 2D sprite
  pipeline: low-poly geometry and flat-shaded materials are the level
  geometry class, characters and horde are low-poly meshes or generated
  billboard sprites, and any texture that reads as art (banners, faces,
  key art) is AI-generated. Palette rules still bind the 3D look.
- **Performance budget is a hard wall.** Dev machine "StruggleSoft" is a
  Ryzen 5, 16 GB, integrated graphics only. Target 60 fps at 1080p on
  that machine: instanced horde meshes, one directional light plus
  emissive torches, no shadows beyond a blob or a single low-res map,
  horde cap tuned by measurement, LOD or despawn beyond the wall. Measure
  with the live frame-time sampler before calling any wave size final.
- **Engine/render split, same as every cabinet.** `engine.ts` is
  DOM-free deterministic simulation (seeded mulberry32, no Math.random,
  fixed tick, event queue, relative .ts imports) so
  `scripts/harness/<slug>.mjs` runs the identical simulation under node
  24. Three.js lives only in the render/shell layer. The AI partner and
  the horde AI are engine logic and therefore fully harness-testable.
- **Cabinet contract as always:** Track A, registered in
  `src/games/registry.ts`, `ArcadeGameProps` (`onScore`,
  `onAchievement`), one score submission per run, score under the seeded
  cap, seven-plus achievements matching `db/seed-<slug>.sql` exactly,
  publish SQL separate, pause `P`, mute `M`, auto-pause on hide,
  restart via GamePlayer remount. Touch is exempt for this cabinet:
  tag it keyboard-only in the seed row (the spec allows an explicit
  "keyboard only" tag).
- **Harness must prove:** deterministic same-seed replay; an ace-bot
  duo surviving to a deep milestone wave; the quality-bar casual bot
  (slow aim, panic melee) surviving at least 90 seconds with points; a
  do-nothing loss path; class kit numbers (knight arc hits N targets,
  heal restores what it says, dagger beats bow inside its range); the
  partner AI reviving and retreating when the staged state demands it;
  economy arithmetic; the score cap under a forced flood; calibrated
  legend threshold from measured populations.

## Process contract (unchanged house rules)

- Machine: `<LOCAL_PATH>` is the docs/art
  branch checkout (`feature/catalog-art-local`). Build in a sibling
  worktree: `git worktree add ..\jolly-bear-cheer-lastwatch -b
  feature/lastwatch-game origin/dev` (final slug once named). pnpm only.
- Commit locally per task boundary; never push, PR, deploy, or touch
  Supabase without Jeff's explicit approval. Seed and publish SQL are
  files only.
- The one dev server: merge the branch into `local-preview` in
  `..\jolly-bear-cheer-preview` and serve on port 8080 (launch config
  `arcade-dev` in the docs checkout's `.claude/launch.json`). Playtest at
  `/dev/<slug>`; `/dev` lists every cabinet.
- Quality bar: `GAME-QUALITY-HANDOFF.md` binds in full, especially
  casual-bot survival, legible failure, calibrated thresholds, and
  live-eyes full-resolution screenshots before anything is called done.
- Required reading in the repo before any work: `CLAUDE.md`,
  `AI_RULES.md`, `PATTERNS.md`, `HANDOFF.md`, `GAME-QUALITY-HANDOFF.md`,
  and `.dyad/plans/chat-1-plan.md` section 6.

## Build phases, each ending in a Jeff gate

1. **GDD.** Write the complete game design document as
   `docs/LASTWATCH-GDD.md`: story and opening crawl text, the keep's
   layout with a top-down diagram, full class kits with numbers, horde
   roster (5+ enemy types with roles: runner, shieldbreaker, lobber,
   brute, hexer at minimum, plus milestone bosses), wave and economy
   tables, partner AI behavior spec, audio plan with motif descriptions,
   HUD sketches, achievement list, and the perf budget. Jeff approves
   the GDD before any code.
2. **Sim core + harness.** The whole game headless: movement, classes,
   horde, partner, waves, economy, downs/revives, scoring. Harness green
   including the casual bot.
3. **3D realm.** Three.js keep, characters, horde, effects, HUD, at
   budgeted frame times on integrated graphics, live-verified.
4. **Audio.** The layered siege score and full SFX, synthesized.
5. **Polish and proof.** Full playtest loop, screenshots, DEVLOG and
   HANDOFF entries, seed/publish SQL, stop at Jeff's approval gate.

Do not compress phases. Each is at least one session of work, and the
GDD gate is not skippable.
