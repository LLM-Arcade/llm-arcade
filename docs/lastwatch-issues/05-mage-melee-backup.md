# 05: Give the mage a staff strike so every class has close work

Status: ready-for-agent
Blocked-by: []
Unlocks: []

## Goal

A mage with something at arm's reach is not helpless: a staff jab
covers the last two meters the way the archer's dagger does.

## Context

Jeff's ruling from the second playtest: every class keeps a melee
backup. Knight is melee, archer has the dagger (`daggerStrike` in
`src/games/lastwatch/engine.ts`, tuned in `kits.ts`). The mage has
nothing under 2 m. Add a staff jab on primary within melee range or on
a dedicated edge (follow the dagger's shape: fixed damage, short
cooldown, small shove, no mana). Tune low: it is an escape tool, not a
build. Wire the partner's `survive` branch in `partner.ts` to use it
(the branch currently spends mana bolts point-blank). Banter hook
optional. Sword-swing pose curves in `render/actors.ts` show how to
pose it cheaply.

## Done condition

The jab lands inside 2 m for player and partner mage, costs no mana,
cannot out-damage bolts at range, and the harness's kit-math section
proves its numbers.

## Verify

New harness proof: staged gnasher at 1.5 m dies to jabs alone in
bounded time, and the partner-survive proof passes with a mage partner
at zero mana. Casual floors unchanged within tolerance. Browser feel
check with the pane displayed.

## Log

- 2026-08-25 fable: ticket written from Jeff's second playtest feedback.
