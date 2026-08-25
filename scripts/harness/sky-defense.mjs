// Sky Defense beatability harness. Run: node scripts/harness/sky-defense.mjs
// Proves, with exit-code semantics a reviewer can rerun:
//   1. an ace bot that leads its shots holds all three regions, reaches
//      victory and the legend score inside a bounded step budget,
//   2. a sloppy bot that fires at where a threat already was loses a region,
//      which proves the loss path,
//   3. two same-seed ace runs match on score, threats downed and steps,
//   4. the rules hold on staged skies: lead timing, ember-mine chain
//      propagation credited to one burst, health tier flips at 66 and 33,
//      the empty magazine, the harmless balloon, the accuracy bonus edge,
//      and the score cap,
//   5. all seven achievement slugs fire,
//   6. the ace still wins on five more seeds.

import {
  BATTERY_X,
  BUILDING_X,
  Engine,
  GROUND_Y,
  MUZZLE_Y,
  TUNE,
  predictThreat,
  threatX,
  tierForHealth,
} from "../../src/games/sky-defense/engine.ts";
import { BALLOON, FAMILIES, MINE, POD, REGIONS, SKIFF } from "../../src/games/sky-defense/waves.ts";

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

/**
 * Where to aim so the threat falls into the burst. Aiming at the arrival
 * point alone is not enough: a burst opens at radius zero and grows at
 * 183 px/s, barely ahead of the quickest threat, so a threat aimed at
 * exactly outruns the growing edge. Half a growth window further along its
 * path puts the threat inside the burst while it opens. Four passes converge
 * because travel time changes slowly with the aim point.
 */
const lead = (eng, t) => {
  let tf = Math.hypot(threatX(t, eng.time) - BATTERY_X, t.y - MUZZLE_Y) / TUNE.interceptorSpeed;
  let p = null;
  for (let i = 0; i < 4; i++) {
    p = predictThreat(t, eng.time, tf + TUNE.burstGrow * 0.5);
    tf = Math.hypot(p.x - BATTERY_X, p.y - MUZZLE_Y) / TUNE.interceptorSpeed;
  }
  return { x: p.x, y: p.y, tf };
};

const rank = (family) => {
  if (family === SKIFF) return 0;
  if (family === MINE) return 1;
  return FAMILIES[family].impact === 0 ? 3 : 2;
};

const driveAce = (eng, st) => {
  eng.input.fire = false;
  if (eng.phase !== "playing") return;
  if (eng.reloading > 0 || eng.cooldown > 0 || eng.ammo <= 0) return;

  let best = null;
  for (const t of eng.threats) {
    if (t.diedAt !== null) continue;
    const claimed = st.claims.get(t.id);
    if (claimed !== undefined && claimed > eng.time) continue;
    const aim = lead(eng, t);
    // Unreachable: the burst would open at or under the ground line.
    if (aim.y > GROUND_Y - 24 || aim.x < 6 || aim.x > 954) continue;
    const fall = (GROUND_Y - t.y) / Math.max(1, t.vy);
    const key = [rank(t.family), fall];
    if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && key[1] < best.key[1])) {
      best = { key, aim, id: t.id };
    }
  }
  if (!best) return;

  st.claims.set(best.id, eng.time + best.aim.tf + TUNE.burstGrow + 0.1);
  eng.input.aimX = best.aim.x;
  eng.input.aimY = best.aim.y;
  eng.input.fire = true;
};

const driveSloppy = (eng, st) => {
  eng.input.fire = false;
  if (eng.phase !== "playing") return;
  if (eng.reloading > 0 || eng.cooldown > 0 || eng.ammo <= 0) return;
  if (eng.time < st.nextShot) return;

  let newest = null;
  for (const t of eng.threats) {
    if (t.diedAt === null && (!newest || t.id > newest.id)) newest = t;
  }
  if (!newest) return;

  // No lead at all: it shoots where the threat already is, half a second late.
  st.nextShot = eng.time + 0.5;
  eng.input.aimX = threatX(newest, eng.time);
  eng.input.aimY = newest.y;
  eng.input.fire = true;
};

const simulate = (drive, label, seed = TUNE.seed) => {
  const eng = new Engine(seed);
  const st = { claims: new Map(), nextShot: 0 };
  const achievements = new Set();
  const rows = [];
  let stats = null;
  let capOk = true;
  let steps = 0;
  let held = 0;
  let prevScore = 0;
  let prevDowned = 0;
  let prevShots = 0;
  let prevKilling = 0;

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
    if (eng.regionsHeld > held) {
      const shots = eng.shotsFired - prevShots;
      rows.push({
        name: REGIONS[held].name,
        clock: eng.time,
        downed: eng.threatsDowned - prevDowned,
        health: eng.health,
        hits: Math.round(((eng.killingShots - prevKilling) / Math.max(1, shots)) * 100),
        points: eng.score - prevScore,
        total: eng.score,
      });
      held = eng.regionsHeld;
      prevScore = eng.score;
      prevDowned = eng.threatsDowned;
      prevShots = eng.shotsFired;
      prevKilling = eng.killingShots;
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
  console.log("  region                    clock   downed   health   hit%   points    total");
  for (const r of rows) {
    console.log(
      `  ${r.name.padEnd(22)} ${r.clock.toFixed(1).padStart(6)}s ${String(r.downed).padStart(8)} ${String(r.health).padStart(8)} ${String(r.hits).padStart(6)} ${String(r.points).padStart(8)} ${String(r.total).padStart(8)}`,
    );
  }
  console.log(
    `  outcome: ${eng.phase}  steps ${steps}  shots ${eng.shotsFired}  downed ${eng.threatsDowned}  best burst ${eng.bestBurst}  accuracy ${eng.accuracyPct}%  final score ${eng.score}`,
  );
  console.log(`  achievements: ${[...achievements].sort().join(", ") || "(none)"}`);
  return { eng, achievements, capOk, stats, steps };
};

const ace = simulate(driveAce, "ace bot (leads every shot, ignores decoys)");
check(ace.eng.phase === "victory", "ace holds all three regions and reaches victory");
check(ace.steps < STEP_BUDGET, "ace finishes inside the 20-minute step budget");
check(ace.eng.score >= TUNE.legendScore, `ace scores at least ${TUNE.legendScore}`);
check(ace.capOk, "score never exceeds the cap (ace)");
check(ace.stats !== null, "gameover stats emitted (ace)");
if (ace.stats) {
  check(
    ace.stats.regions_held === REGIONS.length &&
      ace.stats.threats_downed > 0 &&
      ace.stats.best_burst > 0 &&
      ace.stats.accuracy_pct > 0,
    "gameover stats carry regions_held, threats_downed, best_burst, accuracy_pct",
  );
}
for (const slug of ["relay-held", "river-guardian", "observatory-held"]) {
  check(ace.achievements.has(slug), `${slug} fires in the ace run`);
}
check(ace.achievements.has("perfect-sky"), "perfect-sky fires in the ace run");

const sloppy = simulate(driveSloppy, "sloppy bot (no lead, half-second reaction)");
check(sloppy.eng.phase === "gameover", "sloppy bot loses a region and ends the run");
check(sloppy.steps < STEP_BUDGET, "sloppy bot dies inside the step budget");
check(sloppy.eng.score < TUNE.legendScore, "sloppy bot never reaches the legend score");
check(sloppy.stats !== null, "gameover stats emitted (sloppy)");

const repeat = simulate(driveAce, "ace bot rerun (same seed)");
check(
  repeat.eng.score === ace.eng.score &&
    repeat.eng.threatsDowned === ace.eng.threatsDowned &&
    repeat.steps === ace.steps,
  "two same-seed ace runs match on score, threats downed and steps",
);

// ---- staged skies --------------------------------------------------------

console.log("\nrule proofs");

const place = (eng, family, x, y, vy) => {
  const t = {
    id: eng.nextThreat++,
    family,
    baseX: x,
    y,
    vy,
    driftVx: 0,
    swayAmp: 0,
    swayRate: 0,
    phase: 0,
    targetX: x,
    wave: eng.waveIndex,
    diedAt: null,
    killed: false,
  };
  eng.threats.push(t);
  return t;
};

/**
 * Empties the sky and parks one harmless threat far off-canvas. The parked
 * threat belongs to the current wave, which stops checkWave from advancing
 * the script underneath a staged proof.
 */
const quiet = (eng) => {
  eng.threats = [];
  eng.interceptors = [];
  eng.bursts = [];
  eng.fx = [];
  eng.chains = [];
  eng.pending = [];
  eng.groups.clear();
  place(eng, BALLOON, -600, -300, 0);
};

const run = (eng, seconds) => {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    eng.update(DT);
    for (const e of eng.drainEvents()) {
      if (e.type === "achievement") allAchievements.add(e.slug);
    }
  }
};

const press = (eng, x, y) => {
  eng.input.aimX = x;
  eng.input.aimY = y;
  eng.input.fire = false;
  eng.update(DT);
  eng.input.fire = true;
  eng.update(DT);
  eng.input.fire = false;
};

// a led shot kills; the same shot aimed early or late misses
{
  const eng = new Engine();
  quiet(eng);
  const t = place(eng, POD, 400, 100, 200);
  const aim = lead(eng, t);
  eng.fire(aim.x, aim.y);
  run(eng, 1.2);
  check(eng.threatsDowned === 1, "a led shot kills the staged threat");
  console.log(`  lead: aim y ${aim.y.toFixed(1)}, travel ${aim.tf.toFixed(3)}s, downed ${eng.threatsDowned}`);

  const early = new Engine();
  quiet(early);
  const te = place(early, POD, 400, 100, 200);
  early.fire(threatX(te, early.time), te.y);
  run(early, 1.2);
  check(early.threatsDowned === 0, "the same shot with no lead bursts behind the threat");

  const late = new Engine();
  quiet(late);
  place(late, POD, 400, 100, 200);
  late.fire(400, 400);
  run(late, 1.2);
  check(late.threatsDowned === 0, "a shot aimed far ahead bursts before the threat arrives");
}

// an ember-mine chain propagates and the whole chain scores as one burst
{
  const eng = new Engine();
  quiet(eng);
  place(eng, MINE, 400, 200, 0);
  place(eng, MINE, 450, 200, 0);
  place(eng, MINE, 500, 200, 0);
  place(eng, POD, 550, 200, 0);
  const before = eng.score;
  eng.fire(400, 200);
  // Three staggered detonations settle the group at 1.70s.
  run(eng, 2.2);
  const points = FAMILIES[MINE].points * 3 + FAMILIES[POD].points;
  check(eng.threatsDowned === 4, "the mine chain reaches every link and the pod past it");
  check(eng.bestBurst === 4, "all four kills credit one burst");
  check(
    eng.score - before === points * TUNE.maxBurstMultiplier,
    "the chain scores its summed points times the burst multiplier",
  );
  check(allAchievements.has("shield-wall"), "shield-wall fires at four kills from one burst");
  console.log(
    `  chain: ${eng.threatsDowned} downed, best burst ${eng.bestBurst}, ${eng.score - before} pts`,
  );
}

// the burst multiplier stops at four
{
  const eng = new Engine();
  quiet(eng);
  for (let i = 0; i < 5; i++) place(eng, POD, 460 + i * 10, 200, 0);
  const before = eng.score;
  eng.fire(480, 200);
  run(eng, 1.0);
  check(eng.threatsDowned === 5, "one burst can take five clustered threats");
  check(
    eng.score - before === FAMILIES[POD].points * 5 * TUNE.maxBurstMultiplier,
    "a five-kill burst still multiplies by four",
  );
}

// a threat reaching a building costs its impact and flips the health tier
{
  const eng = new Engine();
  quiet(eng);
  eng.health = 78;
  place(eng, POD, BUILDING_X[1], GROUND_Y - 10, 200);
  run(eng, 0.4);
  check(eng.health === 66, "a seed pod on a building costs exactly its impact");
  check(tierForHealth(eng.health) === 1, "health 66 reads as the damaged tier");
  check(eng.regionDamage === 12, "the region tracks the damage it took");

  quiet(eng);
  eng.health = 45;
  place(eng, POD, BUILDING_X[2], GROUND_Y - 10, 200);
  run(eng, 0.4);
  check(eng.health === 33, "the second impact lands the health on 33");
  check(tierForHealth(eng.health) === 2, "health 33 reads as the destroyed tier");
  check(eng.phase === "playing", "a destroyed panel still keeps the region fighting");
  console.log(`  tiers: 78 to 66 to 33, phase ${eng.phase}`);
}

// a balloon decoy lands for nothing
{
  const eng = new Engine();
  quiet(eng);
  eng.health = 80;
  const downed = eng.threatsDowned;
  place(eng, BALLOON, 300, GROUND_Y - 10, 200);
  run(eng, 0.4);
  check(eng.health === 80, "a balloon decoy costs no health when it lands");
  check(eng.threatsDowned === downed, "a landed decoy is not counted as downed");
}

// the ninth shot fails until the reload finishes
{
  const eng = new Engine();
  quiet(eng);
  for (let i = 0; i < TUNE.magazine; i++) {
    press(eng, 480, 200);
    run(eng, TUNE.shotCooldown + 0.02);
  }
  check(eng.shotsFired === TUNE.magazine, "the magazine holds exactly eight shots");
  check(eng.reloading > 0, "emptying the magazine starts the reload");
  press(eng, 480, 200);
  check(eng.shotsFired === TUNE.magazine, "the ninth shot does not leave the battery");
  run(eng, TUNE.reloadTime + 0.1);
  check(eng.ammo === TUNE.magazine, "the reload refills the magazine");
  press(eng, 480, 200);
  check(eng.shotsFired === TUNE.magazine + 1, "the battery fires again once reloaded");
  console.log(`  magazine: ${eng.shotsFired} shots fired across one reload`);
}

// the accuracy bonus lands on the threshold and not below it
{
  const on = new Engine();
  on.health = 50;
  on.regionShots = 10;
  on.regionKillingShots = 8;
  const onBefore = on.score;
  on.enterRegionClear();
  const base = TUNE.regionClearBonus + 50 * TUNE.healthPointsEach;
  check(
    on.score - onBefore === base + TUNE.accuracyBonus,
    "eight killing shots in ten pays the accuracy bonus",
  );

  const off = new Engine();
  off.health = 50;
  off.regionShots = 10;
  off.regionKillingShots = 7;
  const offBefore = off.score;
  off.enterRegionClear();
  check(off.score - offBefore === base, "seven killing shots in ten pays no accuracy bonus");
  check(off.health === 80, "the region banner repairs thirty health");
  console.log(`  accuracy: 0.8 pays ${TUNE.accuracyBonus}, 0.7 pays 0`);
}

// forced maximum bursts never push the score past the cap
{
  const eng = new Engine();
  eng.score = TUNE.scoreCap - 10;
  for (let i = 0; i < 12; i++) {
    quiet(eng);
    eng.ammo = TUNE.magazine;
    eng.reloading = 0;
    eng.cooldown = 0;
    for (let k = 0; k < 5; k++) place(eng, SKIFF, 460 + k * 10, 200, 0);
    eng.fire(480, 200);
    run(eng, 1.0);
    if (eng.score !== TUNE.scoreCap) break;
  }
  check(eng.score === TUNE.scoreCap, "repeated maximum bursts clamp at the cap");
  console.log(`  cap: score held at ${eng.score} through twelve forced bursts`);
}

// ---- achievements --------------------------------------------------------

for (const slug of [
  "first-intercept",
  "relay-held",
  "river-guardian",
  "observatory-held",
  "shield-wall",
  "perfect-sky",
  "defense-legend",
]) {
  check(allAchievements.has(slug), `${slug} fires in simulation`);
}

// ---- seed spread ---------------------------------------------------------

console.log("\nace across five more seeds");
const spread = [];
for (const seed of [0x1f3a5c, 0x2b7e91, 0x44c0d3, 0x5ae217, 0x7d9b4f]) {
  const label = `ace bot (seed 0x${seed.toString(16)})`;
  const runOut = simulate(driveAce, label, seed);
  check(runOut.eng.phase === "victory", `ace reaches victory on seed 0x${seed.toString(16)}`);
  check(
    runOut.eng.score >= TUNE.legendScore,
    `ace clears the legend score on seed 0x${seed.toString(16)}`,
  );
  spread.push(runOut.eng.score);
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
