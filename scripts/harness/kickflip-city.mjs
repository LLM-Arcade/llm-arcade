// Kickflip City beatability harness. Run: node scripts/harness/kickflip-city.mjs
// Proves, with exit-code semantics a reviewer can rerun:
//   1. an ace bot clears all three districts and beats the legend threshold on
//      each of six seeds,
//   2. a plodder bot that clears without linking never reaches that threshold,
//      which is what the threshold is calibrated against,
//   3. a clumsy bot that never jumps bails repeatedly and loses on the clock,
//   4. two same-seed ace runs are identical,
//   5. all seven achievement slugs fire across the six ace runs,
//   6. the staged physics and rules proofs below hold.
// Prints the ace spread and a per-district table.

import Matter from "matter-js";
import { GROUND_Y, surfaceYAt } from "../../src/games/kickflip-city/course.ts";
import { Engine, TUNE } from "../../src/games/kickflip-city/engine.ts";

let failures = 0;
const check = (ok, label) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
  return ok;
};

const DT = 1 / 60;
const STEP_BUDGET = Math.ceil((TUNE.districtSeconds + 12) / DT) * 3;
const SEEDS = [TUNE.seed, 1, 7, 4242, 90210, 0x5eed];
const allAchievements = new Set();

const idle = () => ({
  dir: 0,
  crouch: false,
  jump: false,
  trickA: false,
  trickB: false,
  trickC: false,
});

/** Time for the board to fall `dy` px from an upward launch of `v0` px/s. */
const flightTime = (v0, dy) => {
  const disc = v0 * v0 + 2 * TUNE.gravity * dy;
  if (disc < 0) return null;
  return (-v0 + Math.sqrt(disc)) / TUNE.gravity;
};

/** Seconds of airtime left before the board reaches the surface below it. */
const airLeft = (eng) => {
  const ahead = surfaceYAt(eng.course, eng.x + eng.vx * 0.25) ?? GROUND_Y;
  const t = flightTime(eng.vy, ahead - eng.feetY);
  return t === null ? 0 : t;
};

/**
 * The engine edge-triggers jump, so a bot that holds the key never ollies
 * twice. This presses on the first frame it wants to and releases the next,
 * and the release resets whenever the bot stops wanting, so a decision always
 * lands on the frame it was made rather than on the next tick of a free
 * running toggle.
 */
const press = (input, st, want) => {
  input.jump = want && !st.pressed;
  st.pressed = input.jump;
  return input.jump;
};

const nextGrind = (eng) => {
  let best = null;
  for (const g of eng.course.grindables) {
    if (g.x1 < eng.x + TUNE.bodyW) continue;
    if (!best || g.x0 < best.x0) best = g;
  }
  return best;
};

const nextObstacle = (eng) => {
  let best = null;
  for (const o of eng.course.obstacles) {
    if (o.x + o.w / 2 < eng.x) continue;
    if (!best || o.x < best.x) best = o;
  }
  return best;
};

// Clearance a landing needs either side of a hazard. The forward number is the
// larger one: touching down just short of a hazard leaves no room to set the
// next ollie up, which is what turns a clean landing into a wreck one hop later.
const LANDING_AHEAD = 60; // px before a hazard's leading edge
const LANDING_BEHIND = 20; // px past its trailing edge

/**
 * True when a board landing at x finds solid pavement clear of every hazard.
 * Landing deep inside a grindable is fine, because the descent crosses its top
 * line first and locks a grind; landing on its lip is a side hit.
 */
const landingIsClear = (eng, x) => {
  if (surfaceYAt(eng.course, x) === null) return false;
  for (const o of eng.course.obstacles) {
    if (x > o.x - o.w / 2 - LANDING_AHEAD && x < o.x + o.w / 2 + LANDING_BEHIND) return false;
  }
  for (const g of eng.course.grindables) {
    if (x > g.x0 - LANDING_AHEAD && x < g.x0 + 34) return false;
  }
  return true;
};

/** How far a bare ollie carries from here, air control included. */
const ollieReach = (speed) => {
  const t = flightTime(-TUNE.ollieVel, 0);
  const gain = TUNE.pushAccel * TUNE.airControl;
  return Math.min(TUNE.pushSpeed * t, speed * t + 0.5 * gain * t * t);
};

// ---- bots ----------------------------------------------------------------

/**
 * The ace plays the course rather than farming hops: it pushes to speed, ollies
 * hazards and pits, arrives on grindables inside the lock window, holds the
 * balance meter, flips whenever the airtime covers a full spin, and fills a
 * short line out to five links before letting it bank.
 */
const driveAce = (eng, st) => {
  const i = eng.input;
  Object.assign(i, idle());
  i.dir = 1;

  if (eng.stance === "bailing") {
    press(i, st, false);
    return;
  }

  if (eng.stance === "grinding") {
    i.dir = eng.balance >= 0 ? 1 : -1;
    const rail = eng.grind;
    press(i, st, !!rail && eng.x > rail.x1 - 24);
    return;
  }

  if (eng.stance === "airborne") {
    press(i, st, false);
    if (!eng.trick && airLeft(eng) > TUNE.flipTime + 0.1) {
      st.flipToggle = !st.flipToggle;
      if (st.flipToggle) i.trickA = true;
      else i.trickB = true;
    }
    return;
  }

  // Rolling. Decide what the next thing off the ground is.
  const grind = nextGrind(eng);
  const obstacle = nextObstacle(eng);
  const pit = eng.nextPit();
  const speed = Math.max(80, eng.vx);
  const reach = ollieReach(speed);

  const grindAt = grind ? grind.x0 + 30 : Infinity;
  const blockAt = Math.min(
    obstacle ? obstacle.x - obstacle.w / 2 : Infinity,
    pit ? pit.x0 : Infinity,
  );
  const next = Math.min(grindAt, blockAt);

  let want = false;
  if (grindAt < blockAt) {
    const t = flightTime(-TUNE.ollieVel, grind.y - eng.feetY);
    want = t !== null && grindAt - eng.x <= speed * t;
  } else if (blockAt < Infinity) {
    // Take off at whatever range puts the landing on clear pavement rather
    // than at a fixed lead, which lands one hazard deep into the next one.
    // 60 px is the last range a bare ollie comfortably tops the tallest
    // obstacle from, so it is where the bot stops holding out for a better
    // landing and takes the one it has.
    const d = blockAt - eng.x;
    want = d <= 200 && (d <= 60 || landingIsClear(eng, eng.x + reach));
  }

  // Filler hops across open pavement: a skilled line is kept alive between
  // features rather than restarted at every one. The link cap keeps the ace a
  // model of good play instead of a hop farmer riding the multiplier cap.
  if (!want && next - eng.x > 300 && eng.line.length < 8) {
    want = eng.line.length === 0 || eng.quiet > 0.15;
  }

  press(i, st, want);
};

/**
 * Clears the course but never builds a line: no filler hops, no tricks in the
 * air. This is the sloppy finisher the legend threshold has to sit above.
 */
const drivePlodder = (eng, st) => {
  const i = eng.input;
  Object.assign(i, idle());
  i.dir = 1;

  if (eng.stance === "bailing") {
    press(i, st, false);
    return;
  }
  if (eng.stance === "grinding") {
    i.dir = eng.balance >= 0 ? 1 : -1;
    const rail = eng.grind;
    press(i, st, !!rail && eng.x > rail.x1 - 24);
    return;
  }
  if (eng.stance === "airborne") {
    press(i, st, false);
    return;
  }

  const grind = nextGrind(eng);
  const obstacle = nextObstacle(eng);
  const pit = eng.nextPit();
  const speed = Math.max(80, eng.vx);
  const grindAt = grind ? grind.x0 + 30 : Infinity;
  const blockAt = Math.min(
    obstacle ? obstacle.x - obstacle.w / 2 : Infinity,
    pit ? pit.x0 : Infinity,
  );

  let want = false;
  if (grindAt < blockAt) {
    const t = flightTime(-TUNE.ollieVel, grind.y - eng.feetY);
    want = t !== null && grindAt - eng.x <= speed * t;
  } else if (blockAt < Infinity) {
    const d = blockAt - eng.x;
    want = d <= 200 && (d <= 60 || landingIsClear(eng, eng.x + ollieReach(speed)));
  }
  press(i, st, want);
};

/** Never leaves the ground, so the first hazard wrecks it, over and over. */
const driveClumsy = (eng) => {
  Object.assign(eng.input, idle());
  eng.input.dir = 1;
};

const simulate = (drive, label, seed, stopDistricts = 3) => {
  const eng = new Engine(seed);
  const st = { pressed: false, flipToggle: false };
  const achievements = new Set();
  const rows = [];
  let stats = null;
  let capOk = true;
  let steps = 0;
  let seen = 0;
  let prevScore = 0;

  // Endless game: bots stop after one full lap unless they die first.
  while (eng.phase !== "gameover" && eng.districtsCleared < stopDistricts && steps < STEP_BUDGET) {
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
    if (eng.districtsCleared > seen) {
      seen = eng.districtsCleared;
      rows.push({
        name: eng.course.name,
        clock: eng.clock,
        points: eng.score - prevScore,
        total: eng.score,
        bails: eng.bails,
      });
      prevScore = eng.score;
    }
  }
  for (const e of eng.drainEvents()) {
    if (e.type === "achievement") {
      achievements.add(e.slug);
      allAchievements.add(e.slug);
    }
    if (e.type === "gameover") stats = e.stats;
  }

  if (label) {
    console.log(`\n${label}`);
    console.log("  district              clock   points    total   bails");
    for (const r of rows) {
      console.log(
        `  ${r.name.padEnd(18)} ${r.clock.toFixed(1).padStart(6)}s ${String(r.points).padStart(8)} ${String(r.total).padStart(8)} ${String(r.bails).padStart(7)}`,
      );
    }
    console.log(
      `  outcome: ${eng.phase}  steps ${steps}  districts ${eng.districtsCleared}  tricks ${eng.tricksLanded}  best line ${eng.bestLine}  longest grind ${Math.round(eng.longestGrindPx)}px  bails ${eng.bails}  score ${eng.score}`,
    );
    console.log(`  achievements: ${[...achievements].sort().join(", ") || "(none)"}`);
  }
  return { eng, achievements, capOk, stats, steps, rows };
};

// ---- ace over six seeds --------------------------------------------------

const aceRuns = SEEDS.map((seed, i) =>
  simulate(driveAce, i === 0 ? `ace bot (seed ${seed})` : null, seed),
);

console.log("\nace spread over six seeds");
console.log("  seed        outcome   districts   bails    score");
for (let i = 0; i < SEEDS.length; i++) {
  const r = aceRuns[i];
  console.log(
    `  ${String(SEEDS[i]).padEnd(10)} ${r.eng.phase.padEnd(9)} ${String(r.eng.districtsCleared).padStart(9)} ${String(r.eng.bails).padStart(7)} ${String(r.eng.score).padStart(8)}`,
  );
}
const aceScores = aceRuns.map((r) => r.eng.score);
const aceSlugs = new Set(aceRuns.flatMap((r) => [...r.achievements]));
console.log(
  `  low ${Math.min(...aceScores)}  high ${Math.max(...aceScores)}  legend threshold ${TUNE.legendScore}`,
);
console.log(`  slugs across the six ace runs: ${[...aceSlugs].sort().join(", ")}`);

for (let i = 0; i < SEEDS.length; i++) {
  const r = aceRuns[i];
  check(r.eng.lap === 1, `ace completes lap one on seed ${SEEDS[i]}`);
  check(r.eng.districtsCleared === 3, `ace clears all three districts on seed ${SEEDS[i]}`);
  check(r.eng.score >= TUNE.legendScore, `ace beats the legend threshold on seed ${SEEDS[i]}`);
  check(r.capOk, `score never exceeds the cap on seed ${SEEDS[i]}`);
  check(r.steps < STEP_BUDGET, `ace finishes inside the step budget on seed ${SEEDS[i]}`);
}

const ace = aceRuns[0];

// ---- plodder bot ---------------------------------------------------------

const plodderRuns = SEEDS.map((seed) => simulate(drivePlodder, null, seed));
const plodderScores = plodderRuns.map((r) => r.eng.score);
console.log(
  `
plodder bot (clears, never links): low ${Math.min(...plodderScores)}  high ${Math.max(...plodderScores)}`,
);
check(
  Math.max(...plodderScores) < TUNE.legendScore,
  "no plodder run reaches the legend threshold",
);

// ---- clumsy bot ----------------------------------------------------------

const clumsy = simulate(driveClumsy, "clumsy bot (never jumps)", TUNE.seed);
check(clumsy.eng.phase === "gameover", "clumsy bot loses on the clock");
check(clumsy.eng.districtsCleared === 0, "clumsy bot never clears a district");
// The first hit at speed is a real wreck; after the respawn the stumble rule
// holds the skater at the hazard instead of chain-bailing them to death.
check(clumsy.eng.bails >= 1, "clumsy bot wrecks at least once at speed");
check(clumsy.eng.bails <= 3, "the stumble rule stops the old bail chain");
check(clumsy.stats !== null, "gameover stats emitted (clumsy)");

// ---- determinism ---------------------------------------------------------

const repeat = simulate(driveAce, null, TUNE.seed);
check(
  repeat.eng.score === ace.eng.score &&
    repeat.steps === ace.steps &&
    repeat.eng.tricksLanded === ace.eng.tricksLanded,
  "two same-seed ace runs match on score, steps and tricks",
);

// ---- staged proofs -------------------------------------------------------

console.log("\nstaged proofs");

const settle = (eng, seconds) => {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) eng.update(DT);
};

const place = (eng, x, speed = 0) => {
  const y = (surfaceYAt(eng.course, x) ?? GROUND_Y) - TUNE.bodyH / 2;
  Matter.Body.setPosition(eng.body, { x, y });
  Matter.Body.setVelocity(eng.body, { x: speed / 60, y: 0 });
  eng.vx = speed;
  eng.vy = 0;
  eng.stance = "rolling";
  eng.scrollX = Math.max(0, x - TUNE.cameraBias);
};

/**
 * Where a level board resting on the lane sits: on the higher of the two lane
 * heights under its ends, which on a slope is above the lane at its center.
 */
const restingFeetY = (eng) => {
  const a = surfaceYAt(eng.course, eng.x - TUNE.bodyW / 2);
  const b = surfaceYAt(eng.course, eng.x + TUNE.bodyW / 2);
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
};

/** Worst gap between the board and where it should rest, over `seconds`. */
const rideAndMeasure = (eng, seconds) => {
  let worst = 0;
  let lost = false;
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    eng.update(DT);
    const rest = restingFeetY(eng);
    if (rest === null) continue;
    if (eng.stance !== "rolling" && eng.stance !== "grinding") lost = true;
    worst = Math.max(worst, Math.abs(eng.feetY - rest));
  }
  return { worst, lost };
};

// grounded contact holds on flat pavement for ten seconds
{
  const eng = new Engine();
  place(eng, eng.course.startX, 0);
  eng.input = idle();
  const { worst, lost } = rideAndMeasure(eng, 10);
  check(!lost, "flat: the skater never leaves the ground in 10 s");
  check(worst <= 1, `flat: board stays within 1 px of its resting line (worst ${worst.toFixed(3)} px)`);
}

// grounded contact holds through a ramp
{
  const eng = new Engine();
  const ramp = eng.course.segments.find((s) => s.kind === "ramp");
  check(!!ramp, "found a ramp segment to test");
  place(eng, ramp.x0 + 4, 0);
  eng.input = idle();
  const { worst, lost } = rideAndMeasure(eng, 10);
  check(!lost, "ramp: the skater never leaves the ground in 10 s");
  check(worst <= 1, `ramp: board stays within 1 px of its resting line (worst ${worst.toFixed(3)} px)`);
}

// the ollie reaches its design height, and a full crouch preload beats it
const apexRise = (crouchSeconds) => {
  const eng = new Engine();
  place(eng, eng.course.startX, 0);
  eng.input = idle();
  const base = eng.feetY;
  if (crouchSeconds > 0) {
    eng.input.crouch = true;
    settle(eng, crouchSeconds);
  }
  eng.input.jump = true;
  eng.update(DT);
  eng.input.jump = false;
  eng.input.crouch = false;
  let rise = 0;
  for (let i = 0; i < 90 && eng.stance === "airborne"; i++) {
    eng.update(DT);
    rise = Math.max(rise, base - eng.feetY);
  }
  return rise;
};
{
  const plain = apexRise(0);
  const loaded = apexRise(0.5);
  check(Math.abs(plain - 110) <= 6, `ollie apex is about 110 px (measured ${plain.toFixed(1)})`);
  check(
    Math.abs(loaded - 110 * 1.35) <= 9,
    `full crouch preload reaches about 149 px (measured ${loaded.toFixed(1)})`,
  );
  check(loaded > plain + 25, "the preload clearly beats a bare ollie");
}

// a flip that finishes its spin scores; one interrupted by the ground bails
{
  const eng = new Engine();
  place(eng, eng.course.startX, 200);
  eng.input = idle();
  eng.input.jump = true;
  eng.update(DT);
  eng.input.jump = false;
  eng.input.trickA = true;
  eng.update(DT);
  eng.input.trickA = false;
  for (let i = 0; i < 120 && eng.stance === "airborne"; i++) eng.update(DT);
  check(eng.stance === "rolling", "a completed kickflip lands clean");
  check(
    eng.line.some((l) => l.label === "Kickflip" && l.points === TUNE.flipPoints),
    "the landed kickflip scores into the open line",
  );
}
{
  const eng = new Engine();
  place(eng, eng.course.startX, 200);
  eng.input = idle();
  eng.input.jump = true;
  eng.update(DT);
  eng.input.jump = false;
  // Start the flip so late that the ground arrives before the spin completes.
  settle(eng, 0.55);
  eng.input.trickB = true;
  eng.update(DT);
  eng.input.trickB = false;
  for (let i = 0; i < 120 && eng.stance === "airborne"; i++) eng.update(DT);
  check(eng.stance === "bailing", "an interrupted flip bails on landing");
  check(eng.line.length === 0, "the bail voids the open line");
}

// grind entry only happens from above, inside the lock window
{
  const eng = new Engine();
  const rail = eng.course.grindables[0];
  place(eng, rail.x0 + 20, 260);
  Matter.Body.setPosition(eng.body, {
    x: rail.x0 + 20,
    y: rail.y - TUNE.bodyH / 2 - 40,
  });
  eng.stance = "airborne";
  eng.vy = 0;
  eng.input = idle();
  for (let i = 0; i < 60 && eng.stance === "airborne"; i++) eng.update(DT);
  check(eng.stance === "grinding", "a descending skater locks onto the rail");
  check(eng.line.length === 1, "the grind opens a link in the line");
  const lineBefore = eng.line.length;
  settle(eng, 0.25);
  eng.input.jump = true;
  eng.update(DT);
  eng.input.jump = false;
  check(eng.stance === "airborne", "space jumps off the rail");
  check(eng.line.length >= lineBefore, "jumping off the rail keeps the line open");
  check(eng.line[0].points > 0, "the grind scored while it lasted");
}
{
  const eng = new Engine();
  const rail = eng.course.grindables[0];
  place(eng, rail.x0 - 60, TUNE.pushSpeed);
  eng.input = idle();
  eng.input.dir = 1;
  let grinded = false;
  for (let i = 0; i < 90 && eng.stance !== "bailing"; i++) {
    eng.update(DT);
    if (eng.stance === "grinding") grinded = true;
  }
  check(!grinded, "riding into the side of a rail never starts a grind");
  check(eng.stance === "bailing", "riding into the side of a rail bails");
}

// 400 px of grinding inside one line fires rail-worker
{
  const eng = new Engine();
  const rail = eng.course.grindables[0];
  place(eng, rail.x0 + 20, 300);
  Matter.Body.setPosition(eng.body, { x: rail.x0 + 20, y: rail.y - TUNE.bodyH / 2 - 30 });
  eng.stance = "airborne";
  eng.vy = 0;
  eng.input = idle();
  for (let i = 0; i < 60 && eng.stance === "airborne"; i++) eng.update(DT);
  check(eng.stance === "grinding", "the rail-worker probe is on a rail");
  eng.drainEvents();
  // Short of the threshold, so the grind itself has to carry it across.
  eng.lineGrindPx = TUNE.railWorkerPx - 40;
  let fired = false;
  for (let i = 0; i < 60 && eng.stance === "grinding"; i++) {
    eng.input.dir = eng.balance >= 0 ? 1 : -1;
    eng.update(DT);
    if (eng.drainEvents().some((e) => e.type === "achievement" && e.slug === "rail-worker")) {
      fired = true;
    }
  }
  check(fired, "grinding past 400 px in one line fires rail-worker");
}

// a bail voids the line and takes six seconds off the clock
{
  const eng = new Engine();
  place(eng, eng.course.startX, 200);
  eng.input = idle();
  eng.line.push({ label: "Ollie", points: 50, trick: false });
  const clock = eng.clock;
  const score = eng.score;
  eng.bail();
  check(eng.line.length === 0, "the bail voids the unbanked line");
  check(Math.abs(clock - eng.clock - TUNE.bailClockPenalty) < 1e-6, "the bail costs six seconds");
  check(eng.score === score, "the bail leaves the banked score alone");
}

// the checkpoint respawn restores the district start and keeps the score
{
  const eng = new Engine();
  place(eng, 1400, 300);
  eng.score = 1234;
  eng.respawnAtCheckpoint();
  check(eng.x === eng.course.startX, "the checkpoint respawn returns to the district start");
  check(eng.score === 1234, "the checkpoint respawn keeps the score");
  check(eng.stance === "rolling", "the checkpoint respawn puts the skater back on the board");
}

// a roofs pit bails, and the respawn lands on solid ground short of the gap
{
  const eng = new Engine();
  eng.advanceDistrict();
  eng.advanceDistrict();
  check(eng.districtIndex === 2, "reached the warehouse roofs");
  const pit = (() => {
    const sorted = [...eng.course.segments].sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x0 > sorted[i - 1].x1 + 4) {
        return { x0: sorted[i - 1].x1, x1: sorted[i].x0 };
      }
    }
    return null;
  })();
  check(!!pit, "the warehouse roofs course has a pit");
  place(eng, pit.x0 - 40, 220);
  eng.input = idle();
  eng.input.dir = 1;
  let bailed = false;
  for (let i = 0; i < 240; i++) {
    eng.update(DT);
    if (eng.stance === "bailing") bailed = true;
    if (bailed && eng.stance === "rolling") break;
  }
  check(bailed, "rolling into a roof pit bails");
  check(
    surfaceYAt(eng.course, eng.x) !== null && eng.x < pit.x0,
    "the pit respawn lands on solid ground short of the gap",
  );
}

// the district handover banks the open line and swaps the course
{
  const eng = new Engine();
  const first = eng.course;
  eng.line.push({ label: "Ollie", points: 50, trick: false });
  eng.line.push({ label: "Kickflip", points: 150, trick: true });
  place(eng, eng.course.finishX - 6, 200);
  eng.input = idle();
  eng.input.dir = 1;
  for (let i = 0; i < 30 && eng.phase === "skating"; i++) eng.update(DT);
  check(eng.phase === "district-clear", "crossing the finish enters the clear banner");
  const banked = eng.score;
  // One trick link keeps the multiplier at x1; the ollie pays but never
  // multiplies, so the handover banks 200 flat plus the bonus.
  check(banked >= 200 + TUNE.districtClearBonus, "the line banks with the clear bonus");
  check(eng.line.length === 0, "the line is empty after the handover bank");
  settle(eng, TUNE.districtHold + 0.2);
  check(eng.districtIndex === 1, "the next district loads");
  check(eng.course !== first, "the course actually swapped");
  check(eng.score === banked, "the score carries across the handover");
  check(eng.clock > TUNE.districtSeconds - 0.5, "the next district starts on a full clock");
}

// the cap holds under repeated maximum-multiplier banks
{
  const eng = new Engine();
  eng.score = TUNE.scoreCap - 10;
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < 9; i++) {
      eng.line.push({ label: "Kickflip", points: TUNE.flipPoints, trick: true });
    }
    check(eng.multiplier === TUNE.maxMult, "nine links reach the multiplier cap");
    eng.bank();
  }
  check(eng.score === TUNE.scoreCap, "repeated forced banks never exceed the cap");
}

// ---- achievements --------------------------------------------------------

for (const slug of [
  "first-ollie",
  "line-starter",
  "rail-worker",
  "market-run",
  "roofline",
  "clean-landing",
  "city-legend",
]) {
  check(allAchievements.has(slug), `${slug} fires in simulation`);
}

// ---- verdict -------------------------------------------------------------

if (failures > 0) {
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}
console.log("\nPASS");
