# 01: Give every Gloam type its own visual identity

Status: ready-for-agent
Blocked-by: []
Unlocks: []

## Goal

Each of the 17 horde types reads as itself at cabinet scale instead of
sharing one flat hide color.

## Context

Read `src/games/lastwatch/render/actors.ts` (the `HIDE` material and
`gloamGeometry`), `src/games/lastwatch/render/scene.ts` (`PALETTE`), and
`src/games/lastwatch/render/textures.ts` (the canvas-texture pattern the
level already uses). All types currently share one `MeshLambertMaterial`
plus glowing eyes. Geometry is merged per type and drawn as one
InstancedMesh with material groups, so per-type color means more
material groups in the merge, not per-instance colors. Constraints: the
warm night palette (no purple, no blue, no neon), the toy-soldier look,
and the integrated-graphics perf budget in `docs/LASTWATCH-GDD.md`. Zo
image generation may still be down. Canvas textures and material zones
are the sanctioned path, matching the level surfaces.

## Done condition

Every type has a distinct hide treatment (color zones by intelligence
tier plus per-type accents, canvas texture on the four bosses if it
earns its frame cost). A staged scene showing all types side by side
stays inside the GDD frame budget on the dev machine.

## Verify

`pnpm typecheck` and `node scripts/harness/lastwatch.mjs` stay green
(no sim change). Browser proof on `/dev/lastwatch` with the pane
displayed: a screenshot of the staged lineup and a 120-frame time
sample within the GDD budget.

## Log

- 2026-08-25 fable: ticket written from Jeff's second playtest feedback.
