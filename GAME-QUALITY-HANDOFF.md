# Game quality handoff

The bar every cabinet must clear before Jeff sees it, written after the
Kickflip City 10-second-death failure. This continues the art and game
development handoffs and governs the polish lane.

## The quality bar

1. **A fumbling player gets a real run.** Simulate a bad player (holds
   forward, reacts on a slow fixed rhythm, never plans) against the real
   engine. They must survive at least 90 seconds and put points on the
   board. Kickflip shipped at 18.6 seconds and zero points; nobody caught
   it because every bot in the harness was competent. The casual bot is now
   part of the bar: build it before tuning, keep it in the harness.
2. **Failure is always legible.** The player must be able to say what
   killed them. Concretely: the same hazard can never kill twice in a row
   (mercy rules after a respawn), slow contact is never a full failure,
   and a technicality the player cannot see (a flip 90 percent done, a
   grab held into a landing) resolves in the player's favor.
3. **Depth beats length.** Prefer endless escalation loops over a short
   fixed campaign. Kickflip City is the model: three districts loop as
   laps with fresh generated layouts, a faster board, and a tighter clock
   each lap; the run ends only when a clock runs out. The lap bonus and
   ramp live in `TUNE`.
4. **Every failure animation is a real presentation.** No spinning-forever
   placeholders. A crash tips over and holds; a death holds its authored
   frame. If the art has no pose for it, compose one from transforms that
   reads as the event, not as a glitch.
5. **Every threshold is calibrated, never guessed.** Legend scores sit
   between a measured sloppy-play ceiling and a measured skilled floor,
   with both populations printed by the harness.
6. **Nothing ships without live eyes.** Full-resolution screenshots of the
   real page, plus the casual-bot measurement, before any cabinet is
   called done. Headless proofs alone have missed every composition bug
   this project has had.

## What was fixed to this bar (2026-08-24)

- **Kickflip City**: endless laps with per-lap regenerated districts and
  ramps (`lapBonus`, `lapSpeedRamp`, `lapClockDrop`); 120 s clocks and
  3 s bail penalties; stumble rule under 155 px/s; same-hazard mercy
  within 140 px of the last wreck; flip forgiveness at 65 percent of the
  spin; grabs auto-release on landing; tip-over crash presentation; the
  casual bot went from 18.6 s and 0 points to 104 s and 1,906.
- **Hyper Circuit**: the player car drew at nearly twice the width of a
  rival directly ahead; player width 68 to 56, rival world width 14 to 17.
- **Brickstorm endless** (loops with a loop speed bonus; ball ramps per
  board instead of per run, which was outrunning casual players; casual
  bot went from a 12-second death to clearing a full loop).
- **Gem Columns endless** (wells loop with a fall-speed ramp; casual
  flat-stacker survives 231 seconds).
- **Sky Defense endless** (regions loop with a threat-speed ramp; casual
  no-lead defender survives 105 seconds).

## Punch list, in order

1. **Jeff's bug reports rule.** He reports playtest bugs faster than any
   harness finds them. When he names one, reproduce it with a bot or a
   staged engine state first, then fix, then show the same reproduction
   passing.
2. **Hyper Circuit toward more track variety.** Jeff wants many tracks and
   is fine with flat generated scenery for them. The course table already
   generates from control points; add generated circuit variations (seeded
   control-point loops through the existing validator) and a cup rotation.
   Scenery can be palette-flat; the art rule allows level geometry fills.
3. **Endless review: done for Kickflip, Brickstorm, Gem Columns, and Sky
   Defense.** The Undervault stays a bounded expedition by design. Any
   future cabinet follows the same pattern: loop with a ramp, run ends on
   the existing fail state, thresholds recalibrated, casual bot in the
   gate.
4. **Casual bots into every harness** (the bar above), including the six
   older cabinets when they next open for changes.

## Ground rules unchanged

One cabinet per branch, cut from dev. Commit locally, never push without
Jeff's approval. The single dev server runs the `local-preview` merge of
every branch on port 8080; re-merge a branch after committing to it.
Art-truth discipline: trust pixels over manifests, erase stray fragments,
measure before placing.
