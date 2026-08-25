# Lastwatch: game design document

The complete design for the catalog's 3D flagship: a third-person co-op
horde defense where one player and an AI partner hold a broken keep
through an endless night. This document is the phase 1 deliverable from
`LASTWATCH-HANDOFF.md`. Jeff approves it before any code.

Every number in this document is the phase 2 starting point, not a
promise. The harness measures real populations and calibrates every
threshold marked **(cal)** before anything ships. The quality bar in
`GAME-QUALITY-HANDOFF.md` binds in full.

## 1. Name

Working title **Lastwatch**. The final name is Jeff's call. Candidates,
all original, secular, and clear of existing game IP as far as a title
search shows:

| Candidate | Case for it | Risk notes |
|---|---|---|
| **Lastwatch** (recommended) | One word, names the place and the act. The Watchfire, the Watch Ledger, and "the watch holds" all hang off it. | "The Last Watch" exists as novel titles in two book series. The single compound word as a game title appears clean. |
| The Ninth Hold | Ties directly to the opening crawl (nine holds, eight dark). Reads like a place you could point to on a map. | None found. |
| Emberhold | From the original handoff. Warm, matches the palette. | Close neighbors in fantasy naming ("Ember-" prefixes are crowded). |
| The Last Levy | From the original handoff. A levy is a raised militia, which fits the worn, unglamorous tone. | "Levy" reads as a tax to some players. |

Recommendation: keep **Lastwatch**. Slug `lastwatch`. The doc uses it
throughout. A rename before phase 2 costs one find-and-replace.

## 2. Story and tone

### The setting, in brief

Nine holds kept the line between the mountains and the sea, each with a
beacon fire on its wall. When a beacon burned, the dark of the hills
kept its distance. One by one the fires went out, and what the hill
country breeds where no light reaches came down: the **Gloam**. Not an
army and not a plague. A tide with teeth. The kingdom emptied westward
to the sea, and the Lastwatch, the ninth hold, stayed lit to cover the
road. The people it covered are gone now. The fire is still lit. The
watch is still held, out of stubbornness more than hope, by whoever is
left on the wall.

Tone rules, from the handoff: worn, warm, defiant, never grimdark.
The characters joke because the alternative is worse. Nobody prays,
nobody despairs, nobody monologues. Original mythology only, secular
language only. Dawn never comes because the run is the night, and the
score is what the night cost the Gloam.

### Opening crawl

Shown over a slow pan of the dark keep before the first run, skippable
with any key. Text, final unless Jeff edits it:

> Nine holds kept the line between the mountains and the sea.
> Eight are dark.
>
> The kingdom you swore to is behind you now, and it is quiet.
> What comes out of the hills is not.
>
> This is the Lastwatch. One gate, one fire, and whoever is
> left to hold them. The Gloam comes with the night, wave after
> wave, and the night is long.
>
> Nobody is coming. That is not despair. That is the job.
>
> Light the Watchfire. Bar the arch. Count what you take from them.
>
> The watch holds as long as you do.

### Companion banter

The partner speaks in short text barks above its HUD chip, paired with a
soft synth chirp, never a synthesized voice. Barks are picked from
per-situation pools by the seeded RNG so replays stay deterministic.
Sample lines, one per pool:

| Situation | Line |
|---|---|
| Run start | "Fire's lit. Boots on. Same as every night." |
| Wave clear | "Still standing. I'd call that a good trade." |
| New enemy type debuts | "New shape in the dark. Watch how it moves before you commit." |
| Hexer spawns | "The thin one at the back. It's stitching them stronger. Kill it first." |
| Mauler telegraph near player | "Big one winding up. Step wide!" |
| Barricade under 30% | "The arch won't hold much longer. Buy timber or buy trouble." |
| Player downed | "No. Not tonight. I'm coming." |
| Revive complete | "On your feet. The fire's still lit." |
| Partner retreating | "Falling back to the fire. Hold the line, I'll be back." |
| Partner healing (mage) | "Mending. Don't waste it." |
| Intermission | "Spend it. The dead don't keep ledgers." |
| Boss down | "Down! Mark the wall. That one's ours." |
| Deep waves (15+) | "I stopped counting waves. I count them." |

Full pools (6 to 10 lines each) are written in phase 2 as data in
`banter.ts`. All of it obeys the tone rules.

## 3. The keep

One shared arena. All distances are engine units, 1 unit = 1 meter.

### Top-down layout

```
                        N  (dark treeline, spawn ground)
        ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
                    |                 |
                    |    CAUSEWAY     |      lane A (open from wave 1)
                    |   8 m x 20 m    |
   =========================================================
   |  RAMPART (3 m deep, 4 m high)  [ARCH 4 m]  RAMPART    |   north wall
   |  w.stair \                                  / e.stair |
   |           \______      ______  ____________/          |
   |                                                       |
   ~ SAP                                                   |
   ~ 5 m rubble        C O U R T Y A R D                   |
   ~ ramp                36 m x 26 m                       |
   ~ (opens W4)                              POSTERN STAIR ~
   |  lane B                                 2 m (opens W7)~
   |                                             lane C    ~
   |                  (( WATCHFIRE ))                      |
   |                   3 m brazier,                        |
   |                   ledger table                        |
   =========================================================
                    south hall (sealed rubble, no access)
```

Legend: `=` standing wall, `~` breach or future breach, `(( ))` the
keep's heart.

### Zones and what they mean per class

| Zone | Purpose | Class value |
|---|---|---|
| Causeway (lane A) | The main approach. Walled sides funnel the horde toward the arch. | Archer and mage kill zone from the rampart above. |
| Arch | 4 m gate arch, permanently splintered open, holds the **arch barricade** (pre-installed, tier 1). | The knight's choke. One body can plug it. |
| Rampart | High ground over the causeway, reached by the west and east stairs. | Ranged classes shoot down the full causeway. Stalkers climb its outer face to contest it from wave 9. |
| Sap (lane B) | West wall collapses at wave 4 into a 5 m rubble ramp. Wide, ugly, hard to plug. | Mage burn fields shine here. Barricade slot (buy to install). |
| Postern stair (lane C) | East door splinters at wave 7. Narrow but close to the Watchfire. | Archer traps and dagger work. Barricade slot (buy to install). |
| Courtyard | The main floor. Open fighting, revive runs, repositioning. | Everyone. Nowhere is safe here by design. |
| Watchfire | 3 m brazier ring, 1,000 HP structure. The Gloam attack it when unopposed. If it falls, the run ends. | The regroup anchor and the last stand. |

Torch placement: eight wall torches plus the Watchfire. These are the
light sources and the palette carriers (section 13).

No jump button. Movement is ground plus stairs by design, which keeps
navigation deterministic and the horde honest. The archer's backstep
and the knight's shove-free spacing do the vertical game's job.

## 4. Core loop and run structure

1. **Class select.** Player picks knight, archer, or mage, then picks
   the partner's class from the remaining two. Recommended pairing is
   preselected: knight gets mage, mage gets knight, archer gets knight.
2. **The night begins.** Short horn, wave 1 trickles out of the
   treeline down the causeway.
3. **Wave.** Kill every Gloam in the wave. Valor accrues per kill to a
   shared party pool.
4. **The quiet.** On the last kill, all music layers cut to embers for
   4 seconds. Nothing spawns. This pause is scripted and inviolable:
   the earned breath from the design pillars.
5. **Intermission.** The horn answers from the hills. The **Watch
   Ledger** opens (auto, or `B`). 20 seconds (25 from wave 10) to spend
   valor on repairs, upgrades, and refills. Press `E` at the Watchfire
   to sound the early horn and skip the rest (+25 valor).
6. **Escalation.** Next wave is bigger, and on schedule the keep gets
   worse: the Sap collapses at wave 4, the postern splinters at wave 7,
   milestone bosses arrive every 5 waves.
7. **Run end.** The run ends when both the player and partner are down
   at the same time, or the Watchfire falls. One score submission,
   then the run-over panel with the death recap and stats.

Downed state: at 0 HP a character falls, crawls at 1.0 m/s, and bleeds
out in 30 seconds. An ally revives by holding `E` within 1.5 m for 3
seconds. A revived character returns at 40% HP with 3 seconds of
immunity. Immunity plus the death recap are the legible-failure rules
applied to this game (quality bar rule 2).

## 5. Controls

Keyboard and mouse only. The seed row carries the explicit
`keyboard only` tag the spec allows. Pointer lock engages in
fullscreen, and the cabinet promotes fullscreen on start via the
existing GamePlayer control.

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look and aim (yaw and pitch are sim inputs) |
| Shift | Sprint, 1.35x speed, cannot attack while sprinting |
| LMB | Primary: swing / shoot (hold to charge) / bolt (hold for beam) |
| RMB | Secondary: block-brace / dagger backstep / heal |
| Q | Class skill: taunt / caltrop trap / burn field |
| E | Interact: revive, early horn at the Watchfire |
| F (hold) | Partner command wheel |
| B | Watch Ledger (intermission only) |
| P / Escape | Pause (releases pointer lock) |
| M | Mute (house standard) |

Auto-pause on tab hide, restart via GamePlayer remount, one score
submission per run: the standard cabinet contract, unchanged.

### Local second player (stretch goal, honest note)

The handoff allows a same-keyboard second player behind the AI partner
working well. Documented layout: P2 moves on IJKL, aims with U/O turn
keys, acts on numpad 1/2/3. The real blocker is not input, it is
rendering: a second viewport doubles render cost, and the perf budget
(section 15) has no room for two 1080p viewports on integrated
graphics. Verdict in this GDD: design the sim so a second
human-controlled character is possible (the partner is just a
controller on a character), ship the AI partner, and treat split view
as a post-launch experiment. It does not block anything.

## 6. Classes

Shared numbers first, then each kit. All damage in HP. "Cycle" is time
between repeats at base upgrades.

| Stat | Knight | Archer | Mage |
|---|---|---|---|
| Max HP | 220 | 130 | 110 |
| Armor (damage reduction) | 40% | 0% | 0% |
| Move speed | 4.8 m/s | 5.6 m/s | 5.0 m/s |
| Resource | Guard 100 | Quiver 36 | Mana 100, regen 6/s (1 s delay after casting) |

### Knight: the wall

Skill statement: spacing and crowd shaping. The knight decides where
the fight happens.

| Tool | Numbers |
|---|---|
| Light arc (LMB) | 26 dmg, 110° arc, 2.6 m reach, 0.55 s cycle |
| Heavy cleave (hold LMB) | 55 dmg, 180° arc, 3.0 m reach, 1.1 s windup, staggers everything it hits, shatters a Breacher's shield in one hit |
| Block (RMB hold) | Frontal 120°, absorbs 70% of incoming damage, drains guard equal to raw damage, guard regen 15/s while not blocking, guard break staggers the knight 1.2 s |
| Brace (block while standing still) | No knockback from any hit, including Mauler slams |
| Taunt (Q) | 12 s cooldown, every Gloam within 8 m retargets the knight for 4 s |
| Passive | +2 HP per melee kill |

### Archer: the tempo

Skill statement: kiting and priority targets. The archer decides what
dies first.

| Tool | Numbers |
|---|---|
| Tap shot (LMB) | 18 dmg, instant, 0.5 s cycle, 1 arrow |
| Charged shot (hold LMB 0.9 s) | 48 dmg, pierces one body, 1 arrow |
| Headshot | 2x damage. Head hitbox is the top 20% of the enemy capsule, resolved in the sim |
| Dagger backstep (RMB) | 20 dmg, 100° arc, 1.8 m reach, then a 2.5 m backward hop, 1.2 s cooldown. The point-blank panic button |
| Caltrop trap (Q) | 2 charges, restock between waves. 2 m radius, slows 50% for 3 s. Upgrade line adds barbs and a third charge |
| Ammo | Quiver 36. Refill at the Ledger (40 valor). Gnashers drop a 6-arrow bundle 10% of the time |

### Mage: artillery with a lifeline

Skill statement: resource triage. Every point of mana is damage or
healing, never both.

| Tool | Numbers |
|---|---|
| Arc bolt (LMB) | 22 dmg, 8 mana, lobbed projectile at 18 m/s, 1.5 m splash at 60% damage |
| Channel beam (hold LMB) | 40 dmg/s, 18 mana/s, 14 m range, sustained |
| Mend (RMB) | Heals the aimed ally 35 HP for 25 mana, 12 m range. Aimed at nobody, heals self 25 HP for the same 25 mana |
| Burn field (Q) | 35 mana, 10 s cooldown. 3 m ground ring, 12 dmg/s for 6 s. The Sap's answer |

## 7. Shared systems

- **Damage model.** Flat numbers, armor as percent reduction, no
  crits except headshots. Every hit the player takes prints its source
  to the death-recap buffer.
- **Death recap.** The run-over panel names the killer, the place, and
  the wave: "Brought down by a Mauler slam at the Sap, wave 9." The
  legibility rule made visible.
- **Structures.** Arch barricade (tier 1 pre-installed), Sap and
  postern barricade slots, and the Watchfire. Structures take damage
  from a separate structure-damage stat so Breachers threaten walls
  without shredding players.
- **Friendly fire.** None, including burn fields.
- **Knockback.** Mauler slams and boss hits push 4 m unless braced.
  Nothing can push a player through geometry, and nothing in the keep
  is a pit. Position loss is the cost, not instant death.

## 8. The Gloam: horde roster

Charcoal-umber hide, ember-mustard eyes, warm accents only (palette
rules, section 13). Every type has one silhouette, one behavior, and
one counter that each class can execute differently. Base numbers at
wave of debut. Scaling in section 9.

| Type | Role | HP | Speed | Attack | Valor | Debut |
|---|---|---|---|---|---|---|
| **Gnasher** | Runner, the tide itself | 30 | 6.5 m/s | Bite 8, 0.9 s cycle. Structure dmg 4 | 10 | W1 |
| **Lobber** | Artillery | 45 | 4.2 m/s | Stops at 10 to 14 m, lobs an ember glob: 18 dmg plus a 1.5 m burn puddle, 6 dmg/s for 3 s, clearly rimmed | 20 | W2 |
| **Breacher** | Shieldbreaker | 90 | 3.5 m/s | Plank shield blocks all frontal ranged damage. Hits structures for 60 (5x multiplier), players for 12. Knight heavy shatters the shield. Charged headshots and flanks work too | 25 | W4 |
| **Mauler** | Brute | 320 | 3.8 m/s | Slam 35, 1.2 s telegraph, 3 m frontal, 4 m knockback. Only knight heavies and charged headshots stagger it | 60 | W6 |
| **Hexer** | Support caster | 40 | 4.0 m/s | Stays 12+ m back, channels a visible amber tether that grants nearby Gloam +30% speed, or shields a Mauler for 80 HP. Dies fast on purpose | 30 | W8 |
| **Stalker** | Anti-camp | 60 | 6.0 m/s | Climbs walls and the rampart's outer face, pounces the most distant ranged character for 14 dmg | 25 | W9 |

Design intent by counter: the Gnasher rewards arcs and splash, the
Lobber rewards priority fire, the Breacher rewards the knight or a
flank, the Mauler rewards the telegraph read, the Hexer rewards target
calling (the partner literally calls it), and the Stalker punishes
rampart camping without banning it.

### Milestone bosses

A named wave arrives every 5 waves. Bosses spawn alongside a reduced
escort, carry a boss health bar, and award 250 valor and 600 score.

| Wave | Boss | Behavior |
|---|---|---|
| 5, "Cracktusk" | A tusked Mauler alpha, 900 HP | Charges the arch in a straight, readable line, 1.8 s telegraph. Hitting a wall stuns it 2 s: the puzzle is baiting the charge |
| 10, "The Shepherd" | A hooded Hexer lord, 700 HP | Never approaches. Raises 3 Gnashers every 10 s and tethers speed to the whole pack until killed. A hunt through the horde |
| 15, "Coalhide" | An armored Mauler, 2,200 HP | 70% damage reduction except three glowing seams (back, both flanks) at 2x damage. The party creates flanks or dies to attrition |
| 20+ | The cycle repeats: Cracktusk at 20, Shepherd at 25, Coalhide at 30, and so on | Each repeat: +35% HP and one modifier (paired spawn at second repeat, escort budget +50% at third) |

Milestone waves 20 and beyond are named procedurally from a seeded
word table ("Deepnight", "The Ash Count", "Ninth Bell") so deep runs
keep their event feel.

## 9. Waves

### Schedule

Budget buys the wave's composition from the point costs below. Trickle
interval is the spawn pacing at wave start, tightening within the wave.

| Wave | Budget | Trickle | New | Notes |
|---|---|---|---|---|
| 1 | 65 | 7.0 s | Gnasher | 6 Gnashers. The tutorial by fire |
| 2 | 95 | 6.0 s | Lobber | |
| 3 | 130 | 5.2 s | | Iron Watch bonus eligible from here |
| 4 | 175 | 4.6 s | Breacher | The Sap collapses (scripted, horn, dust) |
| 5 | 225 | 4.2 s | Boss | **Cracktusk** |
| 6 | 280 | 3.8 s | Mauler | |
| 7 | 345 | 3.4 s | | Postern splinters open |
| 8 | 420 | 3.0 s | Hexer | Tier 3 barricades unlock |
| 9 | 495 | 2.7 s | Stalker | |
| 10 | 580 | 2.4 s | Boss | **The Shepherd**. Intermission 25 s from here |
| 11 to 14 | 670 / 770 / 875 / 985 | 2.2 s floor ramp | | |
| 15 | 1,105 | 2.0 s | Boss | **Coalhide** |
| 16 to 19 | 1,230 / 1,365 / 1,500 / 1,650 | | | |
| 20 | 1,800 | 1.5 s | Boss cycle | |
| 21+ | previous x 1.12 | 1.2 s floor | | Endless |

Formula behind the table: budget(N) = 40 + 20N + 3.4N², rounded to 5,
then x 1.12 per wave past 20.

### Composition

Percent of budget by band, spent left to right, remainder into
Gnashers:

| Waves | Gnasher | Lobber | Breacher | Mauler | Hexer | Stalker |
|---|---|---|---|---|---|---|
| 1 to 3 | 80 to 100% | 0 to 20% | | | | |
| 4 to 6 | 55% | 20% | 15% | 10% (W6) | | |
| 7 to 9 | 45% | 15% | 15% | 5% | 10% (W8) | 10% (W9) |
| 10+ | 35% | 15% | 15% | 15% | 10% | 10% |

Point costs for the budget: Gnasher 10, Lobber 25, Breacher 30, Hexer
35, Stalker 30, Mauler 80. Bosses are fixed spawns outside the budget.

### Endless scaling

- HP: x (1 + 0.05 x max(0, N - 8)), uncapped. This is the wall the run
  eventually breaks on.
- Speed: x (1 + 0.01 x max(0, N - 10)), capped at 1.15. Legibility
  cap: the horde never becomes unreadable.
- Damage: x (1 + 0.03 x max(0, N - 10)), uncapped.
- Concurrency: at most 40 Gloam alive at once, from the perf budget.
  The spawner holds the remainder. This cap is finalized by frame-time
  measurement on the dev machine, not by this document **(cal)**.

### Casual floor (quality bar rule 1)

Waves 1 and 2 are tuned so the casual bot (slow aim, 300 ms reactions,
panic melee inside 3 m, buys nothing, hugs the Watchfire) survives at
least 90 seconds and scores, on all three classes, with the partner
contributing. This is a harness gate, not an aspiration. If the tuning
above fails it, the tuning changes.

## 10. Economy: valor and the Watch Ledger

Valor is a shared party pool. Both characters earn into it, the player
spends it. Partner upgrades are bought by the player from the same
pool at 80% of player prices.

### Earning

| Source | Valor |
|---|---|
| Gnasher / Lobber / Breacher / Hexer / Stalker / Mauler | 10 / 20 / 25 / 30 / 25 / 60 |
| Headshot kill bonus | +5 |
| Boss | 250 |
| Wave clear | 50 + 10 x wave |
| Iron Watch (no player damage taken, wave 3+) | +100 |
| Early horn | +25 |
| Revive an ally | +25 |

### Spending (Watch Ledger, intermission only)

| Item | Price | Effect |
|---|---|---|
| Repair arch barricade | 30 per 100 HP | |
| Install Sap / postern barricade | 150 | Tier 1 timber, 300 HP |
| Barricade tier 2, studded | 250 | 600 HP max |
| Barricade tier 3, ironbound (wave 8+) | 600 | 1,000 HP max |
| Stoke the Watchfire | 40 per 100 HP | |
| Quiver refill | 40 | Full arrows |
| Second Wind (one per run) | 800 | Self-revive where you fell, once |

### Class upgrade lines, three tiers each

Prices 150 / 350 / 700 unless noted. Effects are cumulative from base.

| Class | Line | T1 | T2 | T3 |
|---|---|---|---|---|
| Knight | Blade | +25% dmg | +50% | +75% |
| Knight | Plate | armor 45% | 50% | 55% |
| Knight | Guard (120/280/550) | guard 140 | 180, regen 18/s | 220, regen 21/s |
| Archer | Draw | charge 0.75 s | 0.6 s | 0.5 s |
| Archer | Quiver (100/250/500) | 48 arrows | 64 | 80 |
| Archer | Traps (120/300/600) | +barbs 10 dmg/s | 3 charges | slow 65% |
| Mage | Attunement | mana 125, regen 7/s | 150, 8/s | 175, 9/s |
| Mage | Focus | +25% bolt and beam | +50% | +75% |
| Mage | Mending (120/280/550) | heal 45 | heal 60 | cost 20 mana |

Economy sanity: wave 1 pays about 125 valor, waves 1 to 3 pay about
450 cumulative, so the first tier 1 purchase lands at wave 2 or 3. An
ace duo reaching wave 10 has earned roughly 3,500 and can hold two
full lines plus infrastructure. The harness prints real earn curves
and these prices get recalibrated against them **(cal)**.

## 11. The partner

The partner is a full class character driven by engine logic. Same
kit, same numbers, same rules as a player of that class. It lives in
the sim, so every behavior below is harness-testable.

### Decision loop

Utility scoring every 0.5 s of engine time, deterministic, no RNG in
scoring. Highest score wins. Candidate actions and their base
priorities:

| Priority | Action | Trigger and behavior |
|---|---|---|
| 1 | Revive | Ally downed. Path to them, clear a 3 m bubble first if needed, channel the revive. Nothing except its own survival (HP under 15%) preempts this |
| 2 | Survive | Own HP under 30%. Disengage, retreat toward the Watchfire ring, mage self-mends, knight turtles while backing up |
| 3 | Heal (mage) | Ally under 60% HP and mana over 40. Move to heal range, mend |
| 4 | Execute command | The active command wheel order (below) |
| 5 | Priority target | Kill order: Hexer, then Lobber, then Breacher chewing a barricade, then the nearest threat to the weaker character |
| 6 | Hold lane | Default: anchor at the hottest choke (most incoming lane traffic), fight what comes |

### Command wheel (hold F)

Commands bias the utility scores, they do not lobotomize the loop. A
partner ordered to hold the gate still revives you.

| Command | Effect |
|---|---|
| Defend the arch | Anchor within 6 m of the arch |
| Push | Advance to the mouth of the most active lane |
| Follow | Stay within 8 m of the player |
| Regroup | Fall back to the Watchfire ring |

### Competence knobs

The partner supports, it never carries. Reaction delay 300 ms, aim
error 3° standard deviation, target switch cost 0.4 s, effective DPS
tuned to about 70% of the ace bot **(cal)**. No collision with the
player's capsule, so it can never pin you in a doorway.

### Target calling

The partner is the legibility system's voice. It barks on: enemy type
debuts, Hexer spawns, barricade under 30%, Stalkers on the rampart,
player HP under 35%, and its own retreats. Each bark maps to one
sim event, so the harness can assert they fire.

### Harness-provable behaviors (phase 2 contract)

- Staged ally-down at a known position: partner reaches and completes
  the revive within 12 s against wave-3 pressure.
- Staged HP 25%: partner disengages to at least 8 m from the nearest
  Gloam within 5 s (mage variant also self-mends).
- Command compliance: each wheel order changes the partner's anchor
  within 3 s.
- Mage partner triage: with ally at 50% and mana at 100, healing
  happens before damage casting.

## 12. Scoring and achievements

### Score

| Source | Points |
|---|---|
| Gnasher / Lobber / Breacher / Hexer / Stalker / Mauler | 20 / 45 / 55 / 70 / 60 / 130 |
| Headshot kill | +50% of that kill |
| Boss | 600 |
| Wave clear | 100 + 25 x wave |
| Iron Watch wave | 250 |
| Revive | 50 |

One `onScore` submission at run end with stats:
`{ wave, kills, headshots, damage_dealt, damage_blocked, hp_healed,
revives, valor_spent, class, partner_class }`. Score cap seeded at
2,000,000 **(cal against the forced-flood harness ceiling)**.

### Achievements

Ten, seeded in `db/seed-lastwatch.sql`, slugs fired by the engine and
matching the seed rows exactly. Class achievements require playing
that class, which seeds replay across the three kits.

| Slug | Name | Hint | Trigger |
|---|---|---|---|
| `first-night` | First Night | Hold the watch through wave 3 | Wave 3 cleared |
| `hold-the-arch` | Hold the Arch | The timber remembers | Reach wave 6, arch barricade never destroyed |
| `shoulder-to-shoulder` | Shoulder to Shoulder | Nobody bleeds out on your watch | Revive the partner |
| `quartermaster` | Quartermaster | Spend like the night is long | Spend 1,200 valor in one run |
| `crowd-breaker` | Crowd-Breaker | Four with one swing | Knight: heavy cleave hits 4+ Gloam |
| `keen-eye` | Keen Eye | Aim for the ember eyes | Archer: 15 headshot kills in one run |
| `lifeline` | Lifeline | Warm light, well spent | Mage: heal 400 HP in one run |
| `deep-watch` | Deep Watch | The Shepherd knows your name | Reach wave 10 |
| `watch-captain` | Watch Captain | Coalhide marked the wall | Reach wave 15 |
| `watch-legend` | Watch Legend | The night will remember this one | Score 250,000 **(cal: set between the measured sloppy ceiling and skilled floor)** |

## 13. Look and palette

The 3D exception is scoped, not open-ended: low-poly flat-shaded
geometry is the level-geometry class, characters and horde are
low-poly meshes, and anything that reads as art (banners, key art, the
Shepherd's hood pattern) is an AI-generated texture. No programmatic
2D art anywhere else in the cabinet.

Scene palette, all warm, no purple, no blue-dominant light, no neon:

| Element | Color direction |
|---|---|
| Night sky and fog | Ink `#171310`, warm black, never navy |
| Moonlight (the directional light) | Dim warm ivory `#E8DCC0`. The classic blue movie night is banned here |
| Keep stone | Terracotta `#9C6B4F`, shadow faces `#5E3D2E` |
| Timber and barricades | Umber `#6B4A33` |
| Banners | Olive `#6F6B3F`, AI-generated cloth texture |
| Torch and Watchfire light | Mustard `#D9A441` emissive |
| The Gloam | Charcoal-umber `#2E2620` hide, ember-mustard eyes and Hexer tethers `#D9A441` |
| Burn and ember effects | Terracotta `#C4633F` |

Character read: knight broad and steel-dulled, archer lean with an
olive hood, mage in undyed wool with a mustard sash. Silhouettes must
read at 30 m in torchlight.

**Motion safety (medical, non-negotiable).** No strobing, no rapid
high-contrast flashing, anywhere. Torch flicker is a slow amplitude
wander, damage feedback is a soft warm edge vignette, boss telegraphs
are poses and ground rings, never flashes. This constraint is written
into the render layer's review checklist for phases 3 and 5.

## 14. HUD

Designed at fullscreen scale first. Windowed inherits the same layout
at 90% scale. Paper-and-ink styling from the site's design system,
JetBrains Mono for numbers.

### In-wave

```
+----------------------------------------------------------------------+
| [fire] WATCHFIRE ########----  [arch] ARCH ######----    WAVE 7      |
|                                                     11 remain        |
|                                                       VALOR 485      |
|                                                                      |
|                                                                      |
|                            ( reticle )                               |
|                                                                      |
|                                                                      |
|                                                  "Lobber on the      |
|                                                   causeway."         |
| HP ############------                        [M] MARROW  mage       |
| GUARD ########--                             HP #####-----           |
| (class resource bar)                         > HOLDING THE ARCH      |
+----------------------------------------------------------------------+
```

- Top left: Watchfire and arch integrity bars, small, always visible.
  Sap and postern bars join them once those lanes open.
- Top right: wave number, Gloam remaining, valor pool.
- Bottom left: player HP plus the class resource (guard, quiver
  count, or mana).
- Bottom right: partner chip: name, class, HP, current state in words
  (HOLDING THE ARCH, REVIVING YOU, DOWNED 0:23), barks above it.
- Center: class reticle. Dot for knight, charge ring for archer, mana-
  tinted ring for mage. Hit confirmation is a subtle tick, not a flash.
- Damage direction: soft warm vignette on the hit side of the screen.

### Command wheel (hold F)

Radial four-slot wheel, mouse-direction select, release to confirm.
Time slows to 40% while held (sim-scaled, deterministic), does not
pause.

### Intermission ledger

```
+------------------ THE WATCH LEDGER ------------------+
|  VALOR 485                        NEXT WAVE IN 0:14  |
|                                                      |
|  REPAIRS            KIT: ARCHER        PARTNER: MAGE |
|  Arch  +100hp  30   Draw II     350   Attune I  120  |
|  Fire  +100hp  40   Quiver I    100   Mending I 96   |
|  Sap   install 150  Traps I     120                  |
|                     Refill quiver 40                 |
|                                                      |
|  [E at the fire: sound the early horn  +25]          |
+------------------------------------------------------+
```

### Run over

Death recap line first ("Brought down by a Mauler slam at the Sap,
wave 9"), then waves held, kills, headshots, damage dealt and blocked,
HP healed, revives, valor spent. GamePlayer's RUN OVER panel owns
restart, as always.

### Attract state

Idle on the game page: slow orbit of the torchlit keep, title card,
"any key" prompt. No sim running, no cost.

## 15. Performance budget

Hard wall: 60 fps at 1080p on the dev machine (Ryzen 5, 16 GB,
integrated graphics). If a feature and the frame budget conflict, the
feature loses.

| Budget line | Target |
|---|---|
| Frame total | 16.6 ms, split: sim ≤ 2 ms, render ≤ 10 ms, ≥ 4 ms headroom |
| Draw calls | ≤ 120 |
| Scene triangles | ≤ 150k with a full 40-Gloam wave |
| Lights | 1 directional (warm moon) + emissive torch materials. No dynamic point lights beyond 2 |
| Shadows | None. Blob decals under characters. Zero shadow maps |
| Post-processing | None. Exponential fog only |
| Materials | ≤ 8, Lambert flat-shaded, vertex colors where possible |
| Textures | ≤ 8 files, each ≤ 512², AI-generated art only where it reads as art |
| Heap | < 250 MB, no per-frame allocation in the render loop |

Implementation rules that make the numbers reachable:

- **Instanced horde.** One `InstancedMesh` per Gloam type per LOD.
  No skeletal animation anywhere: horde animation is per-instance
  procedural bob, lean, and lunge driven by an instance attribute.
  Player and partner are hierarchies of rigid parts (articulated like
  toy soldiers), which suits the low-poly look and costs no skinning.
- **LOD.** Near mesh ~800 tris, far mesh ~300 tris, swap at 25 m.
  Despawn beyond the treeline.
- **Auto-degrade ladder**, in order, when frame time holds over 14 ms
  for 3 s: internal render scale 1.0 → 0.85 → 0.75, then fog distance
  in, then LOD swap distance in. Never degrades sim correctness.
- **Live frame sampler.** Dev overlay prints average, p95, and max
  frame time. The 40-Gloam cap and every wave-size number get
  finalized from its measurements on the dev machine, per the handoff.

Three.js is added at phase 3 start: exact pinned version plus
`@types/three`, release older than 72 hours per the security law,
never `@latest`. The game route already lazy-loads, so three.js joins
the cabinet's chunk, not the platform bundle.

## 16. Audio plan

First cabinet with music. Everything synthesized in WebAudio at
runtime, no external audio files, no licensed anything. Buses: music
and SFX into a master gain. `M` mutes, pause menu holds a music
volume slider. Music sits 6 dB under combat SFX and ducks briefly on
the down sting. Audio context resumes on first input (autoplay
policy).

### The siege theme, layered by intensity

Intensity I = wave number + active Gloam / 10, recomputed per bar.
Rooted on D, warm and low, never shrill.

| Layer | Enters | Recipe |
|---|---|---|
| L0 embers | Always | Brown noise through a 300 Hz lowpass, slow amplitude wander. The floor of the whole mix |
| L1 drone | Wave 1 | Two saws at D1/D2, detuned ±6 cents, 400 Hz lowpass, 8 s swell cycle |
| L2 pulse | Wave 3 | 78 BPM: sine thump plus filtered-noise tap, sparse pattern |
| L3 ostinato | Wave 6 | Plucked D-F minor-third pair with an occasional G, triangle osc with fast decay, 2-bar loop |
| L4 pressure | Boss waves | Slow-tremolo warm sine cluster two octaves up, quiet, more felt than heard |

### The between-waves motif

"The ledger tune": sparse triangle plucks over the ember layer, a
D-A-C-D phrase at 72 BPM with seeded rests, no percussion. It enters
after the 4-second quiet (which is embers only, by design) and fades
on the horn.

### The horn

Two saws through a formant-shaped filter swell, a minor-third rise
D to F over 1.8 s. The hills answer with a detuned, quieter copy.

### SFX coverage

| Event | Recipe sketch |
|---|---|
| Footsteps | Per class weight: knight adds a metallic band-passed clank layer, archer is a soft thud, mage cloth-muted |
| Knight swing / impact / block | Lowpassed whoosh / bright clang (square burst + ring) / dull thunk with guard-drain pitch |
| Bow draw / release / arrow hit | Rising creak (filtered saw) / short thwip (noise burst) / thock |
| Dagger backstep | Quick slice + scuff |
| Bolt / beam / mend / burn field | Sine warble pop / sustained shimmer (detuned sines) / warm major-arpeggio chime / low crackle loop |
| Gnasher / Lobber / Mauler / Hexer / Stalker | Pitched noise snarl / wet lob + splat / deep roar + ground thud / tether hum / dry screech |
| Breacher vs structures | Wood splinter bursts, deeper as tiers rise |
| Barricade break / Watchfire hit / Watchfire falls | Crack cascade / deep gong-like thud / long low collapse with ember hiss |
| Down sting / revive channel / revive done | Falling minor third / soft rising pulse / warm resolve chord |
| Wave clear / purchase / achievement | Short resolve chord / coin-on-wood clink / the site's unlock feel, warm two-note |
| Boss stingers | One per boss: Cracktusk tusk-scrape, Shepherd's flock murmur, Coalhide furnace breath |

All synthesis lives in `audio.ts` behind the same `isMuted()` module
pattern every cabinet uses, driven by the engine's event queue.

## 17. Technical architecture

Same split as every cabinet, scaled up:

```
src/games/lastwatch/
  engine.ts      DOM-free deterministic sim: fixed 60 Hz tick, seeded
                 mulberry32, no Math.random, no Date, event queue,
                 relative imports only
  keep.ts        Arena data: wall segments, waypoint graph, lanes,
                 structure defs, torch and spawn points
  waves.ts       Budget tables, composition bands, scaling, spawner
  kits.ts        Class numbers, upgrade lines, ledger prices (the TUNE
                 of this cabinet, every knob unit-commented)
  partner.ts     Utility scorer, command state, bark triggers
  banter.ts      Bark pools as data
  audio.ts       WebAudio synth: theme layers, motif, SFX
  render/        Three.js only lives here: scene build, instanced
                 horde, rigid-part characters, camera boom, HUD is DOM
  Lastwatch.tsx  Shell: pointer lock, fullscreen promotion, HUD,
                 ledger UI, pause/mute, auto-pause on hide
scripts/harness/lastwatch.mjs   node 24, imports engine.ts directly
db/seed-lastwatch.sql           10 achievements + games row UPDATE
db/publish-lastwatch.sql        status flip, file only, Jeff-gated
```

Sim facts that matter for determinism: yaw and pitch are per-tick
inputs, so bots aim exactly like humans. The camera boom, spring, and
wall clip live in the render layer and never touch sim state. All
pathfinding is A* over the ~40-node waypoint graph in `keep.ts` plus
local steering, fully seeded. A same-seed, same-input run reproduces
its event log hash exactly.

Cabinet contract: Track A, lazy in `src/games/registry.ts`,
`ArcadeGameProps`, one score submission, seeded score cap, pause `P`,
mute `M`, auto-pause on hide, restart by GamePlayer remount, teaser
`games` row gets an UPDATE not an INSERT, key art to
`public/assets/games/lastwatch.png`, `keyboard only` tag in the seed
row. `src/data/launch-lineup.ts` gets checked before any entry is
added.

## 18. Harness proof list (phase 2 gate)

`node scripts/harness/lastwatch.mjs`, exit 0 = PASS, printing measured
populations for every calibrated threshold:

1. **Determinism.** Same seed and input script twice, identical event
   log hash.
2. **Ace duo.** Ace player bot plus partner reach wave 15+.
3. **Casual bot.** Slow aim, 300 ms reactions, panic melee, no
   purchases: survives ≥ 90 s with points, on each of the three
   classes.
4. **Do-nothing loss.** Both characters idle: the horde breaches,
   takes the Watchfire, run ends cleanly with a valid score.
5. **Kit numbers.** Knight heavy hits 4 staged targets, mend restores
   exactly its stated HP, dagger beats bow inside 2 m in staged
   duels, taunt retargets everything in radius.
6. **Partner behaviors.** The four staged tests from section 11.
7. **Economy arithmetic.** Earn and spend over a scripted run match
   the tables to the point.
8. **Flood cap.** A forced max-spawn deep-wave flood never pushes
   score past the seeded cap.
9. **Calibration prints.** Sloppy-play ceiling and skilled floor for
   `watch-legend`, real earn curves for the ledger prices, wave
   duration distributions.

## 19. Open item for Jeff

One decision is yours before phase 2 starts: the name (section 1
recommends keeping Lastwatch). Everything else in this document is
proposed as final, and phase 2 begins on your approval of the GDD as
a whole.
