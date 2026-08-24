// Regression probe for the level-clear vs ghost-touch race.
// Run: pnpm dlx tsx scripts/harness/munch-maze-clear-race.ts
// Reproduces the softlock setup: the player eats the final seed in the
// same frame a non-frightened ghost overlaps them. The frame must end
// in "clear", never "dying".
import { Engine } from "../../src/games/munch-maze/engine";
import { COLS, TILE } from "../../src/games/munch-maze/maze";

const eng = new Engine() as any;
eng.phase = "running";

const p = eng.player;
const tx = Math.floor(p.px / TILE);
const ty = Math.floor(p.py / TILE);
const idx = ty * COLS + tx;

eng.seeds = new Set([idx]);
eng.powers = new Set();

const g = eng.ghosts[0];
g.state = "active";
g.px = p.px;
g.py = p.py;

eng.update(1 / 60);

const events = eng.drainEvents().map((e: { type: string }) => e.type);
const pass = eng.phase === "clear";
console.log(
  JSON.stringify({ phase: eng.phase, seedsLeft: eng.seeds.size, events, pass }, null, 2),
);
if (!pass) {
  console.error("FAIL: ghost touch overwrote the level clear");
  process.exit(1);
}
console.log("PASS: last-seed frame ends in clear with a ghost overlapping");
