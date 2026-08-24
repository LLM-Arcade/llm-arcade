// Hyper Circuit beatability harness. Run: node scripts/harness/hyper-circuit.mjs
// Proves, with exit code semantics a reviewer can rerun:
//   1. every circuit passes the geometry gate (no self-overlap, driveable
//      curvature),
//   2. an ace bot finishes a 3-lap race on every circuit and wins circuit 1,
//   3. a full ace grand prix reaches every achievement except clean-circuit,
//   4. a cautious cruiser bot proves clean-circuit on circuit 1,
//   5. score never exceeds the cap.
// Pass --calibrate to print suggested parLap values from ace lap medians.

import {
  COURSES,
  buildTrack,
  curvatureAt,
  trackPos,
} from "../../src/games/hyper-circuit/courses.ts";
import { Engine, LAPS, TUNE } from "../../src/games/hyper-circuit/engine.ts";

const CAL = process.argv.includes("--calibrate");
let failures = 0;
const check = (ok, label) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
  return ok;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// ---- 1. geometry gate ----------------------------------------------------

console.log("geometry gate");
for (const def of COURSES) {
  const t = buildTrack(def);
  const hw = def.halfWidth;
  let maxCurv = 0;
  for (let i = 0; i < t.n; i++) maxCurv = Math.max(maxCurv, t.curv[i]);

  // pairs far apart along the lap must stay far apart in the plane
  const arcWindow = Math.max(6 * t.step, 2.5 * hw);
  const need = 2.2 * hw;
  let minSep = Infinity;
  for (let i = 0; i < t.n; i++) {
    for (let j = i + 1; j < t.n; j++) {
      const arc = Math.min((j - i) * t.step, t.total - (j - i) * t.step);
      if (arc <= arcWindow) continue;
      const dx = t.pts[2 * i] - t.pts[2 * j];
      const dy = t.pts[2 * i + 1] - t.pts[2 * j + 1];
      const d = Math.hypot(dx, dy);
      if (d < minSep) minSep = d;
    }
  }

  console.log(
    `  ${def.name.padEnd(15)} lap ${t.total.toFixed(0).padStart(4)}u  ` +
      `curv*hw ${(maxCurv * hw).toFixed(3)}  minSep ${minSep.toFixed(1)}/${need.toFixed(1)}`,
  );
  check(maxCurv * hw < 0.5, `${def.name}: curvature vs width`);
  check(minSep > need, `${def.name}: self-overlap`);
}

// ---- bots ----------------------------------------------------------------

const drive = (eng, profile) => {
  const t = eng.track;
  const p = eng.player;

  const L = clamp(p.speed * 0.55, 60, 220) * profile.lookScale;
  const tp = trackPos(t, (p.s + L) % t.total);
  const desired = Math.atan2(tp.y - p.y, tp.x - p.x);
  eng.input.steer = clamp(wrapAngle(desired - p.heading) * 3, -1, 1);

  let worst = 1e-6;
  const ahead = Math.max(150, p.speed * profile.brakeHorizon);
  for (let k = 20; k <= ahead; k += 16) {
    worst = Math.max(worst, curvatureAt(t, (p.s + k) % t.total));
  }
  // invert steady-state yaw capability: v where yaw(v)/v = worst * margin
  const vLimit =
    TUNE.yawRate /
    (worst * profile.margin + (TUNE.yawRate * TUNE.yawHighSpeedScale) / TUNE.maxSpeed);
  eng.input.accel = p.speed < vLimit;
  eng.input.brake = p.speed > vLimit * 1.08;

  // the horizon covers a full burn at boost speed so a straightaway
  // ignition cannot carry into the next corner
  let farWorst = 1e-6;
  for (let k = 20; k <= 560; k += 24) {
    farWorst = Math.max(farWorst, curvatureAt(t, (p.s + k) % t.total));
  }
  // a rail hit inside a burn spoils the clean bonus, so wait out the
  // wobble after any contact before igniting again
  if (eng.railHits !== drive.lastRails) {
    drive.lastRails = eng.railHits;
    drive.railAt = eng.time;
  }
  eng.input.boost =
    profile.boost &&
    !eng.isBoosting &&
    eng.phase === "racing" &&
    eng.time - drive.railAt > 0.6 &&
    farWorst < profile.boostCurv &&
    p.shield > profile.boostShield;
};
drive.lastRails = 0;
drive.railAt = -9;

const ACE = {
  lookScale: 1,
  margin: 1.2,
  brakeHorizon: 1.15,
  boost: true,
  boostCurv: 0.0028,
  boostShield: 55,
};
const CRUISER = {
  lookScale: 1.25,
  margin: 1.7,
  brakeHorizon: 1.5,
  boost: false,
  boostCurv: 0,
  boostShield: 101,
};

const simulate = (profile, { stopAfterRaces = Infinity } = {}) => {
  drive.lastRails = 0;
  drive.railAt = -9;
  const eng = new Engine();
  const dt = 1 / 120;
  const achievements = new Set();
  const races = [];
  let prevPhase = eng.phase;
  let prevRails = 0;
  let prevClean = 0;
  let capOk = true;
  let stats = null;

  while (eng.phase !== "gameover" && eng.time < 900) {
    drive(eng, profile);
    eng.update(dt);
    for (const e of eng.drainEvents()) {
      if (e.type === "achievement") achievements.add(e.slug);
      if (e.type === "gameover") stats = e.stats;
    }
    if (eng.score > TUNE.scoreCap) capOk = false;
    if (eng.phase === "finished" && prevPhase === "racing") {
      races.push({
        circuit: eng.track.def.name,
        par: eng.track.def.parLap,
        laps: [...eng.lapTimes],
        pos: eng.position,
        shield: Math.round(eng.player.shield),
        rails: eng.railHits - prevRails,
        cleanBoosts: eng.cleanBoosts - prevClean,
        score: eng.score,
      });
      prevRails = eng.railHits;
      prevClean = eng.cleanBoosts;
      if (races.length >= stopAfterRaces) break;
    }
    prevPhase = eng.phase;
  }
  return { eng, achievements, races, capOk, stats };
};

const printRaces = (races) => {
  console.log(
    "  circuit          laps (s)              par   pos  shield rails boosts score",
  );
  for (const r of races) {
    const laps = r.laps.map((l) => l.toFixed(2)).join(" ");
    console.log(
      `  ${r.circuit.padEnd(15)} ${laps.padEnd(21)} ${String(r.par).padStart(4)}  ` +
        `${String(r.pos).padStart(2)}   ${String(r.shield).padStart(4)}  ` +
        `${String(r.rails).padStart(4)} ${String(r.cleanBoosts).padStart(5)}  ${r.score}`,
    );
  }
};

// ---- 2 + 3. ace grand prix ----------------------------------------------

console.log("\nace grand prix");
const ace = simulate(ACE);
printRaces(ace.races);
console.log(
  `  final score ${ace.eng.score}  achievements: ${[...ace.achievements].sort().join(", ")}`,
);

check(ace.races.length === 3, "ace finishes all three circuits");
for (const r of ace.races) {
  check(r.laps.length === LAPS, `ace completes ${LAPS} laps on ${r.circuit}`);
}
check(ace.races[0]?.pos === 1, "ace wins circuit 1");
check(ace.capOk, "score never exceeds the cap (ace)");
check(ace.stats !== null, "gameover stats emitted");
for (const slug of [
  "first-finish",
  "front-runner",
  "ghost-chaser",
  "boost-artist",
  "grand-circuit",
  "circuit-legend",
]) {
  check(ace.achievements.has(slug), `ace reaches ${slug}`);
}

if (CAL) {
  console.log("\ncalibration (par = ace median lap * 1.12, rounded to 0.5)");
  ace.races.forEach((r) => {
    const sorted = [...r.laps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    console.log(
      `  ${r.circuit.padEnd(15)} median ${median.toFixed(2)}  suggested parLap ${
        Math.round(median * 1.12 * 2) / 2
      }`,
    );
  });
}

// ---- 4. cruiser proves clean-circuit ------------------------------------

console.log("\ncruiser, circuit 1 only");
const cruiser = simulate(CRUISER, { stopAfterRaces: 1 });
printRaces(cruiser.races);
check(cruiser.races.length === 1, "cruiser finishes circuit 1");
check(cruiser.races[0]?.rails === 0, "cruiser takes zero rail hits");
check(cruiser.achievements.has("clean-circuit"), "cruiser reaches clean-circuit");
check(cruiser.achievements.has("first-finish"), "cruiser reaches first-finish");
check(cruiser.capOk, "score never exceeds the cap (cruiser)");

// ---- verdict -------------------------------------------------------------

if (failures > 0) {
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}
console.log("\nPASS");
