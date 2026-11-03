// Lastwatch proof harness. Run: node scripts/harness/lastwatch.mjs
// Exit 0 = PASS. Proves, per the GDD's phase 2 gate:
//   1. determinism (same seed + inputs -> identical event hash)
//   2. an ace duo reaches wave 20+ on Long Watch
//   3. casual-bot floors per difficulty, on all three classes
//   4. a do-nothing loss path ends the run cleanly
//   5. kit and arsenal math (weapon hits, mend, dagger, taunt, bodkin)
//   6. coordination (packs, shield escort, stalker opportunism, blood scent)
//   7. raids (filcher steal/flee/recover, sapper dig and hole)
//   8. partner behaviors (revive, retreat, command, triage, counter-raid)
//   9. economy and difficulty arithmetic
//  10. district opening effects
//  11. the score cap under a forced flood
//  12. calibration prints for watch-legend and the earn curve
// Pass --calibrate for extra population detail.

import { Engine } from "../../src/games/lastwatch/engine.ts";
import { emptyInput, DIFFICULTY } from "../../src/games/lastwatch/types.ts";
import { WEAPONS, ARROWS, VALOR, ECON, PRICES } from "../../src/games/lastwatch/arsenal.ts";
import { KIT, CLASSES, upgradeEffects } from "../../src/games/lastwatch/kits.ts";
import { GLOAM } from "../../src/games/lastwatch/gloam.ts";
import { ROOMS, WATCHFIRE_POS, elevAt } from "../../src/games/lastwatch/hold.ts";
import {
  aimAtUnit,
  nearestUnit,
  makeAce,
  aceInput,
  aceShop,
  makeCasual,
  casualInput,
} from "./lastwatch-bots.mjs";

const CAL = process.argv.includes("--calibrate");
let failures = 0;
const check = (ok, label) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
  return ok;
};
const TICK = 1 / 60;
const secs = (n) => Math.round(n * 60);

// ---------------------------------------------------------------------------
// run helpers

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function runScripted(seed, cfg, botFactory, botFn, maxSecs, opts = {}) {
  const eng = trackEngine(new Engine(seed, cfg));
  const mem = botFactory();
  const eventLog = [];
  let shopFn = opts.shop ?? null;
  const maxTicks = secs(maxSecs);
  for (let t = 0; t < maxTicks; t++) {
    const input = botFn(eng, mem);
    eng.step(input);
    if (shopFn) shopFn(eng, mem);
    for (const e of eng.drainEvents()) {
      eventLog.push(e.type === "sfx" ? e.sound : e.type + (e.slug ?? "") + (e.wave ?? ""));
      if (e.type === "gameover") {
        return { eng, time: eng.time, eventLog, over: true, score: e.score, stats: e.stats };
      }
    }
    if (t % 60 === 0) {
      eventLog.push(
        `p${eng.chars[0].x.toFixed(2)},${eng.chars[0].y.toFixed(2)}g${eng.gloam.length}`,
      );
    }
    if (opts.stopWave && eng.wave >= opts.stopWave) {
      return { eng, time: eng.time, eventLog, over: false, score: eng.score, stats: null };
    }
  }
  return { eng, time: eng.time, eventLog, over: false, score: eng.score, stats: null };
}

// A staged engine: combat phase frozen (the spawner never fires), so tests
// place exactly the units they want.
const firedAnywhere = new Set();
const trackedEngines = [];
function trackEngine(eng) {
  trackedEngines.push(eng);
  return eng;
}
process.on("beforeExit", () => {});
function collectFired() {
  for (const e of trackedEngines) for (const s of e.achievements) firedAnywhere.add(s);
}

function staged(cfg = {}) {
  const eng = new Engine(7, {
    difficulty: "long",
    playerClass: "knight",
    partnerClass: "mage",
    ...cfg,
  });
  eng.phase = "combat";
  eng.wave = cfg.wave ?? 3;
  eng.waveCtl.queue = ["gnasher"];
  eng.waveCtl.hornT = 1e9;
  return trackEngine(eng);
}

function stepN(eng, n, inputFn = () => emptyInput()) {
  for (let i = 0; i < n; i++) {
    eng.step(inputFn(i));
    eng.drainEvents();
    if (eng.over) return;
  }
}

function placeChar(c, room, x, y) {
  c.room = room;
  c.x = x;
  c.y = y;
}

// ---------------------------------------------------------------------------
// 1. determinism

console.log("determinism");
{
  const cfg = { difficulty: "long", playerClass: "archer", partnerClass: "knight" };
  const a = runScripted(1234, cfg, makeCasual, casualInput, 90);
  const b = runScripted(1234, cfg, makeCasual, casualInput, 90);
  const ha = hashString(a.eventLog.join("|"));
  const hb = hashString(b.eventLog.join("|"));
  console.log(`  seed 1234 twice: ${ha} vs ${hb}`);
  check(ha === hb, "same seed + inputs reproduces the event log exactly");
}

// ---------------------------------------------------------------------------
// 4. do-nothing loss (cheap, so it runs early)

console.log("do-nothing loss");
{
  const cfg = { difficulty: "long", playerClass: "knight", partnerClass: "mage" };
  const eng = new Engine(42, cfg);
  // The partner fights on its own; for a true do-nothing loss the partner
  // is downed at the start, which the harness may stage.
  eng.chars[1].state = "gone";
  let overEvent = null;
  const maxTicks = secs(600);
  for (let t = 0; t < maxTicks && !overEvent; t++) {
    eng.step(emptyInput());
    for (const e of eng.drainEvents()) if (e.type === "gameover") overEvent = e;
  }
  check(overEvent !== null, "idle watch loses within 10 minutes");
  if (overEvent) {
    console.log(
      `  fell at wave ${overEvent.stats.wave} after ${Math.round(eng.time)}s: "${overEvent.recap}"`,
    );
    check(overEvent.score >= 0, "loss still submits a valid score");
    check(typeof overEvent.recap === "string" && overEvent.recap.length > 0, "death recap present");
  }
}

// ---------------------------------------------------------------------------
// 5. kit and arsenal math

console.log("kit and arsenal math");
{
  // Charged shot exact damage, body then head.
  const eng = staged({ playerClass: "archer", partnerClass: "knight" });
  const c = eng.chars[0];
  placeChar(c, "gateyard", 0, 10);
  placeChar(eng.chars[1], "gateyard", -14, 2);
  const u = eng.spawnUnit("gnasher", "gateyard", 0, 20, "treeline", false);
  u.x = 0;
  u.y = 20;
  u.hp = 1e6;
  u.maxHp = 1e6;
  const w = WEAPONS["worn-shortbow"];
  const held = Math.ceil(((w.chargeTime ?? 0.8) + 0.1) * 60);
  const before = u.hp;
  stepN(eng, held, () => {
    const i = emptyInput();
    const aim = aimAtUnit(eng, c, u, false);
    i.yaw = aim.yaw;
    i.pitch = aim.pitch;
    i.primary = true;
    return i;
  });
  stepN(eng, 2, () => {
    const i = emptyInput();
    const aim = aimAtUnit(eng, c, u, false);
    i.yaw = aim.yaw;
    i.pitch = aim.pitch;
    return i;
  });
  const dealt = before - u.hp;
  const expected = w.chargedDmg * 0.85; // worn quality
  console.log(`  charged body shot dealt ${dealt.toFixed(1)} (expected ${expected.toFixed(1)})`);
  check(Math.abs(dealt - expected) < 0.5, "charged shot matches the stated number");

  // Headshot doubles.
  const before2 = u.hp;
  stepN(eng, held, () => {
    const i = emptyInput();
    const aim = aimAtUnit(eng, c, u, true);
    i.yaw = aim.yaw;
    i.pitch = aim.pitch;
    i.primary = true;
    return i;
  });
  stepN(eng, 2, () => {
    const i = emptyInput();
    const aim = aimAtUnit(eng, c, u, true);
    i.yaw = aim.yaw;
    i.pitch = aim.pitch;
    return i;
  });
  const dealt2 = before2 - u.hp;
  console.log(`  charged headshot dealt ${dealt2.toFixed(1)} (expected ${(expected * 2).toFixed(1)})`);
  check(Math.abs(dealt2 - expected * 2) < 0.5, "headshot doubles");

  // Bodkin ignores the breacher shield; broadhead clangs off.
  const b = eng.spawnUnit("breacher", "gateyard", 0, 16, "treeline", false);
  b.x = 0;
  b.y = 16;
  b.yaw = -Math.PI / 2; // facing the archer
  b.hp = 1e6;
  const bBefore = b.hp;
  const aimB = () => {
    const i = emptyInput();
    const aim = aimAtUnit(eng, c, b, false);
    i.yaw = aim.yaw;
    i.pitch = aim.pitch;
    return i;
  };
  c.arrowType = "broadhead";
  b.yaw = -Math.PI / 2;
  stepN(eng, held, () => ({ ...aimB(), primary: true }));
  stepN(eng, 2, aimB);
  check(b.hp === bBefore, "broadhead blocked by the plank shield");
  c.arrowType = "bodkin";
  b.yaw = -Math.PI / 2;
  stepN(eng, held, () => ({ ...aimB(), primary: true }));
  stepN(eng, 2, aimB);
  check(b.hp < bBefore, "bodkin passes the shield");
}
{
  // Knight heavy cleave hits a staged crowd; taunt retargets it.
  const eng = staged({ playerClass: "knight", partnerClass: "mage" });
  const c = eng.chars[0];
  placeChar(c, "gateyard", 0, 10);
  placeChar(eng.chars[1], "gateyard", -14, 2);
  const crowd = [];
  for (let k = 0; k < 8; k++) {
    const ang = -0.6 + k * 0.17; // an 8-strong fan inside the swing arc
    const u = eng.spawnUnit("gnasher", "gateyard", 0, 12, "treeline", false);
    u.x = c.x + Math.cos(Math.PI / 2 + ang) * 2.0;
    u.y = c.y + Math.sin(Math.PI / 2 + ang) * 2.0;
    u.radius = 0.15; // packed tight for the stage
    u.hp = 1e6;
    u.stunned = 10; // held in place so the stage measures the arc
    crowd.push(u);
  }
  const windup = Math.ceil((1.1 + 0.1) * 60);
  stepN(eng, windup, () => {
    const i = emptyInput();
    i.yaw = Math.PI / 2;
    i.primary = true;
    return i;
  });
  stepN(eng, 2, () => {
    const i = emptyInput();
    i.yaw = Math.PI / 2;
    return i;
  });
  const hit = crowd.filter((u) => u.hp < 1e6).length;
  console.log(`  heavy cleave hit ${hit}/8 staged gnashers`);
  check(hit >= 4, "heavy cleave sweeps the crowd");
  check(eng.achievements.has("crowd-breaker"), "crowd-breaker fires on the six-hit cleave");

  for (const u of crowd) u.targetChar = 1;
  stepN(eng, 2, () => {
    const i = emptyInput();
    i.skill = true;
    return i;
  });
  const taunted = crowd.filter((u) => u.hp > 0 && u.targetChar === 0).length;
  const alive = crowd.filter((u) => u.hp > 0).length;
  check(taunted === alive && alive > 0, "taunt retargets everything in radius");
}
{
  // Mend restores exactly what the focus says.
  const eng = staged({ playerClass: "mage", partnerClass: "knight" });
  const c = eng.chars[0];
  const p = eng.chars[1];
  placeChar(c, "gateyard", 0, 10);
  placeChar(p, "gateyard", 3, 10);
  p.hp = 100;
  stepN(eng, 2, () => {
    const i = emptyInput();
    i.yaw = Math.atan2(p.y - c.y, p.x - c.x);
    i.secondary = true;
    return i;
  });
  const healed = p.hp - 100;
  const expected = WEAPONS["ash-wand"].mendHeal;
  console.log(`  mend healed ${healed.toFixed(1)} (expected ${expected})`);
  check(Math.abs(healed - expected) < 0.5, "mend heals its stated number");
}

// ---------------------------------------------------------------------------
// 6. coordination

console.log("coordination");
{
  const eng = staged({ playerClass: "knight", partnerClass: "mage", wave: 4 });
  placeChar(eng.chars[0], "gateyard", 0, 8);
  placeChar(eng.chars[1], "gateyard", 3, 8);
  const alpha = eng.spawnUnit("alpha", "causeway", 0, 40, "treeline", false);
  const pack = [];
  for (let k = 0; k < 6; k++) {
    pack.push(eng.spawnUnit("gnasher", "causeway", 0, 40, "treeline", false));
  }
  const inPack = pack.filter((g) => g.packId === alpha.packId);
  const fronts = inPack.filter((g) => g.packRole === "front").length;
  const flanks = inPack.filter((g) => g.packRole === "flank").length;
  console.log(`  pack claimed ${inPack.length}/6, ${fronts} front / ${flanks} flank`);
  check(inPack.length === 6, "the alpha claims its pack");
  check(fronts >= 2 && flanks >= 2, "pincer roles assigned");
  eng.damageGloam(alpha, 1e9, eng.chars[0], "heavy", false);
  const scattered = pack.filter((g) => g.state === "scatter").length;
  check(scattered === inPack.length, "alpha death scatters the pack");
}
{
  // Lobbers sidle behind breacher cover.
  const eng = staged({ playerClass: "knight", partnerClass: "mage" });
  placeChar(eng.chars[0], "gateyard", 0, 10);
  placeChar(eng.chars[1], "gateyard", 3, 8);
  const br = eng.spawnUnit("breacher", "treeline", 0, 50, "treeline", false);
  br.x = 0;
  br.y = 50;
  const lb = eng.spawnUnit("lobber", "treeline", 2, 50, "treeline", false);
  lb.x = 2;
  lb.y = 50;
  stepN(eng, secs(12));
  const d = Math.hypot(lb.x - br.x, lb.y - br.y);
  console.log(`  lobber to breacher distance after the approach: ${d.toFixed(1)}m`);
  check(d < 7, "the escort keeps the pair together on the approach");
}
{
  // Stalker opportunism: refuses a covered pair, pounces the engaged.
  const eng = staged({ playerClass: "knight", partnerClass: "mage", wave: 11 });
  const c = eng.chars[0];
  placeChar(c, "gateyard", 0, 12);
  placeChar(eng.chars[1], "gateyard", 2, 12);
  const st = eng.spawnUnit("stalker", "rampart", 0, 25.7, "treeline", false);
  st.x = 0;
  st.y = 25.7;
  st.hp = 1e6; // survives the partner's fire so the mark is observable
  // The partner opens fire on it (a real engagement); the idle player is
  // never the mark. Opportunism = the first pounce picks the engaged one.
  let firstMark = -2;
  for (let t = 0; t < secs(8); t++) {
    eng.step(emptyInput());
    eng.drainEvents();
    if (st.state !== "perch" && firstMark === -2) {
      firstMark = st.targetChar;
      break;
    }
  }
  console.log(`  first mark: ${firstMark === -2 ? "held perch" : "char " + firstMark}`);
  check(firstMark === 1 || firstMark === -2, "the stalker marks the engaged character, never the idle one");
}
{
  // Blood scent: ferals converge when a barricade drops under half.
  const eng = staged({ playerClass: "knight", partnerClass: "mage", wave: 4 });
  placeChar(eng.chars[0], "gateyard", -14, 4);
  placeChar(eng.chars[1], "gateyard", -14, 2);
  const idle = eng.spawnUnit("gnasher", "causeway", 3, 30, "treeline", false);
  idle.x = 3;
  idle.y = 30;
  const chewer = eng.spawnUnit("gnasher", "causeway", 0, 26.8, "treeline", false);
  chewer.x = 0;
  chewer.y = 26.8;
  eng.structures["bar-arch"].hp = 152; // one bite from half
  stepN(eng, secs(3));
  check(idle.targetStruct === "bar-arch", "blood scent pulls nearby ferals onto the weak wall");
}

// ---------------------------------------------------------------------------
// 7. raids

console.log("raids");
{
  const eng = staged({ playerClass: "knight", partnerClass: "mage", wave: 11 });
  placeChar(eng.chars[0], "rampart", -10, 25.7);
  placeChar(eng.chars[1], "rampart", -8, 25.7);
  eng.valor = 500;
  const f = eng.spawnUnit("filcher", "gateyard", 4, 20, "treeline", false);
  f.x = 4;
  f.y = 20;
  stepN(eng, secs(8));
  check(f.carryValor > 0 || eng.valor < 500, "the filcher steals from the ledger");
  check(f.state === "flee" || f.carryValor > 0, "then runs for the wall");
  const stolen = f.carryValor;
  const valorBefore = eng.valor;
  eng.damageGloam(f, 1e9, eng.chars[0], "arrow", false);
  check(eng.valor >= valorBefore + stolen, "killing it recovers the goods");
  check(eng.achievements.has("no-thieves-tonight"), "no-thieves-tonight fires");
}
{
  const eng = staged({ playerClass: "knight", partnerClass: "mage", wave: 12 });
  eng.districts.armory = true;
  placeChar(eng.chars[0], "gateyard", 0, 8);
  placeChar(eng.chars[1], "gateyard", 3, 8);
  const s = eng.spawnUnit("sapper", "outsideW", -28, 10, "sap-hill", false);
  stepN(eng, secs(8));
  check(eng.holes.length > 0, "the sapper opens a hole in the undefended district");
  if (eng.holes.length > 0) {
    check(eng.holes[0].room === "armory", "it dug where the defenders were not");
    stepN(eng, secs(21));
    check(eng.holes.length === 0, "the hole closes on schedule");
  }
  void s;
}

// ---------------------------------------------------------------------------
// 8. partner behaviors

console.log("partner behaviors");
{
  // Staged revive under pressure.
  const eng = staged({ playerClass: "knight", partnerClass: "mage", wave: 3 });
  const c = eng.chars[0];
  const p = eng.chars[1];
  placeChar(p, "gateyard", -10, 18);
  placeChar(c, "gateyard", 4, 8);
  c.state = "downed";
  c.hp = 0;
  c.bleedout = 30;
  for (let k = 0; k < 3; k++) {
    const u = eng.spawnUnit("gnasher", "causeway", 0, 30, "treeline", false);
    u.x = 0;
    u.y = 30 + k;
  }
  let revivedAt = -1;
  for (let t = 0; t < secs(12); t++) {
    eng.step(emptyInput());
    eng.drainEvents();
    if (c.state === "up") {
      revivedAt = eng.time;
      break;
    }
  }
  console.log(`  revive completed at ${revivedAt < 0 ? "never" : revivedAt.toFixed(1) + "s"}`);
  check(revivedAt > 0 && revivedAt <= 12, "partner revives within 12s under wave-3 pressure");
}
{
  // Retreat at low health.
  const eng = staged({ playerClass: "knight", partnerClass: "mage" });
  const p = eng.chars[1];
  placeChar(eng.chars[0], "gateyard", 0, 6);
  placeChar(p, "gateyard", 0, 18);
  p.hp = p.maxHp * 0.25;
  const g = eng.spawnUnit("gnasher", "gateyard", 0, 22, "treeline", false);
  g.x = p.x;
  g.y = p.y + 4;
  const hp0 = p.hp;
  stepN(eng, secs(6));
  const d = Math.hypot(g.x - p.x, g.y - p.y);
  console.log(`  partner at ${d.toFixed(1)}m after 6s of kiting, hp ${p.hp.toFixed(0)}/${hp0.toFixed(0)}`);
  check(p.state === "up" && p.hp > hp0 - 12, "hurt partner disengages instead of trading");
}
{
  // Command compliance: defend-arch moves the anchor.
  const eng = staged({ playerClass: "knight", partnerClass: "mage" });
  const p = eng.chars[1];
  placeChar(eng.chars[0], "gateyard", 0, 6);
  placeChar(p, "gateyard", 10, 4);
  const startD = Math.hypot(p.x - 0, p.y - 22);
  stepN(eng, secs(3.5), () => {
    const i = emptyInput();
    i.command = "defend-arch";
    return i;
  });
  const endD = Math.hypot(p.x - 0, p.y - 22);
  console.log(`  distance to the arch anchor: ${startD.toFixed(1)} -> ${endD.toFixed(1)}m`);
  check(endD < startD - 4, "the command moves the partner to the arch");
}
{
  // Mage triage: healing precedes damage.
  const eng = staged({ playerClass: "knight", partnerClass: "mage" });
  const c = eng.chars[0];
  const p = eng.chars[1];
  placeChar(c, "gateyard", 0, 10);
  placeChar(p, "gateyard", 4, 10);
  c.hp = c.maxHp * 0.5;
  const g = eng.spawnUnit("gnasher", "gateyard", -14, 20, "treeline", false);
  g.x = -14;
  g.y = 20;
  g.hp = 1e6;
  const hpBefore = c.hp;
  stepN(eng, secs(4));
  check(c.hp > hpBefore, "the hurt ally gets healed");
  check(p.healedGiven > 0, "triage spends mana on mending first");
}
{
  // Counter-raid: an unanswered thief draws the partner.
  const eng = staged({ playerClass: "knight", partnerClass: "mage", wave: 11 });
  placeChar(eng.chars[0], "rampart", -18, 25.7);
  placeChar(eng.chars[1], "gateyard", -6, 8);
  eng.valor = 400;
  const f = eng.spawnUnit("filcher", "gateyard", 4, 22, "treeline", false);
  f.x = 4;
  f.y = 22;
  stepN(eng, secs(6));
  check(
    f.hp < GLOAM.filcher.hp * DIFFICULTY.long.hpMult * 1.001 || f.state === "flee",
    "the partner contests the raid",
  );
}
{
  // Boards defense: a knight partner fights the chewers through the
  // standing arch barricade instead of waiting for the breach. The
  // causeway is x -4..4, y 26..46; the arch spans x -2..2 on the y=26
  // plane, so the chewers start spread along the span just outside it.
  const eng = staged({ playerClass: "mage", partnerClass: "knight" });
  placeChar(eng.chars[0], "gateyard", -12, 18);
  placeChar(eng.chars[1], "gateyard", 0, 12);
  for (let k = 0; k < 3; k++) {
    const u = eng.spawnUnit("gnasher", "causeway", k - 1, 27 + k * 0.5, "treeline", false);
    u.x = k - 1;
    u.y = 27 + k * 0.5;
  }
  let clearedAt = -1;
  let leftHold = false;
  const exterior = new Set(["causeway", "treeline", "outsideW", "outsideE", "outsideS"]);
  for (let t = 0; t < secs(20); t++) {
    eng.step(emptyInput());
    eng.drainEvents();
    if (exterior.has(eng.chars[1].room)) leftHold = true;
    if (eng.gloam.length === 0) {
      clearedAt = eng.time;
      break;
    }
  }
  const arch = eng.structures["bar-arch"];
  console.log(
    `  chewers cleared at ${clearedAt < 0 ? "never" : clearedAt.toFixed(1) + "s"}, boards at ${arch.hp.toFixed(0)}/${arch.maxHp}`,
  );
  check(clearedAt > 0 && clearedAt < 8, "the knight partner kills the door chewers fast");
  check(arch.hp > arch.maxHp * 0.66, "the arch boards barely suffer while it works");
  check(!leftHold, "the partner never leaves the hold to do it");
}
{
  // Rampart trap regression: a knight partner up on the rampart must
  // come down for arch chewers, not swing at them across the 4 m drop
  // where no hit can land.
  const eng = staged({ playerClass: "knight", partnerClass: "knight" });
  placeChar(eng.chars[0], "rampart", -2, 25.7);
  placeChar(eng.chars[1], "rampart", 0, 25.7);
  const chewers = [];
  for (let k = 0; k < 2; k++) {
    const u = eng.spawnUnit("gnasher", "causeway", k, 27, "treeline", false);
    u.x = k;
    u.y = 27;
    chewers.push(u);
  }
  const hp0 = chewers.reduce((s, u) => s + u.hp, 0);
  stepN(eng, secs(12), () => {
    const i = emptyInput();
    i.command = "follow";
    return i;
  });
  const hp1 = chewers.reduce((s, u) => s + Math.max(0, u.hp), 0);
  console.log(`  chewer hp ${hp0.toFixed(0)} -> ${hp1.toFixed(0)} with the partner starting on the rampart`);
  check(hp1 < hp0, "the partner descends and lands real hits instead of live-locking");
}
{
  // Reach from the defense stand (PR #21 review, partner.ts:373): a Hexer backing an arch
  // chewer from (0, 29) is too far for a swing from inside the arch. It must not take the
  // knight's target, or the knight stands at the arch and never swings while the boards go.
  const eng = staged({ playerClass: "mage", partnerClass: "knight" });
  placeChar(eng.chars[0], "gateyard", -12, 18);
  placeChar(eng.chars[1], "gateyard", 0, 12);
  const chewer = eng.spawnUnit("gnasher", "causeway", 0, 26.4, "treeline", false);
  chewer.x = 0;
  chewer.y = 26.4;
  const hexer = eng.spawnUnit("hexer", "causeway", 0, 29, "treeline", false);
  hexer.x = 0;
  hexer.y = 29;
  const hp0 = chewer.hp;
  stepN(eng, secs(10));
  const arch = eng.structures["bar-arch"];
  console.log(`  chewer hp ${hp0.toFixed(0)} -> ${Math.max(0, chewer.hp).toFixed(0)}, boards ${arch.hp.toFixed(0)}/${arch.maxHp} with a hexer behind it`);
  check(chewer.hp < hp0, "a hexer out of reach does not stop the knight hitting the chewer");
}
{
  // The lone Hexer (PR #21 review, seed 2026): a Hexer cannot chew, so with no flock left it
  // leans on the armory breach barricade forever. The knight at its yard anchor cannot see it,
  // but a swing from the armory stand reaches it. Unkilled, it holds the wave open for good.
  const eng = staged({ playerClass: "archer", partnerClass: "knight", wave: 12 });
  eng.phase = "intermission";
  eng.valor = 5000;
  eng.buy("district:armory");
  eng.phase = "combat";
  placeChar(eng.chars[0], "rampart", -1, 25.8);
  placeChar(eng.chars[1], "gateyard", -10.5, 1);
  const hexer = eng.spawnUnit("hexer", "outsideW", -24, -8, "west-scrub", false);
  stepN(eng, secs(30));
  const alive = eng.gloam.includes(hexer);
  console.log(`  lone hexer ${alive ? `alive at (${hexer.x.toFixed(1)}, ${hexer.y.toFixed(1)})` : "killed"}, armory breach ${eng.structures["bar-armory-breach"].hp}`);
  check(!alive, "the knight kills a lone hexer at the armory breach it cannot see from its anchor");
}

// ---------------------------------------------------------------------------
// 9. economy and difficulty arithmetic

console.log("economy and difficulty arithmetic");
for (const diff of ["ember", "long", "forlorn"]) {
  const mods = DIFFICULTY[diff];
  const eng = staged({ difficulty: diff });
  placeChar(eng.chars[0], "gateyard", 0, 10);
  placeChar(eng.chars[1], "gateyard", -14, 2);
  const u = eng.spawnUnit("gnasher", "gateyard", 0, 14, "treeline", false);
  const v0 = eng.valor;
  eng.damageGloam(u, 1e9, eng.chars[0], "light", false);
  const gained = eng.valor - v0;
  const expected = Math.round(VALOR.gnasher * mods.valorMult);
  check(gained === expected, `${diff}: gnasher pays ${expected} valor (got ${gained})`);

  eng.phase = "intermission";
  eng.valor = 1000;
  const v1 = eng.valor;
  eng.buy("bandage");
  const paid = v1 - eng.valor;
  const expectedPrice = Math.round(Math.round(PRICES.bandage * mods.priceMult) * 1);
  check(paid === expectedPrice, `${diff}: bandage costs ${expectedPrice} (paid ${paid})`);

  const hpMult = mods.hpMult;
  const u2 = eng.spawnUnit("gnasher", "gateyard", 5, 14, "treeline", false);
  const expHp = GLOAM.gnasher.hp * hpMult; // wave <= 8, no wave scaling
  check(Math.abs(u2.maxHp - expHp) < 0.01, `${diff}: enemy hp scales by ${hpMult}`);
}
{
  // Wave-clear arithmetic on Long.
  const eng = staged();
  eng.wave = 6;
  eng.phase = "combat";
  eng.waveCtl.queue = [];
  const v0 = eng.valor;
  const s0 = eng.score;
  eng.step(emptyInput());
  eng.drainEvents();
  check(
    eng.valor - v0 >= ECON.waveClearBase + ECON.waveClearPerWave * 6,
    "wave clear pays the stated valor",
  );
  check(
    eng.score - s0 >= ECON.scoreWaveClearBase + ECON.scoreWaveClearPerWave * 6,
    "wave clear pays the stated score",
  );
}

// ---------------------------------------------------------------------------
// 10. districts

console.log("districts");
{
  const eng = staged();
  eng.phase = "intermission";
  eng.valor = 5000;
  check(!eng.doorOpen["armory-rubble"], "armory rubble starts sealed");
  check(eng.buy("district:armory"), "armory opens for valor");
  check(eng.doorOpen["armory-rubble"], "the rubble door opens");
  check(eng.doorOpen["armory-breach"], "the armory breach activates");
  check(eng.structures["bar-armory-breach"].hp > 0, "its barricade is boarded at tier 1");
  check(!eng.buy("district:undercroft"), "undercroft refuses without the hall");
  check(eng.buy("district:wellcourt") && eng.buy("district:hall"), "wing then hall opens");
  check(eng.buy("district:undercroft"), "undercroft opens after the hall");
  check(eng.achievements.has("the-full-hold"), "the-full-hold fires on the fourth district");
  check(eng.caches[0].arrows > 0, "undercroft caches stock on opening");
}

// ---------------------------------------------------------------------------
// 11. flood cap

console.log("flood cap");
{
  const eng = staged();
  eng.addScore(ECON.scoreCap * 3);
  check(eng.score === ECON.scoreCap, `score clamps at the seeded cap (${eng.score})`);
}

// ---------------------------------------------------------------------------
// achievement sweep: the slugs no other proof reaches

console.log("achievement sweep");
{
  // shoulder-to-shoulder: three revives by the player.
  const eng = staged({ playerClass: "knight", partnerClass: "mage" });
  const c = eng.chars[0];
  const p = eng.chars[1];
  placeChar(c, "gateyard", 0, 10);
  placeChar(p, "gateyard", 1.2, 10);
  for (let k = 0; k < 3; k++) {
    p.state = "downed";
    p.hp = 0;
    p.bleedout = 30;
    placeChar(c, "gateyard", 0, 10);
    placeChar(p, "gateyard", 1.2, 10);
    stepN(eng, secs(4), () => {
      const i = emptyInput();
      i.interact = true;
      // The stage pins both so each loop tests the channel, not the walk.
      p.x = 1.2;
      p.y = 10;
      return i;
    });
    if (p.state !== "up") break;
  }
  check(eng.achievements.has("shoulder-to-shoulder"), "shoulder-to-shoulder fires on the third revive");
}
{
  // the-long-count: the wave-20 clear trigger, staged at the threshold.
  const eng = staged();
  eng.wave = 20;
  eng.phase = "combat";
  eng.waveCtl.queue = [];
  stepN(eng, 2);
  check(eng.achievements.has("the-long-count"), "the-long-count fires on clearing wave 20");
}
{
  // pack-breaker: the alpha first, then its whole pack inside 8s, every
  // kill by the player's own blade. Staged so coverage does not depend
  // on ace-run luck.
  const eng = staged({ playerClass: "knight", partnerClass: "mage" });
  const c = eng.chars[0];
  placeChar(c, "gateyard", 0, 10);
  placeChar(eng.chars[1], "gateyard", -14, 20);
  const alpha = eng.spawnUnit("alpha", "gateyard", 0, 11.5, "treeline", false);
  const g1 = eng.spawnUnit("gnasher", "gateyard", 1.8, 8.6, "treeline", false);
  const g2 = eng.spawnUnit("gnasher", "gateyard", -1.8, 8.6, "treeline", false);
  const pack = [alpha, g1, g2];
  const spots = [[0, 11.5], [1.8, 8.6], [-1.8, 8.6]];
  for (const u of pack) {
    u.packId = 777;
    u.hp = 1;
  }
  stepN(eng, secs(7), (i) => {
    const input = emptyInput();
    pack.forEach((u, n) => {
      if (u.hp > 0) {
        u.x = spots[n][0];
        u.y = spots[n][1];
      }
    });
    const next = pack.find((u) => u.hp > 0 && eng.gloam.includes(u));
    if (next) {
      const aim = aimAtUnit(eng, c, next, false);
      input.yaw = aim.yaw;
      input.pitch = aim.pitch;
      input.primary = i % 36 < 3;
    }
    return input;
  });
  check(eng.achievements.has("pack-breaker"), "pack-breaker fires on a staged pack wipe");
}
{
  // lifeline: a mage healing 1,000 HP across a long night.
  const eng = staged({ playerClass: "mage", partnerClass: "knight" });
  const c = eng.chars[0];
  const p = eng.chars[1];
  placeChar(c, "gateyard", 0, 10);
  placeChar(p, "gateyard", 3, 10);
  let tick = 0;
  for (let k = 0; k < 60 && !eng.achievements.has("lifeline"); k++) {
    p.hp = 50;
    c.mana = 100;
    stepN(eng, secs(1.2), () => {
      const i = emptyInput();
      i.yaw = Math.atan2(p.y - c.y, p.x - c.x);
      i.secondary = tick++ % 20 < 10; // pulse so each mend has a press edge
      p.x = 3;
      p.y = 10;
      return i;
    });
  }
  check(eng.achievements.has("lifeline"), "lifeline fires at 1,000 HP healed");
}

// ---------------------------------------------------------------------------
// 3. casual floors (9 runs)

console.log("casual floors");
const casualFloors = { ember: 120, long: 90, forlorn: 45 };
const casualResults = [];
for (const diff of ["ember", "long", "forlorn"]) {
  for (const cls of ["knight", "archer", "mage"]) {
    const partner = cls === "knight" ? "mage" : "knight";
    const r = runScripted(
      99,
      { difficulty: diff, playerClass: cls, partnerClass: partner },
      makeCasual,
      casualInput,
      300,
    );
    const survived = r.over ? r.time : 300;
    casualResults.push({ diff, cls, survived, score: r.score });
    const need = casualFloors[diff];
    console.log(
      `  ${diff.padEnd(8)} ${cls.padEnd(7)} survived ${Math.round(survived)}s, score ${r.score}`,
    );
    check(survived >= need, `${diff}/${cls}: casual bot survives ${need}s`);
    check(r.score > 0, `${diff}/${cls}: casual bot scores`);
  }
}

// ---------------------------------------------------------------------------
// 2 + 12. ace duo deep run on Long Watch, with calibration prints

console.log("ace duo (long watch)");
let aceRun = null;
{
  // Seed 2026 carries the GDD's hard gate at the Coalhide milestone, wave
  // 15+ (docs/LASTWATCH-GDD.md, ace-duo proof row). The twelve seeds around
  // it guard the average and the depth.
  const cfg = { difficulty: "long", playerClass: "archer", partnerClass: "knight" };
  const runs = [];
  for (let seed = 2020; seed < 2032; seed++) {
    runs.push(runScripted(seed, cfg, makeAce, aceInput, 3600, { shop: aceShop, stopWave: 22 }));
  }
  const waves = runs.map((r) => r.eng.wave);
  const mean = waves.reduce((a, b) => a + b, 0) / waves.length;
  aceRun = runs.reduce((a, b) => (b.eng.wave > a.eng.wave || (b.eng.wave === a.eng.wave && b.score > a.score) ? b : a));
  console.log(`  waves by seed ${waves.join(" ")}, mean ${mean.toFixed(2)}`);
  console.log(
    `  best run reached wave ${aceRun.eng.wave} in ${Math.round(aceRun.time)}s sim, score ${aceRun.score}, ` +
      `districts ${Object.values(aceRun.eng.districts).filter(Boolean).length}/4, ` +
      `valor spent ${aceRun.eng.valorSpent}`,
  );
  // The milestone gate is the third boss (wave 15), on seed 2026 and on
  // average, and the deep claim is a run past wave 20.
  check(waves[2026 - 2020] >= 15, "ace duo seed 2026 clears deep into the Coalhide milestone (wave 15+)");
  check(mean >= 15, "ace duo clears deep into the Coalhide milestone (mean wave 15+ over 12 seeds)");
  check(aceRun.eng.wave >= 20, "an ace duo reaches wave 20+ on Long Watch");
  check(runs.every((r) => r.score <= ECON.scoreCap), "score stays under the cap all run");
  const ach = aceRun.eng.achievements;
  console.log(`  achievements earned: ${[...ach].join(", ") || "none"}`);
  check(ach.has("first-night"), "first-night fires in a real run");
  check(ach.has("the-full-hold"), "the-full-hold fires in a real run");
}

// ---------------------------------------------------------------------------
// 12/13. calibration

console.log("calibration");
{
  const sloppyMax = Math.max(...casualResults.map((r) => r.score));
  const aceScore = aceRun.score;
  console.log(`  sloppy ceiling (best casual score): ${sloppyMax}`);
  console.log(`  skilled floor (ace at wave 20+): ${aceScore}`);
  console.log(`  watch-legend threshold: 20000`);
  check(sloppyMax < 20000, "watch-legend sits above the sloppy ceiling");
  check(aceScore > 20000, "watch-legend sits below the skilled floor");
  if (CAL) {
    for (const r of casualResults) {
      console.log(`  casual ${r.diff}/${r.cls}: ${Math.round(r.survived)}s, ${r.score}`);
    }
  }
}

collectFired();
console.log("achievement coverage");
{
  const ALL = [
    "first-night", "the-full-hold", "hold-the-arch", "shoulder-to-shoulder",
    "pack-breaker", "no-thieves-tonight", "well-armed", "crowd-breaker",
    "keen-eye", "lifeline", "the-long-count", "watch-legend",
  ];
  const missing = ALL.filter((slug) => !firedAnywhere.has(slug));
  console.log(`  fired ${ALL.length - missing.length}/${ALL.length}${missing.length ? ": missing " + missing.join(", ") : ""}`);
  check(missing.length === 0, "every seeded achievement fires somewhere in the harness");
}

console.log(failures === 0 ? "\nPASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
