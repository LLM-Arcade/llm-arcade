# 02: Render the gear the watch actually wears

Status: ready-for-agent
Blocked-by: []
Unlocks: [03, 04]

## Goal

A hero's armor tier and exact weapon are visible on the figure, so a
plate knight with a maul looks different from a padded one with the
worn sword.

## Context

Read `src/games/lastwatch/render/actors.ts` (`HeroView` builds one
weapon silhouette per class at construct time), `src/games/lastwatch/
arsenal.ts` (5 weapons per class with distinct shapes and reaches, 4
armor tiers with `wearable` lists), and `src/games/lastwatch/types.ts`
(`Character.weapon`, armor fields). The figure is rigid parts with
procedural poses. Keep that. Rebuild the held-weapon parts and armor
add-ons (helmet, pauldrons, skirt plates by tier) when
`weapon.id`/armor id changes, disposing replaced geometry. Halberd must
read long (3.6 m reach), maul heavy, crossbow stocked, the three
staffs tipped differently.

## Done condition

Buying any weapon or armor at the ledger changes the figure in the
frame within one tick, for both the player and the partner, with no
frame-budget regression.

## Verify

`pnpm typecheck` green, harness green (render-only). Browser proof with
the pane displayed: purchase each armor tier and at least one weapon
per class on `/dev/lastwatch`, screenshot each, confirm the partner's
gear renders too (partner gear purchases exist at 80% price).

## Log

- 2026-08-25 fable: ticket written from Jeff's second playtest feedback.
