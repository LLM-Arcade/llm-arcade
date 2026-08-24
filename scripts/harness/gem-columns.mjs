// Gem Columns beatability harness. Run: node scripts/harness/gem-columns.mjs
// Proves, with exit-code semantics a reviewer can rerun:
//   1. a greedy ace bot clears all three levels, reaches victory and the
//      legend score, inside a bounded step budget,
//   2. a stacker bot that only ever shoves left reaches gameover by blocking
//      the spawn column,
//   3. two same-seed ace runs match on score, pieces, gems and steps,
//   4. the match rules hold on hand-built boards: diagonals, overlapping
//      lines counted once, a three-step cascade with the x2 and x4
//      multipliers, spawn blocking, danger-dancer, and the score cap,
//   5. all seven achievement slugs fire,
//   6. the ace still wins on five more seeds.

import {
  COLS,
  EMPTY,
  Engine,
  HIDDEN_ROWS,
  ROWS,
  SPAWN_COL,
  TUNE,
  cellAt,
  chainMultiplier,
  simulateDrop,
  topOccupiedRow,
} from "../../src/games/gem-columns/engine.ts";
import { LEVELS } from "../../src/games/gem-columns/levels.ts";

let failures = 0;
const check = (ok, label) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
  return ok;
};

const DT = 1 / 60;
const STEP_BUDGET = 20 * 60 * 60; // 20 simulated minutes
const allAchievements = new Set();

// ---- bots ----------------------------------------------------------------

const rotate = (gems, times) => {
  const out = gems.slice();
  for (let i = 0; i < times; i++) out.push(out.shift());
  return out;
};

const sameTriad = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

const heights = (grid) => {
  const out = [];
  for (let col = 0; col < COLS; col++) {
    let h = 0;
    for (let row = 0; row < ROWS; row++) {
      if (grid[cellAt(col, row)] !== EMPTY) {
        h = ROWS - row;
        break;
      }
    }
    out.push(h);
  }
  return out;
};

/** Same-family neighbours left standing; a proxy for how close a match is. */
const pairs = (grid) => {
  let total = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const family = grid[cellAt(col, row)];
      if (family === EMPTY) continue;
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        if (grid[cellAt(c, r)] === family) total++;
      }
    }
  }
  return total;
};

/** Greedy placement: every column crossed with every rotation of the triad. */
const plan = (eng) => {
  let best = null;
  for (let rot = 0; rot < 3; rot++) {
    const gems = rotate(eng.piece.gems, rot);
    for (let col = 0; col < COLS; col++) {
      const out = simulateDrop(eng.grid, col, gems);
      if (!out.valid) continue;
      const tall = heights(out.grid);
      let bump = 0;
      for (let i = 0; i < COLS - 1; i++) bump += Math.abs(tall[i] - tall[i + 1]);
      const value =
        out.cleared * 120 +
        (out.chain >= 2 ? 150 : 0) +
        pairs(out.grid) * 6 -
        (ROWS - out.topRow) * 10 -
        bump * 4 -
        (out.topRow <= HIDDEN_ROWS ? 5000 : 0);
      if (!best || value > best.value) best = { value, col, gems };
    }
  }
  return best;
};

const driveAce = (eng, st) => {
  eng.input.dir = 0;
  eng.input.cycle = false;
  eng.input.softDrop = false;
  if (eng.phase !== "falling" || !eng.piece) return;

  if (st.plannedFor !== eng.piecesSpawned) {
    st.plan = plan(eng);
    st.plannedFor = eng.piecesSpawned;
    st.cycleHeld = false;
    st.nudges = 0;
  }
  const want = st.plan;
  if (!want) {
    eng.input.softDrop = true;
    return;
  }
  if (!sameTriad(eng.piece.gems, want.gems)) {
    // One frame down, one frame up: the engine only rotates on the press edge.
    st.cycleHeld = !st.cycleHeld;
    eng.input.cycle = st.cycleHeld;
    return;
  }
  if (eng.piece.col !== want.col && st.nudges < 60) {
    st.nudges++;
    eng.input.dir = want.col < eng.piece.col ? -1 : 1;
    return;
  }
  eng.input.softDrop = true;
};

const driveStacker = (eng) => {
  eng.input.dir = -1;
  eng.input.cycle = false;
  eng.input.softDrop = true;
};

const simulate = (drive, label, seed = TUNE.seed) => {
  const eng = new Engine(seed);
  const st = { plannedFor: -1, plan: null, cycleHeld: false, nudges: 0 };
  const achievements = new Set();
  const rows = [];
  let stats = null;
  let capOk = true;
  let steps = 0;
  let prevScore = 0;
  let prevGems = 0;
  let seenLevels = 0;

  while (eng.phase !== "gameover" && eng.phase !== "victory" && steps < STEP_BUDGET) {
    drive(eng, st);
    eng.update(DT);
    steps++;
    for (const e of eng.drainEvents()) {
      if (e.type === "achievement") {
        achievements.add(e.slug);
        allAchievements.add(e.slug);
      }
      if (e.type === "gameover") stats = e.stats;
    }
    if (eng.score > TUNE.scoreCap) capOk = false;
    if (eng.levelsCleared > seenLevels) {
      rows.push({
        name: LEVELS[seenLevels].name,
        time: eng.time,
        gems: eng.gemsCleared - prevGems,
        points: eng.score - prevScore,
        total: eng.score,
      });
      seenLevels = eng.levelsCleared;
      prevScore = eng.score;
      prevGems = eng.gemsCleared;
    }
  }
  for (const e of eng.drainEvents()) {
    if (e.type === "achievement") {
      achievements.add(e.slug);
      allAchievements.add(e.slug);
    }
    if (e.type === "gameover") stats = e.stats;
  }

  console.log(`\n${label}`);
  console.log("  level                    clock    gems   points    total");
  for (const r of rows) {
    console.log(
      `  ${r.name.padEnd(22)} ${r.time.toFixed(1).padStart(6)}s ${String(r.gems).padStart(7)} ${String(r.points).padStart(8)} ${String(r.total).padStart(8)}`,
    );
  }
  console.log(
    `  outcome: ${eng.phase}  steps ${steps}  pieces ${eng.piecesSpawned}  gems ${eng.gemsCleared}  max chain ${eng.maxChain}  best cascade ${eng.bestCascadeGems}  final score ${eng.score}`,
  );
  console.log(`  achievements: ${[...achievements].sort().join(", ") || "(none)"}`);
  return { eng, achievements, capOk, stats, steps };
};

const ace = simulate(driveAce, "ace bot (greedy placement search)");
check(ace.eng.phase === "victory", "ace clears all three levels and reaches victory");
check(ace.steps < STEP_BUDGET, "ace finishes inside the 20-minute step budget");
check(ace.eng.score >= TUNE.legendScore, `ace scores at least ${TUNE.legendScore}`);
check(ace.capOk, "score never exceeds the cap (ace)");
check(ace.stats !== null, "gameover stats emitted (ace)");
if (ace.stats) {
  check(
    ace.stats.levels_cleared === LEVELS.length &&
      ace.stats.gems_cleared > 0 &&
      ace.stats.max_chain > 0 &&
      ace.stats.best_cascade_gems > 0,
    "gameover stats carry levels_cleared, gems_cleared, max_chain, best_cascade_gems",
  );
}
for (const slug of ["foundry-clear", "conservatory-clear", "archive-clear"]) {
  check(ace.achievements.has(slug), `${slug} fires in the ace run`);
}

const stacker = simulate(driveStacker, "stacker bot (always shove left, never cycles)");
check(stacker.eng.phase === "gameover", "stacker bot reaches gameover");
check(stacker.steps < STEP_BUDGET, "stacker bot dies inside the step budget");
check(stacker.eng.levelsCleared === 0, "stacker bot never clears a level");
check(stacker.stats !== null, "gameover stats emitted (stacker)");

const repeat = simulate(driveAce, "ace bot rerun (same seed)");
check(
  repeat.eng.score === ace.eng.score &&
    repeat.eng.piecesSpawned === ace.eng.piecesSpawned &&
    repeat.eng.gemsCleared === ace.eng.gemsCleared &&
    repeat.steps === ace.steps,
  "two same-seed ace runs match on score, pieces, gems and steps",
);

// ---- rule proofs ---------------------------------------------------------

console.log("\nrule proofs");

const wipe = (eng) => {
  eng.grid.fill(EMPTY);
  eng.piece = null;
  eng.matched = [];
  eng.clearing = [];
  eng.chain = 0;
  eng.cascadeGems = 0;
  eng.dangerAtLock = false;
  eng.danger = false;
  eng.gemsThisLevel = 0;
};

const put = (eng, col, row, family) => {
  eng.grid[cellAt(col, row)] = family;
};

/** Stacks families bottom-up from the floor of one column. */
const stack = (eng, col, families) => {
  families.forEach((family, i) => put(eng, col, ROWS - 1 - i, family));
};

const settle = (eng, limit = 2000) => {
  eng.beginResolve();
  let steps = 0;
  while (eng.phase === "resolving" && steps < limit) {
    eng.update(DT);
    steps++;
  }
  const events = eng.drainEvents();
  for (const e of events) {
    if (e.type === "achievement") allAchievements.add(e.slug);
  }
  return events;
};

// a diagonal line of three clears
{
  const eng = new Engine();
  wipe(eng);
  put(eng, 0, 15, 2);
  put(eng, 0, 14, 3);
  put(eng, 0, 13, 0);
  put(eng, 1, 15, 4);
  put(eng, 1, 14, 0);
  put(eng, 2, 15, 0);
  const before = eng.score;
  settle(eng);
  check(eng.gemsCleared === 3, "a diagonal line of three clears");
  check(eng.maxChain === 1, "the diagonal clear is a single resolution step");
  check(eng.score - before === 3 * TUNE.pointsPerGem, "the diagonal clear scores three gems");
  console.log(`  diagonal: ${eng.gemsCleared} gems, chain ${eng.maxChain}, ${eng.score - before} pts`);
}

// two lines sharing one gem clear together and count that gem once
{
  const eng = new Engine();
  wipe(eng);
  put(eng, 0, 15, 0);
  put(eng, 1, 15, 0);
  stack(eng, 2, [0, 0, 0]);
  const before = eng.score;
  settle(eng);
  check(eng.gemsCleared === 5, "overlapping lines clear all five distinct cells");
  check(eng.maxChain === 1, "overlapping lines resolve in one step, not a chain");
  check(
    eng.score - before === 5 * TUNE.pointsPerGem + 2 * TUNE.bigClearGemBonus,
    "the shared gem scores once, plus the big-clear bonus for cells past three",
  );
  check(topOccupiedRow(eng.grid) === ROWS, "nothing survives the overlapping clear");
  console.log(`  overlap: ${eng.gemsCleared} gems, chain ${eng.maxChain}, ${eng.score - before} pts`);
}

// a gravity chain runs three steps and applies the chain multipliers.
// Column 0 feeds one gem per step into a horizontal line, and the trailing
// column keeps the third step from aligning early.
{
  const eng = new Engine();
  wipe(eng);
  stack(eng, 0, [0, 0, 0, 1]);
  stack(eng, 1, [1, 2]);
  stack(eng, 2, [1, 2]);
  stack(eng, 3, [2]);
  const before = eng.score;
  settle(eng);
  check(eng.maxChain === 3, "the prebuilt gravity chain reaches three resolution steps");
  check(eng.gemsCleared === 9, "each cascade step clears its own three gems");
  check(eng.bestCascadeGems === 9, "best_cascade_gems counts the whole cascade");
  check(
    eng.score - before ===
      TUNE.pointsPerGem * 3 * (chainMultiplier(1) + chainMultiplier(2) + chainMultiplier(3)),
    "the cascade applies the per-step chain multipliers",
  );
  check(allAchievements.has("cascade"), "cascade fires when the chain reaches two");
  console.log(`  cascade: ${eng.gemsCleared} gems, chain ${eng.maxChain}, ${eng.score - before} pts`);
}

// a spawn-blocked column ends the run once resolution finishes
{
  const eng = new Engine();
  wipe(eng);
  const filler = [];
  for (let i = 0; i < ROWS; i++) filler.push(i % 3);
  stack(eng, SPAWN_COL, filler);
  const events = settle(eng);
  check(eng.phase === "gameover", "a blocked spawn column ends the run");
  check(
    events.some((e) => e.type === "gameover" && typeof e.stats.gems_cleared === "number"),
    "the blocked run emits gameover stats",
  );
  console.log(`  spawn block: phase ${eng.phase} after resolution`);
}

// danger-dancer needs a clear started in danger that leaves the board low
{
  const eng = new Engine();
  wipe(eng);
  stack(eng, 5, [1, 3, 2, 1, 3, 2, 1, 0, 0]);
  check(topOccupiedRow(eng.grid) === ROWS - 9, "the staged column starts nine gems tall");
  eng.piece = { col: 5, row: ROWS - 10, gems: [2, 1, 0] };
  eng.lockPiece();
  check(eng.dangerAtLock, "the staged lock happens in danger");
  let steps = 0;
  while (eng.phase === "resolving" && steps < 2000) {
    eng.update(DT);
    steps++;
  }
  for (const e of eng.drainEvents()) {
    if (e.type === "achievement") allAchievements.add(e.slug);
  }
  check(eng.gemsCleared === 3, "the staged danger clear takes exactly the vertical line");
  check(
    topOccupiedRow(eng.grid) >= HIDDEN_ROWS + TUNE.dangerSafeVisRow,
    "the staged clear leaves every column below the safe row",
  );
  check(allAchievements.has("danger-dancer"), "danger-dancer fires on the staged danger clear");
  console.log(
    `  danger dance: cleared ${eng.gemsCleared}, top visible row ${topOccupiedRow(eng.grid) - HIDDEN_ROWS} after resolution`,
  );
}

// forced repeated clears never push the score past the cap
{
  const eng = new Engine();
  eng.score = TUNE.scoreCap - 10;
  for (let i = 0; i < 12; i++) {
    wipe(eng);
    stack(eng, 0, [0, 0, 0]);
    settle(eng);
    if (eng.score !== TUNE.scoreCap) break;
  }
  check(eng.score === TUNE.scoreCap, "repeated forced clears clamp at the cap");
  console.log(`  cap: score held at ${eng.score} through twelve forced clears`);
}

// ---- achievements --------------------------------------------------------

for (const slug of [
  "first-match",
  "cascade",
  "foundry-clear",
  "conservatory-clear",
  "archive-clear",
  "danger-dancer",
  "gem-legend",
]) {
  check(allAchievements.has(slug), `${slug} fires in simulation`);
}

// ---- seed spread ---------------------------------------------------------

console.log("\nace across five more seeds");
const spread = [];
for (const seed of [0x1f3a5c, 0x2b7e91, 0x44c0d3, 0x5ae217, 0x7d9b4f]) {
  const run = simulate(driveAce, `ace bot (seed 0x${seed.toString(16)})`, seed);
  check(run.eng.phase === "victory", `ace reaches victory on seed 0x${seed.toString(16)}`);
  check(
    run.eng.score >= TUNE.legendScore,
    `ace clears the legend score on seed 0x${seed.toString(16)}`,
  );
  spread.push(run.eng.score);
}
spread.push(ace.eng.score);
spread.sort((a, b) => a - b);
console.log(
  `\nace score spread over six seeds: ${spread.join(", ")} (legend threshold ${TUNE.legendScore})`,
);

// ---- verdict -------------------------------------------------------------

if (failures > 0) {
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}
console.log("\nPASS");
