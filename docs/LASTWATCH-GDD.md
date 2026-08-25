# Lastwatch: game design document

The complete design for the catalog's 3D flagship: a third-person co-op
horde defense where one player and an AI partner hold a broken hold
through an endless night. This is revision 2, incorporating Jeff's
direction: runs that sustain hours of play, a full arms and resupply
economy, difficulty levels, a horde with real intelligence and
coordination, a multi-district hold instead of one courtyard, and the
deepest achievement set on the site. Jeff approves this document before
any code.

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
| The Ninth Hold | Ties directly to the opening crawl (nine holds, eight dark). Reads like a place on a map. | None found. |
| Emberhold | From the original handoff. Warm, matches the palette. | "Ember-" prefixes are crowded in fantasy naming. |
| The Last Levy | From the original handoff. A levy is a raised militia, which fits the unglamorous tone. | "Levy" reads as a tax to some players. |

Recommendation: keep **Lastwatch**. Slug `lastwatch`. A rename before
phase 2 costs one find-and-replace.

## 2. Story and tone

### The setting, in brief

Nine holds kept the line between the mountains and the sea, each with a
beacon fire on its wall. When a beacon burned, the dark of the hills
kept its distance. One by one the fires went out, and what the hill
country breeds where no light reaches came down: the **Gloam**. Not an
army and not a plague. A tide with teeth, and worse, the tide learns.
The kingdom emptied westward to the sea, and the Lastwatch, the ninth
hold, stayed lit to cover the road. The people it covered are gone now.
The garrison is two. The stores they left behind fill an armory, a well
court, a great hall, and an undercroft, all sealed behind rubble and
barred doors, because a smaller keep is an easier keep to hold. Every
door you open is more to fight with and more to defend.

Tone rules, from the handoff: worn, warm, defiant, never grimdark.
The characters joke because the alternative is worse. Nobody prays,
nobody despairs, nobody monologues. Original mythology only, secular
language only. Dawn never comes because the run is the night, and the
score is what the night cost the Gloam.

### Opening crawl

Shown over a slow pan of the dark hold before the first run, skippable
with any key:

> Nine holds kept the line between the mountains and the sea.
> Eight are dark.
>
> The kingdom you swore to is behind you now, and it is quiet.
> What comes out of the hills is not. It hunts in packs. It
> learns your habits. It sends thieves for your stores.
>
> This is the Lastwatch. One fire, four sealed doors, and
> whoever is left to hold them. Every door you open buys you
> steel and costs you a wall.
>
> Nobody is coming. That is not despair. That is the job.
>
> Light the Watchfire. Bar the arch. Count what you take from them.
>
> The watch holds as long as you do.

### Companion banter

The partner speaks in short text barks above its HUD chip, paired with
a soft synth chirp, never a synthesized voice. Barks come from
per-situation pools picked by the seeded RNG. Sample lines, one per
pool:

| Situation | Line |
|---|---|
| Run start | "Fire's lit. Boots on. Same as every night." |
| Wave clear | "Still standing. I'd call that a good trade." |
| New enemy type debuts | "New shape in the dark. Watch how it moves before you commit." |
| Alpha pack splitting | "The pack is splitting. Alpha's driving them. Left side!" |
| Hexer spawns | "The thin one at the back. It's stitching them stronger. Kill it first." |
| Filcher raiding | "Thief in the stores! It'll run for the wall!" |
| Sapper rumble | "Floor's drumming. Something's digging under us." |
| Mauler telegraph near player | "Big one winding up. Step wide!" |
| Barricade under 30% | "The arch won't hold much longer. Buy timber or buy trouble." |
| Player downed | "No. Not tonight. I'm coming." |
| Revive complete | "On your feet. The fire's still lit." |
| Partner retreating | "Falling back to the fire. Hold the line, I'll be back." |
| Intermission | "Spend it. The dead don't keep ledgers." |
| District opened | "More ground, more doors. Hope the steel's worth it." |
| Boss down | "Down! Mark the wall. That one's ours." |
| Deep waves (20+) | "I stopped counting waves. I count them." |

Full pools (6 to 10 lines each) are written in phase 2 as data in
`banter.ts`. All of it obeys the tone rules.

## 3. The hold

Not one courtyard. The Lastwatch is a full hold of five districts, four
of them sealed at run start and opened by choice. Opening a district
costs valor and a 4 second channel at its rubble wall, grants its
stations and stores, and activates its own outer breach. More to fight
with, more to defend. All distances are engine units, 1 unit = 1 meter.

### Top-down layout

```
                          N  (dark treeline, spawn ground)
                       |    CAUSEWAY     |     lane A (wave 1)
                       |    8 m x 20 m   |
     ==========================================================
     |  RAMPART (3 m up)   [ARCH 4 m]        RAMPART          |
     |  w.stair \                              / e.stair      |
     ~ SAP                                                    |
     ~ 5 m ramp           G A T E Y A R D                     |
     ~ (opens W4)          36 m x 26 m            POSTERN     ~
     |  lane B                                 2 m (opens W7) ~
     |                 (( WATCHFIRE ))              lane C    ~
     |                  ledger table                          |
     |----rubble-----+------------------+-------barred-------|
     |   ARMORY      |                  |     WELL COURT      |
     ~ arm.breach    |                  |   the well  (W12:   ~
     ~ (when open)   |                  |   well tunnel)      ~
     |  18 m x 14 m  |                  |     18 m x 14 m     |
     |  racks, stand |                  |   herb bed, water   |
     |---------------+---barred doors---+--------------------|
     |               G R E A T   H A L L                      |
     ~ hall windows       30 m x 16 m        hearth, tables   ~
     |            stair down to the UNDERCROFT                |
     |     24 m x 12 m: caches, armor stands, THE TUNNEL      |
     ==========================================================
                     south face (sealed rubble)
```

Legend: `=` standing wall, `~` breach or future breach, `(( ))` the
keep's heart.

### Districts

| District | Cost to open | What you gain | What you risk |
|---|---|---|---|
| **Gateyard** (start) | Open | The Watchfire (1,000 HP, run ends if it falls), the arch and its barricade, the ramparts, the Watch Ledger | Lanes A, B (wave 4), C (wave 7) |
| **Armory** (west) | 250 valor | Weapon racks (3 slots, seeded stock, restock every 5 waves), the whetstone (+10% damage next wave, 75 valor) | The armory breach opens in its outer wall |
| **Well Court** (east) | 250 valor | The well (bandage restock, 2 free per intermission), the herb bed (poultice: +2 HP/s regen for one wave, 60 valor) | From wave 12 the Gloam climb out of the well itself |
| **Great Hall** (south) | 400 valor | The hearth (meal: +20 max HP for 3 waves, 100 valor), 20% barricade discount while it stands, access to the Undercroft | Tall hall windows become a wide breach lane |
| **Undercroft** (below the Hall) | 300 valor, needs the Hall | Supply caches (free seeded salvage every 5 waves: arrows, bandages, sometimes a weapon), armor stands (buy armor tiers) | Sappers can breach the tunnel from wave 10, letting the horde up into the Hall from below |

High ground and chokes stay class-relevant: the rampart covers the full
causeway for ranged classes and Stalkers contest it, the arch and the
hall doorways are knight chokes, the Sap's width belongs to mage burn
fields, and the Undercroft's tight corners are dagger country.

No jump button. Movement is ground plus stairs by design, which keeps
navigation deterministic and the horde honest.

## 4. Core loop and run structure

1. **Choose the watch.** Pick a difficulty (section 6), pick a class,
   pick the partner's class from the remaining two.
2. **The night begins.** Short horn, wave 1 trickles down the causeway.
3. **Wave.** Kill every Gloam. Valor accrues to a shared party pool.
   Mid-wave, stations stay live: a run to the armory racks or the well
   during a wave is legal and dangerous, which is the point.
4. **The quiet.** On the last kill, all music cuts to embers for 4
   seconds. Nothing spawns. This pause is scripted and inviolable.
5. **Intermission.** The horn answers from the hills. The **Watch
   Ledger** opens (auto, or `B`). Base 25 seconds plus 5 per open
   district, cap 45. Spend, repair, restock, open districts. Press `E`
   at the Watchfire to sound the early horn (+25 valor).
6. **Escalation.** Waves grow on a budget curve, new Gloam types debut
   on schedule, scheduled breaches open (Sap wave 4, postern wave 7,
   well tunnel wave 12), milestone bosses arrive every 5 waves, and
   caches restock after each boss falls.
7. **Run end.** Both characters down at once, or the Watchfire falls.
   One score submission, then the run-over panel with the death recap
   and stats.

Session length target: a skilled Long Watch run reaches wave 25 to 35
in 90 to 150 minutes **(cal)**. Pause is unlimited. There is no mid-run
save: the platform's save protocol is deferred site-wide, so a run is
one sitting, and the design owns that honestly.

Downed state: at 0 HP a character falls, crawls at 1.0 m/s, and bleeds
out in 30 seconds. An ally revives with a 3 second channel within
1.5 m. Revived characters return at 40% HP with 3 seconds of immunity.

## 5. Controls

Keyboard and mouse only, `keyboard only` tag in the seed row. Pointer
lock in fullscreen, and the cabinet promotes fullscreen on start.

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look and aim (yaw and pitch are sim inputs) |
| Shift | Sprint, 1.35x speed, cannot attack while sprinting |
| LMB | Primary: swing / shoot (hold to charge) / bolt (hold for beam) |
| RMB | Secondary: block-brace / dagger backstep / heal |
| Q | Class skill: taunt / caltrop trap / burn field |
| Tab | Archer only: cycle arrow type (broadhead, bodkin, ember) |
| G | Use a bandage (30 HP over a 3 s channel, max carry 3) |
| E | Interact: revive, stations, open districts, early horn |
| F (hold) | Partner command wheel |
| B | Watch Ledger (intermission only) |
| P / Escape | Pause (releases pointer lock) |
| M | Mute (house standard) |

Auto-pause on tab hide, restart via GamePlayer remount, one score
submission per run: the standard cabinet contract.

### Local second player (stretch goal, honest note)

The sim treats the partner as a controller on a character, so a second
human is structurally possible (documented layout: IJKL move, U/O turn,
numpad 1/2/3 act). The blocker is rendering: a second 1080p viewport
does not fit the integrated-graphics frame budget. Ships as an AI
partner, split view stays a post-launch experiment, blocks nothing.

## 6. Difficulty levels

Three watches. Difficulty scales resources and enemy pressure in
opposite directions, which is Jeff's mandate: easier watches give you
more, harder watches give you less and make the horde think faster.

| | Ember Watch | Long Watch | Forlorn Watch |
|---|---|---|---|
| Pitch | "Learn the hold" | The intended game | "The hills know you now" |
| Valor earned | x1.5 | x1.0 | x0.8 |
| Drop rates | x1.5 | x1.0 | x0.6 |
| Cache restock | Every 4 waves | Every 5 | Every 6 |
| Ledger prices | x0.9 | x1.0 | x1.15 |
| Enemy HP | x0.8 | x1.0 | x1.15 |
| Enemy damage | x0.75 | x1.0 | x1.25 |
| Horde intelligence | As listed | As listed | Select types gain a tier, coordination debuts 2 waves earlier |
| Score multiplier | x0.75 | x1.0 | x1.35 |

One leaderboard, so score multipliers keep the board honest across
difficulties. The run-over panel and the stats payload both name the
difficulty. `watch-legend` and `the-long-count` require Long Watch or
Forlorn Watch.

Casual floor per difficulty, all harness-gated **(cal)**: the casual
bot survives at least 120 s on Ember, at least 90 s on Long (the
quality-bar floor), and at least 45 s on Forlorn, on all three classes.

## 7. Classes

Base stats and the class kit. Weapons and armor layer on top (section
8). Starting weapons are worn quality: the run starts poor on purpose.

| Stat | Knight | Archer | Mage |
|---|---|---|---|
| Max HP | 220 | 130 | 110 |
| Base armor | 40% | 0% | 0% |
| Move speed | 4.8 m/s | 5.6 m/s | 5.0 m/s |
| Resource | Guard 100 | Quiver 36 | Mana 100, regen 6/s (1 s delay after casting) |

### Knight: the wall

Skill statement: spacing and crowd shaping. The knight decides where
the fight happens.

| Tool | Numbers |
|---|---|
| Light / heavy attack | Per equipped weapon (section 8). Heavies stagger everything they hit and shatter Breacher shields |
| Block (RMB hold) | Frontal 120°, absorbs 70% of incoming damage, drains guard equal to raw damage, regen 15/s while not blocking, guard break staggers 1.2 s |
| Brace (block while still) | No knockback from any hit, including Mauler slams |
| Taunt (Q) | 12 s cooldown, every Gloam within 8 m retargets the knight for 4 s |
| Passive | +2 HP per melee kill |

### Archer: the tempo

Skill statement: kiting and priority targets. The archer decides what
dies first.

| Tool | Numbers |
|---|---|
| Bow | Per equipped bow (section 8). Headshots deal 2x, head hitbox is the top 20% of the capsule, resolved in the sim |
| Arrow types (Tab) | Broadhead: baseline. Bodkin: ignores shields and armor reduction, 0.8x vs unarmored. Ember: +burn 4 dmg/s for 3 s on hit |
| Dagger backstep (RMB) | 20 dmg, 100° arc, 1.8 m, then a 2.5 m backward hop, 1.2 s cooldown |
| Caltrop trap (Q) | 2 charges, restock between waves. 2 m radius, slows 50% for 3 s. Upgrade line adds barbs and a third charge |

### Mage: artillery with a lifeline

Skill statement: resource triage. Every point of mana is damage or
healing, never both.

| Tool | Numbers |
|---|---|
| Focus | Bolt and beam per equipped focus (section 8) |
| Mend (RMB) | Heals the aimed ally for the focus's heal value, 12 m range. Aimed at nobody, self-heals at 70% strength for the same mana |
| Burn field (Q) | 35 mana, 10 s cooldown. 3 m ground ring, 12 dmg/s for 6 s |

## 8. Arms, armor, and supply

The variety mandate lives here. Weapons come from the armory racks
(purchase), from boss weapon caches (choice of two, quality scales with
wave), and from Undercroft caches (rare). Every weapon rolls a quality
tier when it appears: worn x0.85, standard x1.0, fine x1.15,
masterwork x1.3 on all damage numbers. Buying a new weapon returns 40%
of the old one's value.

### Knight weapons (light dmg / heavy dmg, arc, reach, cycle)

| Weapon | Numbers | Character |
|---|---|---|
| Worn sword (start) | 18/38, 100°, 2.4 m, 0.50 s | The sword that survived the retreat |
| Arming sword | 24/50, 110°, 2.6 m, 0.50 s | Balanced |
| War axe | 30/62, 85°, 2.2 m, 0.55 s | 1.5x vs armor: Ironbacks, Breacher shields, Coalhide plate |
| Maul | 34/75, 70°, 2.4 m, 0.80 s | Light hits stagger, heavy hits knock back 3 m |
| Halberd | 26/54, 60°, 3.6 m, 0.65 s | Reach: fights through the arch choke without stepping into it |

### Archer bows

| Bow | Numbers | Character |
|---|---|---|
| Worn shortbow (start) | Tap 14, charged 36, 0.8 s charge | Fast and thin |
| Longbow | Tap 18, charged 48, 0.9 s charge | Balanced |
| Warbow | Tap 24, charged 66, 1.2 s charge, pierces 2 bodies | Siege on a string |
| Crossbow | 52 flat, no charge, 1.6 s reload | Point and commit |
| Repeater | 11 per bolt, 0.25 s cycle, no charge | Ammo into suppression |

### Mage foci

| Focus | Numbers | Character |
|---|---|---|
| Ash wand (start) | Bolt 16 for 6 mana, beam 28/s at 14 mana/s, mend 30 for 25 | Thin but honest |
| Oak staff | Bolt 22 for 8, beam 40/s at 18/s, mend 35 for 25 | Balanced |
| Kiln staff | Bolt 30 for 12, beam 55/s at 24/s, mend 30 for 28 | Artillery, thirsty |
| Hearth staff | Bolt 18 for 8, beam 32/s at 16/s, mend 50 for 22 | The lifeline skew |
| Cinder rod | Bolt 9 for 3 at 0.25 s cycle, no beam, mend 30 for 25 | A rain of sparks |

### Armor

One armor slot per character, from the Undercroft armor stands, boss
caches, or rare Filcher recoveries. Reduction stacks multiplicatively
with the knight's base 40% (total = 1 - (1-base) x (1-armor)).

| Armor | Reduction | Who can wear it | Price |
|---|---|---|---|
| Padded coat | 5% | All | 120 |
| Jack of plates | 10% | All | 250 |
| Mail shirt | 15% | Archer, knight | 450 |
| Plate scraps | 22% | Knight | 700 |

### Health and consumables

| Item | Effect | Sources |
|---|---|---|
| Bandage (G) | 30 HP over a 3 s channel, carry 3 | Well (2 free per intermission), caches, Mauler satchels, ledger (35 valor) |
| Poultice | +2 HP/s regen for one wave | Herb bed, 60 valor |
| Hearth meal | +20 max HP for 3 waves | The hearth, 100 valor |
| Whetstone pass | +10% weapon damage next wave | Armory, 75 valor |
| Arrows | Quiver refill 40 valor, bundles drop from Gnashers (10%) | Ledger, racks, caches |

### Drops from kills

Seeded loot table, drop rates scaled by difficulty:

| Source | Drop |
|---|---|
| Gnasher | 10%: 6-arrow bundle |
| Mauler | 35%: salvage satchel (25 valor, 50% a bandage) |
| Broodmother | 50%: salvage satchel |
| Filcher | Always: whatever it stole, plus 40 valor |
| Any boss | Weapon cache: choice of two seeded weapons, quality scaling with wave, plus full bandages |

## 9. Shared systems

- **Damage model.** Flat numbers, reductions as percentages, no crits
  except headshots. Every hit the player takes prints its source to
  the death-recap buffer.
- **Death recap.** The run-over panel names the killer, the place, and
  the wave: "Brought down by a Mauler slam in the Great Hall, wave 14."
- **Structures.** Barricades (arch pre-installed, slots at the Sap,
  postern, armory breach, and hall windows), the Watchfire, and the
  district rubble walls. A separate structure-damage stat lets
  Breachers threaten walls without shredding players.
- **Friendly fire.** None, including burn fields.
- **Knockback.** Mauler slams and boss hits push 4 m unless braced.
  Nothing pushes a player through geometry, and nothing in the hold is
  a pit. Position loss is the cost, not instant death.

## 10. The Gloam

Charcoal-umber hide, ember-mustard eyes, warm accents only. Twelve
regular types plus four milestone bosses. Every type has one
silhouette, one behavior, and at least one counter per class. Base
numbers at debut, on Long Watch. Scaling in section 11.

### Intelligence tiers

The variety mandate is not just bodies, it is brains. Every type
carries a tier, implemented as how much state its decision logic reads:

- **Feral**: reads nothing but its target. Runs its script.
- **Cunning**: reads the player. Aim direction, attack commitment,
  isolation, low health.
- **Tactical**: reads the game. Structure HP, district ownership,
  defender positions, cache contents.

On Forlorn Watch, Gnashers near an Alpha and Breachers become cunning,
and coordination behaviors debut 2 waves earlier.

### The roster

| Type | Tier | Role | HP | Speed | Attack | Valor | Debut |
|---|---|---|---|---|---|---|---|
| **Gnasher** | Feral | The tide | 30 | 6.5 | Bite 8, 0.9 s cycle, structure dmg 4 | 10 | W1 |
| **Lobber** | Feral | Artillery | 45 | 4.2 | Stops at 10 to 14 m, lobbed glob 18 plus a rimmed burn puddle 6/s for 3 s | 20 | W2 |
| **Alpha** | Cunning | Pack leader | 120 | 6.0 | Bite 14. Leads up to 8 Gnashers as a pack (below) | 35 | W3 |
| **Breacher** | Feral | Shieldbreaker, escort | 90 | 3.5 | Plank shield blocks frontal ranged. 60 vs structures, 12 vs players. Walks as cover for Lobbers | 25 | W4 |
| **Shrike** | Cunning | Skirmisher | 55 | 6.8 | Slash 12. Feints, sidesteps when aimed at, commits only while the player attacks, charges, or reloads | 30 | W6 |
| **Mauler** | Feral | Brute | 320 | 3.8 | Slam 35, 1.2 s telegraph, 3 m frontal, 4 m knockback | 60 | W7 |
| **Ironback** | Feral | Armored tide | 55 | 5.5 | Bite 10. Frontal armor takes 0.25x: flank it, heavy it, or bodkin it | 20 | W8 |
| **Hexer** | Tactical | Support | 40 | 4.0 | Visible amber tether: +30% pack speed, or an 80 HP shield it prefers to put on Maulers | 30 | W9 |
| **Stalker** | Cunning | Opportunist | 60 | 6.0 | Climbs walls and the rampart face. Pounce 14, only onto targets that are engaged or isolated | 25 | W11 |
| **Filcher** | Cunning | Thief | 45 | 7.2 | Raids the richest cache or the ledger pool (steals up to 60 valor), then flees for the nearest breach. Kill it to recover everything plus 40 | 40 | W11 |
| **Sapper** | Tactical | Tunneler | 110 | 3.2 | Burrows under the wall of the district with the fewest defenders. Rumble and dust telegraph for 6 s, then a temporary interior breach for 20 s | 35 | W12 |
| **Broodmother** | Feral | Carrier | 260 | 3.0 | Releases 2 skitterlings every 8 s, 6 more on death (10 HP, speed 7, bite 4). Pop it at range or regret it in melee | 45 | W13 |

### Coordination behaviors (engine-level, harness-testable)

These are the "work together" mandate, written as sim rules:

- **Pack pincer.** An Alpha claims nearby Gnashers into a pack and
  splits it: one group presses the player's front, the second circles
  through the next lane over. Killing the Alpha breaks the pack into a
  5 second feral scatter. The partner calls the split.
- **Shield escort.** Lobbers seek the nearest Breacher and fire from
  behind its shield. Breachers slow down to keep their Lobbers covered.
- **Hexer doctrine.** Shield a Mauler first, speed a pack second. A
  shielded Mauler charges harder.
- **Opportunism.** Stalkers hold position on walls until their target
  is mid-fight or alone. Shrikes never trade fair: they punish
  commitment.
- **Blood scent.** When any structure drops below 50%, Gloam within
  15 m converge on it.
- **The raid.** Filchers path to the richest unguarded store. Sappers
  dig where the defenders are not. Both read the players' positions,
  which makes standing still a decision.

### Milestone bosses

A named wave every 5 waves. Bosses arrive with a reduced escort, carry
a boss bar, drop a weapon cache, and award 250 valor.

| Wave | Boss | Behavior |
|---|---|---|
| 5, "Cracktusk" | Tusked Mauler alpha, 900 HP | Charges in a straight, readable line, 1.8 s telegraph. Hitting a wall stuns it 2 s. The puzzle is baiting the charge |
| 10, "The Shepherd" | Hooded Hexer lord, 700 HP | Never approaches. Raises 3 Gnashers every 10 s and tethers speed to the whole pack until killed. A hunt through the horde |
| 15, "Coalhide" | Armored Mauler, 2,200 HP | 70% reduction except three glowing seams (back, both flanks) at 2x. The party makes flanks or bleeds out on attrition |
| 20, "The Packlord" | Giant Alpha, 3,000 HP | Commands two full pincer packs at once. Telegraphed howl: all living Gloam +30% speed for 3 s. Killing it scatters everything alive |
| 25+ | The cycle repeats | Each repeat: +35% HP and a modifier (second repeat pairs bosses, third adds +50% escort budget) |

Milestone waves past 20 draw names from a seeded word table
("Deepnight", "The Ash Count", "Ninth Bell") so deep runs keep their
event feel.

## 11. Waves

### Schedule

Budget buys composition from the point costs below. Trickle interval is
spawn pacing at wave start, tightening within the wave.

| Wave | Budget | Trickle | New | Events |
|---|---|---|---|---|
| 1 | 65 | 7.0 s | Gnasher | 6 Gnashers. The tutorial by fire |
| 2 | 95 | 6.0 s | Lobber | |
| 3 | 130 | 5.2 s | Alpha | First pack pincer. Iron Watch bonus eligible |
| 4 | 175 | 4.6 s | Breacher | The Sap collapses |
| 5 | 225 | 4.2 s | Boss | **Cracktusk**. Caches restock after every boss |
| 6 | 280 | 3.8 s | Shrike | |
| 7 | 345 | 3.4 s | Mauler | Postern splinters open |
| 8 | 420 | 3.0 s | Ironback | Tier 3 barricades unlock |
| 9 | 495 | 2.7 s | Hexer | |
| 10 | 580 | 2.4 s | Boss | **The Shepherd** |
| 11 | 670 | 2.2 s | Stalker, Filcher | The hold starts losing things |
| 12 | 770 | 2.1 s | Sapper | The well tunnel opens |
| 13 | 875 | 2.0 s | Broodmother | Full roster fielded |
| 14 | 985 | 1.9 s | | |
| 15 | 1,105 | 1.8 s | Boss | **Coalhide** |
| 16 to 19 | 1,230 / 1,365 / 1,500 / 1,650 | ramp | | |
| 20 | 1,800 | 1.5 s | Boss | **The Packlord** |
| 21+ | previous x1.12 | 1.2 s floor | | Endless, boss cycle every 5 |

Formula behind the table: budget(N) = 40 + 20N + 3.4N², rounded to 5,
then x1.12 per wave past 20.

### Composition

Percent of budget by band, remainder into Gnashers. Groups: tide
(Gnasher, Alpha, Ironback), artillery (Lobber), siege (Breacher,
Mauler, Sapper), support (Hexer), hunters (Shrike, Stalker, Filcher,
Broodmother).

| Waves | Tide | Artillery | Siege | Support | Hunters |
|---|---|---|---|---|---|
| 1 to 3 | 80 to 100% | 0 to 20% | | | |
| 4 to 6 | 55% | 20% | 15% | | 10% |
| 7 to 10 | 45% | 15% | 20% | 10% | 10% |
| 11 to 13 | 40% | 10% | 20% | 10% | 20% |
| 14+ | 35% | 10% | 20% | 10% | 25% |

Budget point costs: Gnasher 10, Lobber 25, Alpha 30, Breacher 30,
Shrike 35, Mauler 80, Ironback 18, Hexer 35, Stalker 30, Filcher 30,
Sapper 45, Broodmother 60. Bosses spawn outside the budget.

### Endless scaling

- HP: x(1 + 0.05 x max(0, N - 8)), uncapped. The wall the run breaks on.
- Speed: x(1 + 0.01 x max(0, N - 10)), capped at 1.15 for legibility.
- Damage: x(1 + 0.03 x max(0, N - 10)), uncapped.
- Concurrency: at most 40 Gloam alive at once, held by the spawner,
  finalized by frame-time measurement on the dev machine **(cal)**.

## 12. Economy

Valor is a shared party pool. Both characters earn into it, the player
spends it. Partner gear and upgrades cost 80% of player prices.

### Earning

| Source | Valor |
|---|---|
| Kills | Per the roster table (10 to 60), bosses 250 |
| Headshot kill bonus | +5 |
| Wave clear | 50 + 10 x wave |
| Iron Watch (no player damage, wave 3+) | +100 |
| Early horn | +25 |
| Revive an ally | +25 |
| Filcher recovery | Everything it stole, +40 |

### Spending

The Watch Ledger (intermission menu) covers repairs, upgrades, and
consumables. Diegetic stations (racks, stands, well, hearth, herb bed,
whetstone) work any time you can physically reach them, including
mid-wave.

| Item | Price | Notes |
|---|---|---|
| Open a district | 250 / 250 / 400 / 300 | Armory, Well Court, Great Hall, Undercroft (needs Hall) |
| Repair a barricade | 30 per 100 HP | 20% off while the Great Hall stands |
| Install a barricade slot | 150 | Tier 1 timber, 300 HP |
| Barricade tier 2 / tier 3 (W8+) | 250 / 600 | 600 / 1,000 HP |
| Stoke the Watchfire | 40 per 100 HP | |
| Weapons | 200 / 350 / 550 by tier, quality premium +25% fine, +60% masterwork | Racks and boss caches |
| Armor | 120 to 700 | Section 8 table |
| Consumables | Bandage 35, poultice 60, meal 100, whetstone 75, quiver 40 | |
| Second Wind | 800, price doubles each purchase | Self-revive where you fell |

### Class upgrade lines, three tiers each

Prices 150 / 350 / 700 unless noted. These upgrade the class kit.
Weapons are gear and separate.

| Class | Line | T1 | T2 | T3 |
|---|---|---|---|---|
| Knight | Plate | armor 45% | 50% | 55% |
| Knight | Guard (120/280/550) | guard 140 | 180, regen 18/s | 220, regen 21/s |
| Knight | Fervor (150/350/700) | taunt radius 10 m | cooldown 9 s | +4 HP per melee kill |
| Archer | Draw | charge x0.85 | x0.7 | x0.55 |
| Archer | Quiver (100/250/500) | 48 arrows | 64 | 80 |
| Archer | Traps (120/300/600) | +barbs 10 dmg/s | 3 charges | slow 65% |
| Mage | Attunement | mana 125, regen 7/s | 150, 8/s | 175, 9/s |
| Mage | Focus arts | +15% bolt and beam | +30% | +45% |
| Mage | Mending (120/280/550) | +10 heal | +20 | cost -5 mana |

Economy sanity: wave 1 pays about 125 valor, waves 1 to 3 about 450
cumulative, so the first district or first tier lands around wave 3.
An ace duo at wave 15 has earned roughly 6,000 and holds two districts,
a second-tier weapon, and armor. The harness prints real earn curves
and every price recalibrates against them **(cal)**.

## 13. The partner

A full class character driven by engine logic: same kits, weapons,
armor, and rules as a player. Everything below is harness-testable.

### Decision loop

Utility scoring every 0.5 s of engine time, deterministic. Highest
score wins:

| Priority | Action | Trigger and behavior |
|---|---|---|
| 1 | Revive | Ally downed. Path to them, clear a 3 m bubble, channel. Only its own survival (HP under 15%) preempts |
| 2 | Survive | Own HP under 30%. Disengage toward the Watchfire, bandage or self-mend once clear |
| 3 | Heal (mage) | Ally under 60% HP and mana over 40 |
| 4 | Counter-raid | A Filcher is raiding or a Sapper is digging in an undefended district and the player is not responding |
| 5 | Execute command | The active command wheel order |
| 6 | Priority target | Hexer, then Alpha, then Lobber, then Breacher on a barricade, then nearest threat to the weaker character |
| 7 | Hold ground | Default: anchor at the hottest choke and fight |

### Command wheel (hold F)

Commands bias the scores, they do not lobotomize the loop. A partner
ordered to the arch still revives you.

| Command | Effect |
|---|---|
| Defend the arch | Anchor within 6 m of the arch |
| Hold this ground | Anchor where the partner stands now, district-aware |
| Follow | Stay within 8 m of the player |
| Regroup | Fall back to the Watchfire ring |

### Competence knobs

The partner supports, it never carries. Reaction delay 300 ms, aim
error 3° standard deviation, target switch cost 0.4 s, effective DPS
about 70% of the ace bot **(cal)**. No collision with the player's
capsule, so it can never pin you in a doorway.

### Target calling

The partner is the legibility system's voice. It barks on: type debuts,
pack splits, Hexer spawns, Filcher raids, Sapper rumbles, Stalkers
overhead, barricades under 30%, player HP under 35%, and its own
retreats. Each bark maps to one sim event the harness can assert.

### Harness-provable behaviors (phase 2 contract)

- Staged ally-down: reach and complete the revive within 12 s against
  wave-3 pressure.
- Staged HP 25%: disengage to 8 m from the nearest Gloam within 5 s.
- Command compliance: each wheel order moves the anchor within 3 s.
- Mage triage: ally at 50% and full mana, healing precedes damage.
- Counter-raid: a staged Filcher raid with an idle player draws the
  partner within 4 s.

## 14. Scoring and achievements

### Score

| Source | Points |
|---|---|
| Gnasher / Lobber / Alpha / Breacher / Shrike / Mauler | 20 / 45 / 90 / 55 / 75 / 130 |
| Ironback / Hexer / Stalker / Filcher / Sapper / Broodmother / skitterling | 45 / 70 / 60 / 100 / 85 / 110 / 5 |
| Headshot kill | +50% of that kill |
| Boss | 600, the Packlord 900 |
| Wave clear | 100 + 25 x wave |
| Iron Watch wave | 250 |
| Revive | 50 |
| Difficulty multiplier | x0.75 / x1.0 / x1.35 |

One `onScore` submission at run end with stats: `{ difficulty, wave,
kills, headshots, damage_dealt, damage_blocked, hp_healed, revives,
valor_spent, valor_recovered, districts_opened, class,
partner_class }`. Score cap seeded at 5,000,000 **(cal against the
forced-flood harness ceiling)**.

### Achievements

Twelve, the platform maximum per spec section 6, seeded in
`db/seed-lastwatch.sql`, slugs fired by the engine and matching the
seed rows exactly. Depth over count: most cabinets ship progress
markers, these are earned play. Class achievements require playing the
class. The last two require Long Watch or Forlorn Watch.

| Slug | Name | Hint | Trigger |
|---|---|---|---|
| `first-night` | First Night | Hold the watch through wave 3 | Clear wave 3 |
| `the-full-hold` | The Full Hold | Every door open, every wall yours | All four districts opened in one run |
| `hold-the-arch` | Hold the Arch | The timber remembers | Reach wave 8 with the arch barricade never destroyed |
| `shoulder-to-shoulder` | Shoulder to Shoulder | Nobody bleeds out on your watch | 3 revives in one run |
| `pack-breaker` | Pack-Breaker | Cut the head off and the body panics | Kill an Alpha, then wipe its scattered pack within 8 s |
| `no-thieves-tonight` | No Thieves Tonight | It leaves with nothing | Kill a Filcher before it escapes with stolen goods |
| `well-armed` | Well Armed | The armory remembers its craft | Wield a masterwork weapon |
| `crowd-breaker` | Crowd-Breaker | Six with one swing | Knight: one heavy attack hits 6+ Gloam |
| `keen-eye` | Keen Eye | Aim for the ember eyes | Archer: 25 headshot kills in one run |
| `lifeline` | Lifeline | Warm light, well spent | Mage: heal 1,000 HP in one run |
| `the-long-count` | The Long Count | The Packlord knows your name | Reach wave 20 on Long Watch or Forlorn Watch |
| `watch-legend` | Watch Legend | The night will remember this one | Score 600,000 on Long Watch or Forlorn Watch **(cal: set between the measured sloppy ceiling and skilled floor)** |

## 15. Look and palette

The 3D exception is scoped, not open-ended: low-poly flat-shaded
geometry is the level-geometry class, characters and horde are low-poly
meshes, and anything that reads as art (banners, the Shepherd's hood,
key art) is an AI-generated texture. No programmatic 2D art anywhere
else in the cabinet.

Scene palette, all warm, no purple, no blue-dominant light, no neon:

| Element | Color direction |
|---|---|
| Night sky and fog | Ink `#171310`, warm black, never navy |
| Moonlight (the directional light) | Dim warm ivory `#E8DCC0`. The classic blue movie night is banned here |
| Stone | Terracotta `#9C6B4F`, shadow faces `#5E3D2E` |
| Timber and barricades | Umber `#6B4A33` |
| Banners | Olive `#6F6B3F`, AI-generated cloth |
| Torch and Watchfire light | Mustard `#D9A441` emissive |
| The Gloam | Charcoal-umber `#2E2620` hide, ember-mustard eyes and tethers `#D9A441` |
| Burn and ember effects | Terracotta `#C4633F` |

District character within the palette: the Armory reads iron and oil,
the Well Court reads herb-green olive and wet stone, the Great Hall
reads long shadows and dusty banners, the Undercroft reads lamplit
vault. Same tokens, different mixes. Character silhouettes must read at
30 m in torchlight, and each Gloam type must read at 20 m.

**Motion safety (medical, non-negotiable).** No strobing, no rapid
high-contrast flashing, anywhere. Torch flicker is a slow amplitude
wander, damage feedback is a soft warm edge vignette, telegraphs are
poses and ground rings, never flashes. Written into the render layer's
review checklist for phases 3 and 5.

## 16. HUD

Designed at fullscreen scale first, windowed at 90%. Paper-and-ink
styling from the site's design system, JetBrains Mono for numbers.

### In-wave

```
+----------------------------------------------------------------------+
| [fire] WATCHFIRE ########--   ARCH ####--   SAP ##----    WAVE 12    |
|                                                      17 remain       |
|                                              VALOR 1,240  [FORLORN]  |
|                                                                      |
|                            ( reticle )                               |
|                                                                      |
|                                                  "Thief in the       |
|                                                   stores!"           |
| HP ############------   [bandage x2]         [M] MARROW  mage        |
| QUIVER 24  [bodkin]                          HP #####-----           |
| (class resource + ammo type)                 > HOLDING THE ARCH      |
+----------------------------------------------------------------------+
```

- Top left: Watchfire plus a bar per active breach barricade. Bars for
  unopened districts do not exist yet, so the row grows as the hold
  opens: the HUD itself tells the risk story.
- Top right: wave, Gloam remaining, valor, difficulty tag.
- Bottom left: HP, class resource, bandage count, archer's arrow type.
- Bottom right: partner chip with name, class, HP, and state in words
  (HOLDING THE ARCH, COUNTER-RAIDING, DOWNED 0:23), barks above.
- Center: class reticle (dot, charge ring, or mana ring). Hit
  confirmation is a subtle tick, never a flash.
- Damage direction: soft warm vignette on the hit side.

### Command wheel and ledger

The wheel (hold F) is a radial four-slot select, time scaled to 40%
while held, sim-scaled and deterministic, never a pause. The ledger
(intermission) is the same paper panel as revision 1, now with tabs:
Repairs, Districts, Kit, Gear, Partner.

### Run over

Death recap line first, then difficulty, waves held, kills, headshots,
damage dealt and blocked, HP healed, revives, valor spent and
recovered, districts opened. GamePlayer's RUN OVER panel owns restart.

### Attract state

Idle on the game page: slow orbit of the torchlit hold, title card,
"any key" prompt. No sim running.

## 17. Performance budget

Hard wall: 60 fps at 1080p on the dev machine (Ryzen 5, 16 GB,
integrated graphics). If a feature and the frame budget conflict, the
feature loses.

| Budget line | Target |
|---|---|
| Frame total | 16.6 ms: sim ≤ 2.5 ms, render ≤ 10 ms, ≥ 4 ms headroom |
| Draw calls | ≤ 120 per view |
| Triangles | ≤ 150k per view with a full 40-Gloam wave |
| Lights | 1 directional (warm moon) + emissive torch materials, ≤ 2 dynamic points |
| Shadows | None. Blob decals under characters. Zero shadow maps |
| Post-processing | None. Exponential fog only |
| Materials | ≤ 10, Lambert flat-shaded, vertex colors where possible |
| Textures | ≤ 10 files, each ≤ 512², AI-generated only where it reads as art |
| Heap | < 250 MB, no per-frame allocation in the render loop |

Implementation rules that make the numbers reachable with five
districts and twelve horde types:

- **Instanced horde.** One `InstancedMesh` per Gloam type per LOD
  (about 26 horde draw calls at two LODs). No skeletal animation:
  horde motion is per-instance procedural bob, lean, and lunge from an
  instance attribute. Player and partner are rigid-part hierarchies,
  no skinning anywhere.
- **District culling.** Static geometry merges to 1 to 3 draw calls
  per district, and only the occupied district plus its neighbors
  render. The sim always runs the whole hold.
- **LOD.** Near mesh ~800 tris, far ~300, swap at 25 m, despawn beyond
  the treeline.
- **Auto-degrade ladder**, when frame time holds over 14 ms for 3 s:
  render scale 1.0 → 0.85 → 0.75, then fog distance, then LOD
  distance. Never degrades sim correctness.
- **Live frame sampler.** Dev overlay prints average, p95, max. The
  40-Gloam cap, district geometry budgets, and wave sizes all finalize
  from measurements on the dev machine.

Three.js is added at phase 3 start: exact pinned version plus
`@types/three`, release older than 72 hours per the security law,
never `@latest`. The game route lazy-loads, so three.js joins the
cabinet's chunk, not the platform bundle.

## 18. Audio plan

First cabinet with music. Everything synthesized in WebAudio at
runtime, no external audio files, no licensed anything. Buses: music
and SFX into a master gain. `M` mutes, the pause menu holds a music
volume slider. Music sits 6 dB under combat SFX and ducks on the down
sting. The audio context resumes on first input.

### The siege theme, layered by intensity

Intensity I = wave number + active Gloam / 10, recomputed per bar.
Rooted on D, warm and low, never shrill.

| Layer | Enters | Recipe |
|---|---|---|
| L0 embers | Always | Brown noise through a 300 Hz lowpass, slow amplitude wander |
| L1 drone | Wave 1 | Two saws at D1/D2, detuned ±6 cents, 400 Hz lowpass, 8 s swell |
| L2 pulse | Wave 3 | 78 BPM sine thump plus filtered-noise tap, sparse |
| L3 ostinato | Wave 6 | Plucked D-F minor-third pair, occasional G, triangle osc, 2-bar loop |
| L4 pressure | Boss waves | Slow-tremolo warm sine cluster two octaves up, felt more than heard |

### The between-waves motif

"The ledger tune": sparse triangle plucks over the ember layer, a
D-A-C-D phrase at 72 BPM with seeded rests, no percussion. Enters after
the 4 second quiet (embers only, by design) and fades on the horn.

### The horn

Two saws through a formant-shaped filter swell, a minor-third rise D to
F over 1.8 s. The hills answer with a detuned, quieter copy.

### SFX coverage

Everything from revision 1 (footsteps by class weight, full weapon set,
casting, healing, structure damage, downs and revives, wave and
purchase feedback, boss stingers) plus the new systems:

| Event | Recipe sketch |
|---|---|
| Per-weapon melee voices | Shared swing/impact family, pitch and body per weapon (maul low and dull, halberd airy) |
| Crossbow / repeater | Heavy thunk and latch reload / rapid soft thwips |
| Arrow types | Bodkin adds a metallic zip, ember adds a crackle tail |
| Pack howl (Alpha, Packlord) | Pitched noise chorus swell, the audible "they are coordinating" cue |
| Filcher | A jingling scurry, distinct at distance, the audible theft alarm |
| Sapper | Low rhythmic ground thuds, then splintering flagstones |
| Broodmother | Wet bass pulse, skitterlings as high dry ticks |
| District opening | Rubble fall and a resolving chord: reward feel |
| Stations | Rack draw ring, whetstone scrape, well winch, hearth crackle |

All synthesis lives in `audio.ts` behind the same `isMuted()` module
pattern every cabinet uses, driven by the engine's event queue.

## 19. Technical architecture

Same split as every cabinet, scaled up:

```
src/games/lastwatch/
  engine.ts      DOM-free deterministic sim: fixed 60 Hz tick, seeded
                 mulberry32, no Math.random, no Date, event queue,
                 relative imports only
  hold.ts        Arena data: districts, wall segments, waypoint graph,
                 breach schedule, stations, torch and spawn points
  waves.ts       Budget tables, composition bands, scaling, spawner
  kits.ts        Class numbers and upgrade lines
  arsenal.ts     Weapons, armor, consumables, loot tables, prices
                 (the TUNE of this cabinet, every knob unit-commented)
  gloam.ts       Roster stats, intelligence tiers, coordination rules
  partner.ts     Utility scorer, command state, bark triggers
  banter.ts      Bark pools as data
  audio.ts       WebAudio synth: theme layers, motif, SFX
  render/        Three.js only lives here: scene build, instanced
                 horde, rigid-part characters, camera boom. HUD is DOM
  Lastwatch.tsx  Shell: pointer lock, fullscreen promotion, HUD,
                 ledger UI, difficulty select, pause/mute, auto-pause
scripts/harness/lastwatch.mjs   node 24, imports engine.ts directly
db/seed-lastwatch.sql           12 achievements + games row UPDATE
db/publish-lastwatch.sql        status flip, file only, Jeff-gated
```

Sim facts that matter: yaw and pitch are per-tick inputs, so bots aim
exactly like humans. The camera boom and wall clip live in the render
layer and never touch sim state. Pathfinding is A* over the waypoint
graph in `hold.ts` (about 120 nodes across five districts) plus local
steering, fully seeded. Coordination behaviors are deterministic rules
over sim state, no wall-clock anywhere. A same-seed, same-input run
reproduces its event log hash exactly.

Cabinet contract: Track A, lazy in `src/games/registry.ts`,
`ArcadeGameProps`, one score submission, seeded score cap, pause `P`,
mute `M`, auto-pause on hide, restart by GamePlayer remount, teaser
`games` row gets an UPDATE not an INSERT, key art to
`public/assets/games/lastwatch.png`, `keyboard only` tag in the seed
row, `src/data/launch-lineup.ts` checked before any entry is added.

## 20. Harness proof list (phase 2 gate)

`node scripts/harness/lastwatch.mjs`, exit 0 = PASS, printing measured
populations for every calibrated threshold:

1. **Determinism.** Same seed and input script twice, identical event
   log hash, including a run with districts, raids, and a boss cycle.
2. **Ace duo.** Ace player bot plus partner reach wave 20+ on Long
   Watch, opening districts and upgrading gear along the way.
3. **Casual floors.** The casual bot (slow aim, 300 ms reactions,
   panic melee, buys nothing) on all three classes, at all three
   difficulties: ≥ 120 s Ember, ≥ 90 s Long, ≥ 45 s Forlorn.
4. **Do-nothing loss.** Both characters idle: breach, Watchfire down,
   clean run end with a valid score.
5. **Kit and arsenal math.** Every weapon's stated DPS in staged
   duels, bodkin vs Breacher shields and Ironback armor, heavy-cleave
   multi-hit counts, mend values per focus, armor stacking math.
6. **Coordination.** Alpha pincer assigns two groups through two
   lanes, alpha death scatters the pack, Lobbers hold Breacher cover,
   Stalkers refuse unengaged targets, blood scent converges.
7. **Raids.** A Filcher steals, flees by a valid path, and killing it
   recovers the goods. A Sapper digs where defenders are not, and its
   breach opens and closes on schedule.
8. **Partner behaviors.** The five staged tests from section 13.
9. **Economy and difficulty arithmetic.** Earn and spend over a
   scripted run match the tables at each difficulty multiplier.
10. **Districts.** Opening each district activates its stations and
    its breach, and the spawn topology changes deterministically.
11. **Flood cap.** A forced max-spawn deep-wave flood never pushes
    score past the seeded cap.
12. **Long-run soak.** An accelerated ace run to wave 30: stable
    memory, no event-queue growth, wave duration distributions
    printed.
13. **Calibration prints.** Sloppy ceiling and skilled floor for
    `watch-legend` per difficulty, real earn curves against prices,
    session length distributions.

## 21. Scope note and the open item

This revision roughly doubles phase 2 (the sim now carries districts,
twelve enemy behaviors with coordination, the arsenal, and difficulty
scaling) and grows phase 3 (five districts of geometry, more character
meshes). The phases stay uncompressed per the handoff. Estimate: phase
2 becomes two to three sessions, phase 3 two to three sessions, phases
4 and 5 one to two each.

One decision is Jeff's before phase 2 starts: the name (section 1
recommends keeping Lastwatch). Everything else is proposed as final,
and phase 2 begins on approval of this document as a whole.
