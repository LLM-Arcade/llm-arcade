# 06: Tear the old realm down before building the next one

Status: ready-for-agent
Blocked-by: []
Unlocks: []

## Goal

Restarting a run releases the previous run's GPU resources instead of
abandoning them.

## Context

Found by the PR #21 review. `RenderRoot.dispose` in
`src/games/lastwatch/render/index.ts` only calls
`renderer.dispose()`. Every `api.start` in
`src/games/lastwatch/Lastwatch.tsx` builds a new `WebGLRenderer` on the
same canvas plus fresh `HoldView`, `HordeView`, `FxView`, and 17
`InstancedMesh` geometries, and abandons the previous set undisposed.
Repeated restarts leak GPU memory and can exhaust WebGL contexts, and
the machine this ships to has no discrete GPU. Dispose geometries,
materials, and textures in `dispose()`, or keep one `RenderRoot` alive
across runs and reset its state instead of rebuilding it.

## Done condition

Twenty consecutive restarts hold GPU memory flat and never lose the
WebGL context on the dev machine.

## Verify

`pnpm typecheck` green, harness green. Browser proof with the pane
displayed: restart the run twenty times on `/dev/lastwatch`, then
confirm no context-lost console event and a flat trend in
`performance.memory` or the WebGL debug info.

## Log

- 2026-08-25 fable: ticket written from the PR #21 review findings.
