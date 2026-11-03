# 03: Animate each weapon like the thing it is

Status: ready-for-agent
Blocked-by: [02]
Unlocks: []

## Goal

Every weapon's use reads correctly from the third-person camera: a
halberd thrusts, a maul falls, a crossbow shoulders, a cinder-rod
flicks.

## Context

Read `src/games/lastwatch/render/actors.ts`. The light/heavy sword
curves from the second-playtest fix (alternating level cuts with an
anticipation tell and a torso lean) are the pattern: short pose curves
keyed off `lastAttackAt`, `lastAttackHeavy`, `charging`, and weapon
kind. Extend per `weapon.id`: halberd = two-hand forward thrust
matching its 3.6 m reach, war axe = diagonal cut, maul = slow overhead
with a beat at the top, crossbow = level hold with a reload dip,
repeater = rapid small cycles, staffs = cast poses varying by
bolt/beam/mend. Weapon geometry and anchors come from ticket 02. The
hit math already differs per weapon, so the sim stays untouched (it
already stamps `lastAttackHeavy` for the render layer). Build the
curves as a per-`WeaponId` pose table rather than growing the if/else
chain. The PR #21 review named that chain as the thing this ticket
must replace, not extend.

## Done condition

Each weapon in `arsenal.ts` has a distinguishable use animation with an
anticipation beat, and nothing clips through the figure or the floor at
desktop or 390 px widths.

## Verify

`pnpm typecheck` green, harness green. Browser proof with the pane
displayed: swing or fire every weapon on `/dev/lastwatch`, screenshot
mid-animation each, and a 120-frame time sample within the GDD budget.

## Log

- 2026-08-25 fable: ticket written from Jeff's second playtest feedback.
