# 04: Loot you can pick up, carry, and wear

Status: ready-for-agent
Blocked-by: [02]
Unlocks: []

## Goal

Gear enters the run as drops as well as purchases, and the watch can
carry alternatives and swap between them mid-run through an inventory
panel.

## Context

Read `src/games/lastwatch/engine.ts` (drops, `DROPS`, pickup handling,
boss weapon caches per the GDD), `src/games/lastwatch/arsenal.ts`
(weapons, armor, quality tiers, trade-in), `src/games/lastwatch/
Lastwatch.tsx` (the ledger UI and keybinds, B opens the ledger), and
`src/games/lastwatch/partner.ts` (the partner reads
`WEAPONS[me.weapon.id]` live, so swaps are already safe for the AI).
Design intent from Jeff: find a helmet, put it on, see it (ticket 02
renders it). Decisions to make in the ticket, not re-litigated later:
carry cap (proposal: 2 weapons per character), whether armor drops
replace or stack (proposal: pick-up equips if strictly better, else
banked for the swap panel), and drop sources (boss caches guaranteed,
elite kills rare). Balance guard: the casual floors and ace-duo proofs
in the harness must hold, and the economy must not deflate (drops
compete with the ledger's valor sink).

If sim plus UI overruns one session, split: 04a sim (drops, carry,
swap by keybind) and 04b panel UI. Log the split here.

## Done condition

A dropped weapon or armor piece can be picked up with E, appears in an
inventory panel, swaps in on demand, changes the figure (ticket 02),
and the full harness including the economy proofs stays green.

## Verify

New staged harness proofs: a cache drop grants gear, a swap changes
`weapon.id` and the swing that lands, casual floors and ace duo
unchanged within tolerance. Browser proof of the full loop with the
pane displayed.

## Log

- 2026-08-25 fable: ticket written from Jeff's second playtest feedback.
