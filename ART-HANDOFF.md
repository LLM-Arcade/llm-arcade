# Art handoff

Mission for whichever agent picks this up: replace every stand-in sprite
in Hyper Circuit and Run 'n Gunner with generated originals, using your
image-generation capability. Gameplay code is finished and proven. This
is an art and integration pass only. You need an agent that can generate
images, edit the repo, run commands, and drive a browser.

## Read first

`CLAUDE.md`, `AI_RULES.md` (design bans and the asset diet),
`PATTERNS.md` section 2 (the sprite pipeline), and the Hyper Circuit and
Run 'n Gunner sections of `HANDOFF.md`. Every stand-in load site carries
a `// STAND-IN ART:` comment naming the final sheet it expects. Find
them all with:

```bash
grep -rn "STAND-IN ART" src/games/hyper-circuit src/games/run-n-gunner
```

## Hard rules for every generated image

- Flat solid colors. No grain, no noise, no gradients, no outlines
  bleeding into the background, no text anywhere in the image.
- Palette family: warm paper `#F6F1E7`, ink, terracotta `#C4491F`,
  olive, mustard, warm neutrals, rust-brown. Never purple, never blue,
  never neon.
- Sheets that need transparency: solid magenta `#FF00FF` background,
  all frames in ONE horizontal row with clear magenta gaps between
  frames. The runtime slicer is gap-based: it keys out magenta, splits
  on fully-magenta columns, and falls back to equal-width columns if the
  gap count is wrong, which shows as clipped sprites. Verify frame
  counts after integration.
- Full-bleed textures (terrain, sky bands): no magenta, flat color,
  tileable where the load site says so.
- Size discipline: read each draw site for the rendered size and
  generate or downscale to at most 2x that. Quantize every PNG
  (pngquant or equivalent) and strip metadata. Budget: well under 1 MB
  of art per game.

## Run 'n Gunner sheets (prompts ready to paste)

Files go to `public/assets/games/run-n-gunner/`. Frame counts must match
what `src/games/run-n-gunner/sprites.ts` slices.

1. `gunner.png`: "Flat vector sprite sheet, 3 frames in a horizontal row
   on solid magenta #FF00FF: a small side-view soldier in olive fatigues
   and a terracotta scarf running (frame A legs apart, frame B legs
   crossed) and jumping (knees tucked), rifle held level, facing right,
   flat solid colors, no outlines, no gradients, no noise, no text."
2. `foes.png`: "Flat vector sprite sheet, 5 frames in a horizontal row
   on solid magenta #FF00FF: a squat scuttling robot on wheels, a dome
   turret pod with a stubby barrel, a legged mortar hopper bot, a small
   hovering supply drone with a crate, and a large armored boss hulk
   with vents, rust-brown and olive palette, flat solid colors, no
   gradients, no noise, no text."
3. `fx.png`: "Flat vector sprite sheet, 5 frames in a horizontal row on
   solid magenta #FF00FF: a short cream energy bolt capsule, a round
   amber enemy orb, a dark iron grenade ball, a spiky explosion burst, a
   small four-point muzzle flash star, flat solid colors, no gradients,
   no noise, no text."
4. `pickups.png`: "Flat vector sprite sheet, 3 frames in a horizontal
   row on solid magenta #FF00FF: three small weapon crates with glyphs,
   one with a three-way fan of lines, one with a fast double-chevron,
   one with a heavy single shell, terracotta and mustard on dark iron,
   flat solid colors, no gradients, no noise, no text."
5. Key art `public/assets/games/run-n-gunner.png` (grain allowed on key
   art only): "Flat vector illustration, square, a lone soldier with a
   rifle sprinting right along a canyon road at dusk while a huge
   armored machine looms ahead, earthy terracotta olive and mustard
   palette on warm paper, subtle paper grain, no text."

## Hyper Circuit sheets

Files go to `public/assets/games/hyper-circuit/`. Match the load sites
in `src/games/hyper-circuit/sprites.ts` and `track-texture.ts`.

1. `ships.png`: "Flat vector sprite sheet, 5 frames in a horizontal row
   on solid magenta #FF00FF: five small top-down anti-gravity racing
   craft seen from behind at a slight overhead angle, one cream-and-
   terracotta player craft plus four rival craft in olive, mustard,
   rust, and ink, each a distinct silhouette, flat solid colors, no
   gradients, no noise, no text." Adjust the frame count to what
   `sprites.ts` slices.
2. `fx.png`: "Flat vector sprite sheet, 4 frames in a horizontal row on
   solid magenta #FF00FF: a boost flame teardrop, a small rail spark
   burst, a shield shimmer arc, a speed streak dash, warm cream amber
   and terracotta, flat solid colors, no gradients, no noise, no text."
3. `terrain-scrub.png` (tileable, no magenta): "Flat vector seamless
   tile of sparse desert scrub on sun-baked flats, olive dots and dashes
   on warm sand, flat solid colors, no gradients, no noise, no text."
4. Track stamps sheet `stamps.png` (magenta row): rail segment, start-
   line checker block, pit-pad glyph. "Flat vector sprite sheet, 3
   frames in a horizontal row on solid magenta #FF00FF: a short
   terracotta guard-rail segment bar, a two-tone cream and ink checker
   block, a rounded olive pit-pad arrow glyph, flat solid colors, no
   gradients, no noise, no text."
5. Optional sky band replacing the flat haze fills in `render.ts` if it
   reads better in play.

## Integration and proof

1. Swap each load site to the new sheet, delete its `STAND-IN ART:`
   comment, and keep engine, balance, and achievement code untouched.
2. Run the harnesses. Both must stay PASS:
   `node scripts/harness/hyper-circuit.mjs` and
   `node scripts/harness/run-n-gunner.mjs`.
3. Run `pnpm check` (lint, typecheck, build). The pre-push hook runs it
   again on push.
4. Play both at `/dev/hyper-circuit` and `/dev/run-n-gunner` (dev server
   port 8080). Confirm sprites key cleanly with no magenta fringe, the
   slicer takes the gap path with the expected frame counts, and nothing
   regressed. Screenshot each game mid-play.
5. Report total art bytes per game against the 1 MB budget.
6. Commit atomically, one commit per cabinet ("Real art for Hyper
   Circuit", "Real art for Run 'n Gunner"), and push once green.

## The art bar

Good and fitting beats done. Every sheet must sit in the same visual
family as the existing key-art tiles in `public/assets/games/` and the
site's warm editorial look. After integrating, look at the game
running and judge it: if a sprite reads as clipart, clashes with the
palette, or breaks the game's mood, regenerate it. Iterating on a
prompt is cheap. Shipping art that looks pasted-in is the only failure
mode here.

## Publish each cabinet when its art passes

Publishing is YOUR step, per cabinet, immediately after that cabinet's
proof passes. For each game, in order:

1. Push and confirm the CI run is green and the Vercel deploy is
   serving the new art (load the game's page on `llmarcade.fun`).
2. Run the one-line script for that game against the Supabase project
   (`db/publish-hyper-circuit.sql` or `db/publish-run-n-gunner.sql`),
   through the Supabase dashboard SQL editor in your browser or any
   database access your harness has. The project is
   `afcqhievsmnepxopetkt` ("Arcadetown").
3. Verify live: play the game as a guest at
   `https://llmarcade.fun/game/<slug>`, confirm it boots, sprites key
   cleanly, and a run reaches game over. Screenshot it.

`/game/:slug` is open pre-launch, so the game is publicly playable the
moment the row flips.

## Out of scope

Do not change gameplay or balance values (the human does edge-case
fixes after playing), do not edit `src/components/ui/`, and do not
touch database rows beyond the two publish scripts. Trailbound's extra
scene art (forts, rivers, hunt, arrival) is a welcome follow-up pass
with the same rules, but only after both cabinets above are published.
