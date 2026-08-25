// Partner bark pools. Picked by the seeded RNG so replays stay
// deterministic. Tone contract: worn, warm, defiant, never grimdark.
// Secular language only, original mythology only.

import type { BarkPool } from "./types.ts";

export const BARKS: Record<BarkPool, string[]> = {
  "run-start": [
    "Fire's lit. Boots on. Same as every night.",
    "The hills are loud tonight. Good. Easier to hear them coming.",
    "Watch with me a while.",
  ],
  "wave-clear": [
    "Still standing. I'd call that a good trade.",
    "That's another one the hills won't get back.",
    "Breathe. The dark's catching its own breath too.",
  ],
  "type-debut": [
    "New shape in the dark. Watch how it moves before you commit.",
    "That one's new. Learn it fast.",
  ],
  "pack-split": [
    "The pack is splitting. Alpha's driving them. Watch the flanks!",
    "They're circling. That big one is thinking for all of them.",
  ],
  "hexer-spawn": [
    "The thin one at the back. It's stitching them stronger. Kill it first.",
    "Tether! Cut the thin one down before the rest get quick.",
  ],
  "filcher-raid": [
    "Thief in the stores! It'll run for the wall!",
    "Quick one going for the goods. Don't let it leave!",
  ],
  "sapper-dig": [
    "Floor's drumming. Something's digging under us.",
    "You hear that? Under the flagstones. Find it before it's through.",
  ],
  "stalker-overhead": [
    "On the wall! It's waiting for you to look away.",
    "Climber overhead. Keep a friend close.",
  ],
  "mauler-telegraph": [
    "Big one winding up. Step wide!",
    "Slam coming! Move your feet!",
  ],
  "barricade-low": [
    "The arch won't hold much longer. Buy timber or buy trouble.",
    "That barricade is more gap than wood. Patch it.",
  ],
  "player-down": [
    "No. Not tonight. I'm coming.",
    "Stay with me. I'm on my way.",
  ],
  "revive-done": [
    "On your feet. The fire's still lit.",
    "Up. The night's not done with us.",
  ],
  "partner-retreat": [
    "Falling back to the fire. Hold the line, I'll be back.",
    "Too thick here. Regrouping at the fire.",
  ],
  "partner-heal": [
    "Mending. Don't waste it.",
    "Warm light. Keep moving.",
  ],
  intermission: [
    "Spend it. The dead don't keep ledgers.",
    "Count the take, patch the walls. Horn's coming.",
  ],
  "district-open": [
    "More ground, more doors. Hope the steel's worth it.",
    "Opened. Now it's ours to lose.",
  ],
  "boss-down": [
    "Down! Mark the wall. That one's ours.",
    "It fell. The rest saw it fall. Good.",
  ],
  "deep-waves": [
    "I stopped counting waves. I count them.",
    "The night's long. So are we.",
  ],
  "player-low": [
    "You're bleeding through your coat. Bandage or fall back.",
    "Get behind me and wrap that.",
  ],
};
