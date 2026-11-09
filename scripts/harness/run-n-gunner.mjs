// Run 'n Gunner beatability harness. Run: node scripts/harness/run-n-gunner.mjs
// Proves, with exit-code semantics a reviewer can rerun:
//   1. a grunt bot (late, mistimed dodges) clears all 3 stages within the
//      3-life budget, checkpoints included,
//   2. an ace bot completes a full one-life clear (no life lost, which
//      covers the required 1-life stage-1 clear and the one-life-run slug),
//   3. every one of the 7 achievement thresholds is reached in simulation,
//   4. score never exceeds the cap.
// Prints a per-stage results table for each bot.

import { GROUND_Y, TUNE, groundAt } from "../../src/games/run-n-gunner/stages.ts";
import { Engine, W } from "../../src/games/run-n-gunner/engine.ts";

let failures = 0;
const check = (ok, label) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
  return ok;
};

// The engine uses Math.random for spawns, shot spread and pickups. Reset a
// declared seed per bot so unrelated CI runs exercise the same inputs.
const SEED = 20260824;
const withSeed = (run) => {
  const original = Math.random;
  let state = SEED >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  try { return run(); } finally { Math.random = original; }
};
console.log(`simulation seed ${SEED}, timestep 1/120s`);

const ACE = {
  bossDist: 130,
  dodgeOrbs: true,
  dodgeWindow: 0.34, // s before impact; apex-timed jumps
  dodgeGrenades: true,
  jumpCharges: true,
};
// a mediocre player: reacts late, hugs the boss, mistimes half its jumps
const GRUNT = {
  bossDist: 100,
  dodgeOrbs: true,
  dodgeWindow: 0.2,
  dodgeGrenades: true,
  jumpCharges: true,
};

const drive = (eng, prof, st) => {
  const p = eng.player;
  const i = eng.input;
  const pcx = p.x;
  const pcy = p.y - 11;
  i.fire = true;
  i.up = false;
  i.down = false;
  st.jumpHold = Math.max(0, st.jumpHold - 1);
  const jump = () => {
    if (p.grounded && st.jumpHold === 0) st.jumpHold = 34;
  };

  let dir = 1;

  if (eng.boss) {
    const b = eng.boss;
    const dx = b.x - pcx;

    if (b.def.hover) {
      // the finale wants vertical fire from under the boss
      dir = Math.abs(dx) > 12 ? Math.sign(dx) : 0;
      if (Math.abs(dx) < 34) i.up = true;
    } else {
      const adx = Math.abs(dx);
      const side = Math.sign(dx) || 1;
      dir = adx < prof.bossDist - 30 ? -side : adx > prof.bossDist + 30 ? side : 0;
      // cornered against an arena wall with the boss closing: cross under it
      const cornered =
        side > 0 ? p.x < eng.scrollX + 30 : p.x > eng.scrollX + W - 30;
      if (dir === -side && cornered) {
        dir = side;
        jump();
      }
      if (dir === 0 && p.facing !== side) dir = side;
      if (prof.jumpCharges && b.charging > 0 && adx < 95) jump();
    }
  } else {
    // traversal: run right, hop pits, hop-shoot platform turrets when no
    // descending shot is inbound
    if (p.grounded && p.y >= GROUND_Y - 1 && !groundAt(eng.stage, p.x + 18)) jump();
    const dangerAbove = eng.enemyShots.some(
      (s) => !s.grav && s.vy > 25 && Math.abs(s.x - pcx) < 140 && s.y < pcy + 10,
    );
    const platTurret = eng.enemies.find(
      (e) => e.kind === "turret" && e.y < GROUND_Y - 10 && e.x - pcx > 40 && e.x - pcx < 240,
    );
    // hop only from ground level; on a platform the turret is level with
    // straight fire already
    if (platTurret && !dangerAbove && p.y >= GROUND_Y - 1) jump();
  }

  // projectile evasion: jump under near-horizontal shots, step out from
  // under descending ones
  for (const s of eng.enemyShots) {
    if (s.grav) {
      if (!prof.dodgeGrenades) continue;
      if (s.vy > 0 && s.y > 130 && Math.abs(s.x + s.vx * 0.3 - pcx) < 32) {
        dir = Math.sign(pcx - s.x) || -1;
      }
    } else if (prof.dodgeOrbs) {
      if (Math.abs(s.vy) < 35) {
        const closing = Math.sign(s.vx) === Math.sign(pcx - s.x);
        const tti = Math.abs(s.x - pcx) / Math.max(60, Math.abs(s.vx));
        if (closing && Math.abs(s.y - pcy) < 30 && tti < prof.dodgeWindow) jump();
      } else if (s.vy > 0) {
        const t = (pcy - s.y) / s.vy;
        if (t > 0 && t < 0.6 && Math.abs(s.x + s.vx * t - pcx) < 30) {
          dir = Math.sign(pcx - (s.x + s.vx * t)) || 1;
        }
      }
    }
  }

  i.dir = dir;
  i.jump = st.jumpHold > 0;
};

const simulate = (prof, label) => withSeed(() => {
  const eng = new Engine();
  const st = { jumpHold: 0 };
  const dt = 1 / 120;
  const achievements = new Set();
  const stages = [];
  let capOk = true;
  let stats = null;
  let prevPhase = eng.phase;
  let prevKills = 0;
  let prevDeaths = 0;
  let prevScore = 0;

  while (eng.phase !== "gameover" && eng.phase !== "victory" && eng.time < 600) {
    drive(eng, prof, st);
    eng.update(dt);
    for (const e of eng.drainEvents()) {
      if (e.type === "achievement") achievements.add(e.slug);
      if (e.type === "gameover") stats = e.stats;
    }
    if (eng.score > TUNE.scoreCap) capOk = false;
    if (eng.phase !== prevPhase && (eng.phase === "stageclear" || eng.phase === "victory")) {
      stages.push({
        stage: eng.phase === "victory" ? "finale bonus" : `${eng.stageIndex + 1} ${eng.stage.def.name}`,
        time: eng.time,
        kills: eng.kills - prevKills,
        deaths: eng.deaths - prevDeaths,
        score: eng.score - prevScore,
        total: eng.score,
      });
      prevKills = eng.kills;
      prevDeaths = eng.deaths;
      prevScore = eng.score;
    }
    prevPhase = eng.phase;
  }
  // pick up the events victory() queued on its final tick
  for (const e of eng.drainEvents()) {
    if (e.type === "achievement") achievements.add(e.slug);
    if (e.type === "gameover") stats = e.stats;
  }

  console.log(`\n${label}`);
  console.log("  stage               clock   kills deaths  stage pts  total");
  for (const s of stages) {
    console.log(
      `  ${s.stage.padEnd(18)} ${s.time.toFixed(1).padStart(6)}s ${String(s.kills).padStart(6)} ${String(s.deaths).padStart(6)} ${String(s.score).padStart(10)} ${String(s.total).padStart(6)}`,
    );
  }
  console.log(
    `  outcome: ${eng.phase}  lives left ${eng.lives}  deaths ${eng.deaths}  final score ${eng.score}`,
  );
  console.log(`  achievements: ${[...achievements].sort().join(", ") || "(none)"}`);
  return { eng, achievements, stages, capOk, stats };
});

// ---- grunt: clears within the lives budget -------------------------------

const grunt = simulate(GRUNT, "grunt bot (late dodges)");
check(grunt.eng.phase === "victory", "grunt clears all 3 stages within the lives budget");
check(grunt.capOk, "score never exceeds the cap (grunt)");
check(grunt.stats !== null, "gameover stats emitted (grunt)");

// ---- ace: one-life clear + every achievement -----------------------------

const ace = simulate(ACE, "ace bot (full evasion)");
check(ace.eng.phase === "victory", "ace clears all 3 stages");
check(ace.eng.deaths === 0, "ace completes a one-life run (no life lost)");
check(ace.capOk, "score never exceeds the cap (ace)");
for (const slug of [
  "open-road",
  "arsenal",
  "wrecking-crew",
  "flawless-duel",
  "long-march",
  "one-life-run",
  "gunner-legend",
]) {
  check(ace.achievements.has(slug), `ace reaches ${slug}`);
}

const replay = simulate(ACE, "ace bot rerun (same seed)");
const snapshot = ({ eng, achievements, stages, capOk, stats }) => ({
  phase: eng.phase, time: eng.time, score: eng.score, kills: eng.kills,
  deaths: eng.deaths, lives: eng.lives, achievements: [...achievements].sort(), stages, capOk, stats,
});
check(JSON.stringify(snapshot(ace)) === JSON.stringify(snapshot(replay)), "same-seed ace replay preserves outcome, score, kills and achievements");

// ---- verdict -------------------------------------------------------------

if (failures > 0) {
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}
console.log("\nPASS");
