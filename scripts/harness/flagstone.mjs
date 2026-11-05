// Flagstone harness. Run: node scripts/harness/flagstone.mjs
// Proves, with exit-code semantics a reviewer can rerun:
//   1. the puzzle bank is rectangular, tiered, and its clues are derived
//      from the solutions (never hand-typed),
//   2. every puzzle has EXACTLY ONE solution and it is the authored one
//      (a real nonogram solver, from the clues alone),
//   3. every puzzle is solvable by line logic with no guessing,
//   4. a perfect bot clears all six slabs, reaches every achievement, and
//      never exceeds the score cap,
//   5. a sloppy bot dies on exactly the fifth wrong fill and never earns
//      the flawless achievements,
//   6. un-filling and re-filling a cell cannot farm score.

import { PUZZLES, clueLine } from "../../src/games/flagstone/levels.ts";
import { Engine, FLAGGED, FILLED, TUNE } from "../../src/games/flagstone/engine.ts";

let failures = 0;
const check = (ok, label) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
  return ok;
};
const finish = () => {
  if (failures > 0) {
    console.log(`\nFAIL (${failures})`);
    process.exit(1);
  }
  console.log("\nPASS");
};

// ---- 1. puzzle bank ------------------------------------------------------

console.log("puzzle bank");
for (const p of PUZZLES) {
  check(p.w >= 10 && p.w <= 15 && p.h >= 10 && p.h <= 15, `${p.id}: size in range`);
  check(p.solution.length === p.w * p.h, `${p.id}: solution length`);
  check(p.rowClues.length === p.h, `${p.id}: row clue count`);
  check(p.colClues.length === p.w, `${p.id}: column clue count`);

  // Clues must be re-derivable from the solution.
  let clueMismatch = 0;
  for (let y = 0; y < p.h; y++) {
    const want = JSON.stringify(clueLine(p.solution.subarray(y * p.w, y * p.w + p.w)));
    if (JSON.stringify(p.rowClues[y]) !== want) clueMismatch++;
  }
  const column = new Uint8Array(p.h);
  for (let x = 0; x < p.w; x++) {
    for (let y = 0; y < p.h; y++) column[y] = p.solution[y * p.w + x];
    if (JSON.stringify(p.colClues[x]) !== JSON.stringify(clueLine(column))) clueMismatch++;
  }
  check(clueMismatch === 0, `${p.id}: clues derived from solution`);

  let filled = 0;
  for (let i = 0; i < p.solution.length; i++) filled += p.solution[i];
  check(filled > 0 && filled < p.w * p.h, `${p.id}: non-trivial fill`);
  console.log(`  ${p.id.padEnd(13)} ${p.w}x${p.h}  tier ${p.tier}  stones ${filled}`);
}
const tiers = PUZZLES.map((p) => p.tier);
check(
  tiers.every((t, i) => i === 0 || t > tiers[i - 1]),
  "tiers ascend",
);

// ---- 2. solver -----------------------------------------------------------

/** Every placement of a clue's runs in a line: 1 filled, -1 empty. */
const placements = (clue, len) => {
  const runs = clue.length === 1 && clue[0] === 0 ? [] : clue;
  const out = [];
  const build = (idx, pos, acc) => {
    if (idx === runs.length) {
      const line = acc.slice();
      while (line.length < len) line.push(-1);
      out.push(line);
      return;
    }
    const run = runs[idx];
    let tail = 0;
    for (let k = idx + 1; k < runs.length; k++) tail += runs[k] + 1;
    for (let start = pos; start + run + tail <= len; start++) {
      const next = acc.slice();
      while (next.length < start) next.push(-1);
      for (let k = 0; k < run; k++) next.push(1);
      build(idx + 1, next.length + 1, next);
    }
  };
  build(0, 0, []);
  return out;
};

const cache = new Map();
const cachedPlacements = (clue, len) => {
  const key = `${len}:${clue.join(",")}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = placements(clue, len);
    cache.set(key, hit);
  }
  return hit;
};


const fits = (line, known) => {
  for (let i = 0; i < known.length; i++) if (known[i] !== 0 && known[i] !== line[i]) return false;
  return true;
};

const rowOf = (grid, w, y) => grid.subarray(y * w, y * w + w);

/**
 * Line-logic propagation: for every row and column, intersect the placements
 * still consistent with what is known. Returns ok:false on a contradiction.
 */
const propagate = (grid, p) => {
  const { w, h, rowClues, colClues } = p;

  for (let pass = 0; pass < 200; pass++) {
    let changed = false;

    for (let y = 0; y < h; y++) {
      const known = rowOf(grid, w, y);
      const domain = cachedPlacements(rowClues[y], w).filter((line) => fits(line, known));
      if (domain.length === 0) return { ok: false, resolved: false };
      for (let x = 0; x < w; x++) {
        const value = domain[0][x];
        let agreed = true;
        for (let k = 1; k < domain.length; k++) {
          if (domain[k][x] !== value) {
            agreed = false;
            break;
          }
        }
        if (agreed && grid[y * w + x] !== value) {
          grid[y * w + x] = value;
          changed = true;
        }
      }
    }

    for (let x = 0; x < w; x++) {
      const known = new Int8Array(h);
      for (let y = 0; y < h; y++) known[y] = grid[y * w + x];
      const domain = cachedPlacements(colClues[x], h).filter((line) => fits(line, known));
      if (domain.length === 0) return { ok: false, resolved: false };
      for (let y = 0; y < h; y++) {
        const value = domain[0][y];
        let agreed = true;
        for (let k = 1; k < domain.length; k++) {
          if (domain[k][y] !== value) {
            agreed = false;
            break;
          }
        }
        if (agreed && grid[y * w + x] !== value) {
          grid[y * w + x] = value;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  let resolved = true;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 0) {
      resolved = false;
      break;
    }
  }
  return { ok: true, resolved };
};

/** All solutions, up to `limit`, branching on undecided cells. */
const solve = (p, limit = 2) => {
  const found = [];
  const search = (grid) => {
    if (found.length >= limit) return;
    const work = Int8Array.from(grid);
    const state = propagate(work, p);
    if (!state.ok) return;

    let unknown = -1;
    for (let i = 0; i < work.length; i++) {
      if (work[i] === 0) {
        unknown = i;
        break;
      }
    }
    if (unknown === -1) {
      found.push(work);
      return;
    }
    for (const value of [1, -1]) {
      const next = Int8Array.from(work);
      next[unknown] = value;
      search(next);
      if (found.length >= limit) return;
    }
  };
  search(new Int8Array(p.w * p.h));
  return found;
};

// ---- 3. uniqueness + line-logic solvability ------------------------------

console.log("\nuniqueness (solved from the clues alone)");
for (const p of PUZZLES) {
  const solutions = solve(p, 2);
  const matches =
    solutions.length === 1 && solutions[0].every((v, i) => (v === 1 ? 1 : 0) === p.solution[i]);
  check(matches, `${p.id}: exactly one solution, equal to the authored grid`);

  const lineOnly = new Int8Array(p.w * p.h);
  const state = propagate(lineOnly, p);
  check(state.ok && state.resolved, `${p.id}: solvable by line logic without guessing`);
  console.log(`  ${p.id.padEnd(13)} solutions ${solutions.length}`);
}

// ---- 4. opening state ----------------------------------------------------

console.log("\nopening state");
for (let i = 0; i < PUZZLES.length; i++) {
  const p = PUZZLES[i];
  const fresh = new Engine(i);
  let emptyRows = 0;
  let emptyCols = 0;
  for (const clue of p.rowClues) if (clue.length === 1 && clue[0] === 0) emptyRows++;
  for (const clue of p.colClues) if (clue.length === 1 && clue[0] === 0) emptyCols++;
  check(fresh.score === 0, `${p.id}: opens at zero`);
  check(fresh.drainEvents().length === 0, `${p.id}: nothing fires before the first stone`);
  check(
    fresh.rowDone.filter(Boolean).length === emptyRows &&
      fresh.colDone.filter(Boolean).length === emptyCols,
    `${p.id}: only the ${emptyRows}+${emptyCols} empty lines start satisfied`,
  );
}

// An empty line has no work in it, so it must never pay a line bonus.
const pay = new Engine();
pay.move(1, 0);
pay.move(0, 1);
pay.move(0, 1);
pay.fill();
check(
  pay.score === TUNE.fillBase * pay.multiplier,
  `first stone pays the base only (got ${pay.score})`,
);



// ---- 4. bots -------------------------------------------------------------

const runBot = (eng, pickCell) => {
  const achievements = new Set();
  let gameover = null;
  const drain = () => {
    for (const event of eng.drainEvents()) {
      if (event.type === "achievement") achievements.add(event.slug);
      if (event.type === "gameover") gameover = event;
    }
  };
  drain();

  let guard = 0;
  while (eng.phase === "playing" && guard++ < 5000) {
    const p = eng.puzzle;
    const cell = pickCell(eng, p);
    if (cell === null) break;
    eng.setCursor(Math.floor(cell / p.w), cell % p.w);
    eng.fill();
    eng.update(1 / 60);
    drain();
  }
  return { achievements, gameover };
};

const nextSolutionCell = (eng, p) => {
  for (let i = 0; i < p.solution.length; i++) {
    if (p.solution[i] && eng.marks[i] !== FILLED) return i;
  }
  return null;
};

console.log("\nperfect bot");
const perfect = new Engine();
const perfectRun = runBot(perfect, nextSolutionCell);
check(perfect.phase === "over", "run ends after the last slab");
check(perfect.cleared === PUZZLES.length, `clears all ${PUZZLES.length} slabs`);
check(perfect.mistakes === 0, "takes no wrong fills");
check(perfect.flawlessClears === PUZZLES.length, "every slab flawless");
check(!!perfectRun.gameover, "fires a gameover event");
check(perfectRun.gameover?.score === perfect.score, "gameover carries the final score");
check(perfect.score <= TUNE.scoreCap, "score within the cap");
check(
  perfect.score >= TUNE.legendScore,
  `score reaches the legend threshold (${perfect.score} >= ${TUNE.legendScore})`,
);
for (const slug of [
  "first-line",
  "first-slab",
  "clean-cut",
  "hot-quarry",
  "three-slabs",
  "quarry-legend",
]) {
  check(perfectRun.achievements.has(slug), `perfect bot reaches ${slug}`);
}
const stats = perfectRun.gameover?.stats ?? {};
check(stats.slabs === PUZZLES.length, "stats report the slab count");
check(Object.keys(stats).length <= 16, "stats within the sanitizer key budget");
check(
  Object.values(stats).every((v) => typeof v === "number" || typeof v === "string"),
  "stats are numbers or strings",
);
console.log(
  `  final score ${perfect.score.toLocaleString()}  achievements ${perfectRun.achievements.size}`,
);

const nextWrongCell = (eng, p) => {
  for (let i = 0; i < p.solution.length; i++) {
    if (!p.solution[i] && eng.marks[i] === 0) return i;
  }
  return null;
};

console.log("\nsloppy bot");
const sloppy = new Engine();
const sloppyRun = runBot(sloppy, nextWrongCell);
check(sloppy.phase === "over", "run ends on repeated wrong fills");
check(sloppy.mistakes === TUNE.maxMistakes, `dies on wrong fill ${TUNE.maxMistakes}`);
check(sloppy.cleared === 0, "clears nothing");
check(!sloppyRun.achievements.has("clean-cut"), "never earns clean-cut");
check(!sloppyRun.achievements.has("first-slab"), "never earns first-slab");
check(sloppy.score === 0, "scores nothing without a correct fill");
check(sloppyRun.gameover?.stats.misses === TUNE.maxMistakes, "stats report the misses");

// ---- 5. no score farming, no free flags ---------------------------------

console.log("\nanti-farm");
const farm = new Engine();
const firstCell = nextSolutionCell(farm, farm.puzzle);
farm.setCursor(Math.floor(firstCell / farm.puzzle.w), firstCell % farm.puzzle.w);
farm.fill();
const afterFirst = farm.score;
check(afterFirst > 0, "a correct fill pays");
farm.clear();
farm.fill();
check(farm.score === afterFirst, "re-filling the same cell pays nothing");

const flag = new Engine();
const before = flag.score;
flag.flag();
check(flag.markAt(0, 0) === FLAGGED, "flag marks the cell");
check(flag.score === before && flag.mistakes === 0, "flagging is free");

const wrong = new Engine();
const badCell = nextWrongCell(wrong, wrong.puzzle);
wrong.setCursor(Math.floor(badCell / wrong.puzzle.w), badCell % wrong.puzzle.w);
wrong.fill();
check(wrong.marks[badCell] !== FILLED, "a wrong fill does not stay on the board");
check(wrong.mistakes === 1 && wrong.streak === 0, "a wrong fill costs one miss and the streak");

// cursor stays on the board
const edges = new Engine();
edges.move(-5, -5);
check(edges.cursorRow === 0 && edges.cursorCol === 0, "cursor clamps at the top-left");
edges.move(99, 99);
check(
  edges.cursorRow === edges.puzzle.h - 1 && edges.cursorCol === edges.puzzle.w - 1,
  "cursor clamps at the bottom-right",
);

finish();
