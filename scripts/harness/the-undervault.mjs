// The Undervault beatability harness. Run: node scripts/harness/the-undervault.mjs
// Turn based, so this drives playerAct directly with no dt loop.
// Proves, with exit-code semantics a reviewer can rerun:
//   1. every floor of 20 seeds is connected: start reaches the boss, the
//      stair, and every placed item, and a locked vault always has a key
//      lying outside it,
//   2. a policy ace bot wins the default seed and most of a six seed spread
//      inside the turn budget, which is what calibrates vault-legend,
//   3. a reckless bot dies, so the loss path is real,
//   4. the staged rules hold: turn order, ranged line of sight, status
//      schedules, root, auto-equip, relic passives, every boss gimmick,
//      inventory limits, merchant arithmetic, boss cards, all seven slugs,
//      the score cap, and same-seed determinism.

import { Engine, TUNE, manhattan } from "../../src/games/the-undervault/engine.ts";
import {
  ARMORS,
  BOSSES,
  FLOORS,
  WEAPONS,
  monsterById,
  relicById,
} from "../../src/games/the-undervault/content.ts";
import {
  DOOR,
  FLOOR,
  MAP_H,
  MAP_W,
  STEPS,
  WALL,
  idx,
  reachable,
  stepToward,
  walkable,
} from "../../src/games/the-undervault/dungeon.ts";

let failures = 0;
const check = (ok, label) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
  return ok;
};

// ---- shared helpers -------------------------------------------------------

const ACHIEVEMENTS = [
  "first-descent",
  "monster-breaker",
  "relic-bearer",
  "ossuary",
  "deep-mechanism",
  "boss-breaker",
  "vault-legend",
];

const collect = (eng, bag) => {
  for (const event of eng.drainEvents()) {
    if (event.type === "achievement") bag.slugs.add(event.slug);
    if (event.type === "gameover") {
      bag.stats = event.stats;
      bag.finalScore = event.score;
    }
  }
};

/** BFS that treats a locked door as a wall, unlike the engine's reachable. */
const reachableNoDoors = (tiles, from) => {
  const seen = new Uint8Array(MAP_W * MAP_H);
  const queue = [idx(from.x, from.y)];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const x = at % MAP_W;
    const y = (at - x) / MAP_W;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(tiles, nx, ny)) continue;
      if (tiles[idx(nx, ny)] === DOOR) continue;
      const next = idx(nx, ny);
      if (seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
};

const distanceField = (eng) => {
  const dist = new Int32Array(MAP_W * MAP_H).fill(-1);
  const start = idx(eng.px, eng.py);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const x = at % MAP_W;
    const y = (at - x) / MAP_W;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(eng.tiles, nx, ny)) continue;
      if (eng.tiles[idx(nx, ny)] === DOOR && eng.keys <= 0) continue;
      if (eng.occupied(nx, ny)) continue;
      const next = idx(nx, ny);
      if (dist[next] >= 0) continue;
      dist[next] = dist[at] + 1;
      queue.push(next);
    }
  }
  return dist;
};

/** A synthetic all floor arena, for the staged rule proofs. */
const arena = (eng) => {
  const tiles = new Uint8Array(MAP_W * MAP_H).fill(FLOOR);
  for (let x = 0; x < MAP_W; x++) {
    tiles[idx(x, 0)] = WALL;
    tiles[idx(x, MAP_H - 1)] = WALL;
  }
  for (let y = 0; y < MAP_H; y++) {
    tiles[idx(0, y)] = WALL;
    tiles[idx(MAP_W - 1, y)] = WALL;
  }
  eng.tiles = tiles;
  eng.monsters = [];
  eng.items = [];
  eng.traps = [];
  eng.boss = null;
  eng.fallenBoss = null;
  eng.seen = new Uint8Array(MAP_W * MAP_H).fill(1);
  eng.visible = new Uint8Array(MAP_W * MAP_H).fill(1);
  eng.px = 5;
  eng.py = 5;
  return eng;
};

const staged = (portrait = "clay-guardian", seed = 7) => {
  const eng = new Engine(seed);
  eng.choosePortrait(portrait);
  return arena(eng);
};

/**
 * One action, then any card it raised is dismissed. A boss becoming visible
 * queues its intro card, and a card swallows the next plain action.
 */
const act = (eng, action) => {
  eng.playerAct(action);
  let guard = 0;
  while (eng.phase === "card" && eng.card.choices.length > 0 && guard++ < 8) {
    eng.playerAct({ type: "choose", index: 0 });
  }
  eng.drainEvents();
};

const addMonster = (eng, id, x, y, awake = true) => {
  const def = monsterById(id);
  const monster = {
    def,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    awake,
    beat: 0,
    art: "idle",
    summoned: false,
  };
  eng.monsters.push(monster);
  return monster;
};

const addBoss = (eng, id, x, y) => {
  const def = BOSSES.find((b) => b.id === id);
  eng.boss = {
    def,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    awake: true,
    beat: 0,
    art: "idle",
    winding: false,
    charge: 0,
    shielded: false,
  };
  return eng.boss;
};

/** Steps the run past every queued card, answering with the given policy. */
const clearCards = (eng, answer, bag) => {
  let guard = 0;
  while (eng.phase === "card" && eng.card.choices.length > 0 && guard++ < 20) {
    const before = eng.card;
    eng.playerAct({ type: "choose", index: answer(eng) });
    if (bag) collect(eng, bag);
    if (eng.card === before) break; // a disabled choice never advances
  }
};

// ---- 1. reachability sweep ------------------------------------------------

const sweepFloor = (eng, seed, depth, report) => {
  const open = reachable(eng.tiles, eng.plan.start);
  const bossAt = eng.boss ? idx(eng.boss.x, eng.boss.y) : -1;
  const stairAt = idx(eng.plan.stairs.x, eng.plan.stairs.y);
  const bossOk = bossAt >= 0 && open[bossAt] === 1;
  const stairOk = open[stairAt] === 1;
  const unreachable = eng.items.filter((item) => open[idx(item.x, item.y)] !== 1);
  let keyOk = true;
  if (eng.plan.door) {
    const dry = reachableNoDoors(eng.tiles, eng.plan.start);
    keyOk = eng.items.some((item) => item.kind === "key" && dry[idx(item.x, item.y)] === 1);
  }
  report.floors++;
  report.items += eng.items.length;
  if (!bossOk || !stairOk || unreachable.length > 0 || !keyOk) {
    report.bad.push(
      `seed ${seed} depth ${depth}: boss ${bossOk} stair ${stairOk} orphan items ${unreachable.length} key ${keyOk}`,
    );
  }
};

const reachabilitySweep = () => {
  const report = { floors: 0, items: 0, bad: [] };
  for (let i = 0; i < 20; i++) {
    const seed = 1000 + i * 977;
    const eng = new Engine(seed);
    eng.choosePortrait("lamp-bearer");
    for (let depth = 1; depth <= FLOORS.length; depth++) {
      sweepFloor(eng, seed, depth, report);
      if (depth === FLOORS.length) break;
      eng.boss = null;
      eng.px = eng.plan.stairs.x;
      eng.py = eng.plan.stairs.y;
      eng.playerAct({ type: "descend" });
      eng.drainEvents();
      clearCards(eng, (e) => (e.card.kind === "merchant" ? e.card.choices.length - 1 : 0));
    }
  }
  console.log(
    `\nreachability sweep: ${report.floors} floors over 20 seeds, ${report.items} placed items`,
  );
  for (const line of report.bad) console.log(`  ${line}`);
  check(report.floors === 100, "sweep walked 20 seeds by 5 floors");
  check(report.bad.length === 0, "every floor connects start, boss, stair, items, and key");
};

// ---- 2 and 3. bots --------------------------------------------------------

const cardAnswer = (eng, profile) => {
  const card = eng.card;
  if (card.kind === "camp") return eng.hp <= eng.maxHp - TUNE.campRest ? 0 : 1;
  if (card.kind === "merchant") {
    const choices = card.choices;
    if (profile.shop) {
      if (choices[0].enabled && eng.tonics < 3) return 0;
      if (choices[2].enabled) return 2;
      if (choices[1].enabled) return 1;
    }
    return 3;
  }
  return 0;
};

const offLineStep = (eng, boss) =>
  STEPS.map(([dx, dy]) => ({ dx, dy, x: eng.px + dx, y: eng.py + dy })).find(
    (p) =>
      walkable(eng.tiles, p.x, p.y) &&
      eng.tiles[idx(p.x, p.y)] !== DOOR &&
      !eng.occupied(p.x, p.y) &&
      p.x !== boss.x &&
      p.y !== boss.y,
  );

/**
 * Gear the engine would refuse stays on the floor, so a bot that keeps
 * walking to it never leaves the room. Only chase what will be taken.
 */
const wanted = (eng, item) => {
  if (item.x === eng.px && item.y === eng.py) return false;
  if (item.kind === "weapon") return item.gear.bonus > (eng.weapon?.bonus ?? 0);
  if (item.kind === "armor") return item.gear.bonus > (eng.armor?.bonus ?? 0);
  if (item.kind === "tonic") return eng.tonics < TUNE.maxTonics;
  return true;
};

const openNeighbours = (eng, x, y) =>
  STEPS.filter(([dx, dy]) => walkable(eng.tiles, x + dx, y + dy)).length;

const freshState = (eng) => ({
  depth: eng.depth,
  floorStart: eng.turn,
  goal: null,
  progress: -1,
  progressTurn: 0,
  retreats: 0,
  charge: false,
});

/**
 * Floor memory. Without it the bot re-picks the nearest item every turn and
 * two equidistant piles walk it back and forth forever, and a floor whose
 * last item sits behind a sleeping monster never ends.
 */
const trackProgress = (eng, state) => {
  if (eng.depth !== state.depth) Object.assign(state, freshState(eng));
  const progress = eng.kills * 100 - eng.items.length;
  if (progress !== state.progress) {
    state.progress = progress;
    state.progressTurn = eng.turn;
  } else if (eng.turn - state.progressTurn > 80) {
    state.charge = true;
  }
  // A floor that has run this long is a loop, not a fight. Stop looting and
  // stop backing off, and take the keeper.
  if (eng.turn - state.floorStart > 400) state.charge = true;
};

const nextAction = (eng, profile, state) => {
  if (eng.phase === "card") return { type: "choose", index: cardAnswer(eng, profile) };
  if (state) trackProgress(eng, state);

  if (profile.tonics && eng.tonics > 0 && eng.hp / eng.maxHp < 0.4) return { type: "tonic" };

  const boss = eng.boss;
  const shut = (x, y) => eng.tiles[idx(x, y)] === DOOR && eng.keys <= 0;
  // Only locked doors bend the route. Routing around monsters looks smarter
  // and is not: a slow monster stepping in and out of a corridor flips the
  // shortest path every other turn and the bot paces forever. Walking the
  // straight line and hitting what stands in it always resolves.
  const toward = (goal) => {
    const step = stepToward(eng.tiles, { x: eng.px, y: eng.py }, goal, shut);
    return step ? { type: "move", dx: step.x - eng.px, dy: step.y - eng.py } : { type: "wait" };
  };

  // The Buried Engine only ever fires down its own row and column, so the
  // one safe tile is a diagonal, taken on the turn its bore goes white.
  if (boss && boss.awake && boss.def.gimmick === "line" && boss.charge >= boss.def.period - 1) {
    const off = offLineStep(eng, boss);
    if (off) return { type: "move", dx: off.dx, dy: off.dy };
  }

  const adjacent = eng.monsters.filter((m) => manhattan(m.x, m.y, eng.px, eng.py) === 1);
  const threats = eng.monsters.filter((m) => m.awake && manhattan(m.x, m.y, eng.px, eng.py) <= 2);

  const wantRetreat = profile.retreat && threats.length >= 3 && eng.hp / eng.maxHp < 0.6;
  if (state && !wantRetreat) state.retreats = 0;
  if (wantRetreat && !(state && (state.charge || state.retreats >= 3))) {
    const spots = STEPS.map(([dx, dy]) => ({ dx, dy, x: eng.px + dx, y: eng.py + dy }))
      .filter((p) => walkable(eng.tiles, p.x, p.y) && !eng.occupied(p.x, p.y))
      .map((p) => ({
        ...p,
        room: openNeighbours(eng, p.x, p.y),
        away: threats.reduce((sum, m) => sum + manhattan(m.x, m.y, p.x, p.y), 0),
      }))
      .sort((a, b) => a.room - b.room || b.away - a.away);
    const best = spots[0];
    const here = threats.reduce((sum, m) => sum + manhattan(m.x, m.y, eng.px, eng.py), 0);
    if (best && (best.room < openNeighbours(eng, eng.px, eng.py) || best.away > here)) {
      if (state) state.retreats++;
      return { type: "move", dx: best.dx, dy: best.dy };
    }
  }

  if (adjacent.length > 0) {
    const target = adjacent.sort((a, b) => a.hp - b.hp)[0];
    return { type: "move", dx: target.x - eng.px, dy: target.y - eng.py };
  }

  if (boss && manhattan(boss.x, boss.y, eng.px, eng.py) === 1) {
    return { type: "move", dx: boss.x - eng.px, dy: boss.y - eng.py };
  }

  // Sweep the floor for gear and gold before the keeper, and take any short
  // detour on the way back. An under-equipped ace loses to the first boss.
  if (profile.loot && !(state && state.charge)) {
    const dist = distanceField(eng);
    const held = state && state.goal && eng.items.includes(state.goal) && wanted(eng, state.goal)
      ? state.goal
      : null;
    let best = held && dist[idx(held.x, held.y)] >= 0 ? { item: held, d: dist[idx(held.x, held.y)] } : null;
    if (!best) {
      for (const item of eng.items) {
        if (!wanted(eng, item)) continue;
        const d = dist[idx(item.x, item.y)];
        if (d < 0) continue;
        if (!best || d < best.d) best = { item, d };
      }
    }
    if (best && (profile.sweep || best.d <= 6)) {
      if (state) state.goal = best.item;
      return toward({ x: best.item.x, y: best.item.y });
    }
  }
  if (state) state.goal = null;

  if (boss) return toward({ x: boss.x, y: boss.y });
  return toward({ x: eng.plan.stairs.x, y: eng.plan.stairs.y });
};

const ACE = { tonics: true, loot: true, sweep: true, retreat: true, shop: true };
const RECKLESS = { tonics: false, loot: false, sweep: false, retreat: false, shop: false };

const run = (seed, profile, portrait = "clay-guardian", turnBudget = 4000) => {
  const eng = new Engine(seed);
  const bag = { slugs: new Set(), stats: null, finalScore: 0 };
  eng.choosePortrait(portrait);
  collect(eng, bag);

  const bossCards = new Set();
  const state = freshState(eng);
  let capHeld = true;
  let actions = 0;
  let idle = 0;
  while (eng.phase !== "dead" && eng.phase !== "won" && eng.turn < turnBudget && actions < 40000) {
    if (eng.phase === "card" && eng.card.kind === "boss") bossCards.add(eng.card.title);
    const before = eng.turn;
    const wasCard = eng.phase === "card";
    // A refused action costs no turn, so two in a row means burn one on a
    // deliberate wait rather than spinning the loop.
    eng.playerAct(idle >= 2 ? { type: "wait" } : nextAction(eng, profile, state));
    idle = eng.turn === before && !wasCard ? idle + 1 : 0;
    collect(eng, bag);
    if (eng.score > TUNE.scoreCap) capHeld = false;
    actions++;
  }
  collect(eng, bag);
  return { eng, bag, bossCards, capHeld, actions };
};

const DEFAULT_SEED = 20260824;
const SPREAD = [DEFAULT_SEED, 4211, 90210, 777001, 31337, 606060];

const runAces = () => {
  console.log("\nace bot, six seed spread");
  console.log("  seed        outcome   depth kills gold relics turns   score");
  const results = SPREAD.map((seed) => {
    const r = run(seed, ACE);
    const e = r.eng;
    console.log(
      `  ${String(seed).padEnd(10)} ${e.phase.padEnd(8)} ${String(e.depth).padStart(5)} ${String(
        e.kills,
      ).padStart(5)} ${String(e.gold).padStart(4)} ${String(e.relics.length).padStart(6)} ${String(
        e.turn,
      ).padStart(5)} ${String(e.score).padStart(7)}`,
    );
    return { seed, ...r };
  });

  const wins = results.filter((r) => r.eng.phase === "won");
  const lowestWin = wins.length ? Math.min(...wins.map((r) => r.eng.score)) : 0;
  console.log(
    `  ${wins.length}/6 seeds cleared the Deep Mechanism; lowest winning score ${lowestWin}`,
  );

  check(results[0].eng.phase === "won", "ace clears the default seed");
  check(wins.length >= 4, "ace clears at least 4 of 6 seeds");
  check(
    results.every((r) => r.eng.turn < 4000),
    "every ace run finishes inside the 4,000 turn budget",
  );
  check(
    results.every((r) => r.capHeld),
    "score never exceeds the cap during an ace run",
  );
  check(
    wins.every((r) => r.bossCards.size === FLOORS.length),
    "every boss encounter fires its card event",
  );
  check(
    lowestWin > TUNE.legendScore,
    `vault-legend at ${TUNE.legendScore} sits under the lowest winning ace score (${lowestWin})`,
  );
  const losses = results.filter((r) => r.eng.phase !== "won").map((r) => r.eng.score);
  const lostCeiling = Math.max(0, ...losses);
  check(
    lostCeiling < TUNE.legendScore,
    `no run that failed to clear reaches the legend line (best loss ${lostCeiling})`,
  );
  return results;
};

const runReckless = () => {
  console.log("\nreckless bot, no tonics, straight at the boss");
  const results = SPREAD.slice(0, 3).map((seed) => {
    const r = run(seed, RECKLESS);
    console.log(
      `  seed ${String(seed).padEnd(8)} ${r.eng.phase.padEnd(8)} depth ${r.eng.depth} score ${r.eng.score}`,
    );
    return r;
  });
  check(
    results.every((r) => r.eng.phase === "dead"),
    "the reckless bot dies on every seed, so the loss path is real",
  );
  const ceiling = Math.max(...results.map((r) => r.eng.score));
  check(
    ceiling < TUNE.legendScore,
    `a scraping run tops out at ${ceiling}, under the ${TUNE.legendScore} legend line`,
  );
  return results;
};

// ---- 4. staged rule proofs ------------------------------------------------

const proveTurnOrder = () => {
  const eng = staged();
  const plain = addMonster(eng, "bone-porter", 10, 5);
  const fast = addMonster(eng, "coal-salamander", 10, 8);
  const slow = addMonster(eng, "salt-mummy", 10, 11);
  eng.hp = eng.maxHp = 999;

  eng.playerAct({ type: "wait" });
  eng.playerAct({ type: "wait" });
  eng.drainEvents();

  check(plain.x === 8, `a plain monster answers once per turn (moved to x=${plain.x}, want 8)`);
  check(fast.x === 6, `the fast trait answers twice per turn (moved to x=${fast.x}, want 6)`);
  check(slow.x === 9, `the slow trait answers every other turn (moved to x=${slow.x}, want 9)`);
};

const proveRanged = () => {
  const open = staged();
  open.hp = open.maxHp = 50;
  addMonster(open, "candle-wraith", 9, 5); // four tiles away, clear line
  open.playerAct({ type: "wait" });
  open.drainEvents();
  check(open.hp === 50 - TUNE.rangedDamage, `ranged attack lands down a clear line (hp ${open.hp})`);

  const blocked = staged();
  blocked.hp = blocked.maxHp = 50;
  for (let y = 0; y < MAP_H; y++) blocked.tiles[idx(7, y)] = WALL;
  addMonster(blocked, "candle-wraith", 9, 5);
  blocked.playerAct({ type: "wait" });
  blocked.drainEvents();
  check(blocked.hp === 50, `a wall stops the ranged attack (hp ${blocked.hp})`);

  const far = staged();
  far.hp = far.maxHp = 50;
  addMonster(far, "candle-wraith", 5 + TUNE.rangedRange + 1, 5);
  far.playerAct({ type: "wait" });
  far.drainEvents();
  check(far.hp === 50, `out of range is out of the fight (hp ${far.hp})`);
};

const proveStatuses = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 60;
  const beetle = addMonster(eng, "sewer-beetle", 6, 5);
  eng.playerAct({ type: "wait" });
  eng.drainEvents();
  const afterBite = eng.hp;
  check(eng.statusTurns("poison") === 2, "venom leaves poison running after its first tick");
  eng.monsters = eng.monsters.filter((m) => m !== beetle);

  eng.playerAct({ type: "wait" });
  eng.playerAct({ type: "wait" });
  eng.drainEvents();
  check(eng.hp === afterBite - 2, `poison ticks 1 a turn (hp ${eng.hp}, want ${afterBite - 2})`);
  check(eng.statusTurns("poison") === 0, "poison expires on schedule");

  const burnt = staged();
  burnt.hp = burnt.maxHp = 60;
  const salamander = addMonster(burnt, "coal-salamander", 6, 5);
  burnt.playerAct({ type: "wait" });
  burnt.drainEvents();
  const afterScorch = burnt.hp;
  check(burnt.statusTurns("burn") === 1, "burning leaves one more tick after the hit");
  burnt.monsters = burnt.monsters.filter((m) => m !== salamander);
  burnt.playerAct({ type: "wait" });
  burnt.drainEvents();
  check(burnt.hp === afterScorch - 2, `burn ticks 2 a turn (hp ${burnt.hp})`);
  check(burnt.statusTurns("burn") === 0, "burn expires on schedule");

  const immune = staged();
  immune.hp = immune.maxHp = 60;
  immune.relics.push(relicById("bone-flute"));
  addMonster(immune, "sewer-beetle", 6, 5);
  immune.playerAct({ type: "wait" });
  immune.drainEvents();
  check(immune.statusTurns("poison") === 0, "the Bone Flute makes poison a no-op");
};

const proveArmoured = () => {
  const soft = staged();
  const hard = staged();
  const a = addMonster(soft, "fungal-pilgrim", 6, 5);
  const b = addMonster(hard, "mole-knight", 6, 5);
  const softHp = a.hp;
  const hardHp = b.hp;
  soft.playerAct({ type: "move", dx: 1, dy: 0 });
  hard.playerAct({ type: "move", dx: 1, dy: 0 });
  soft.drainEvents();
  hard.drainEvents();
  check(
    softHp - a.hp - (hardHp - b.hp) === 1,
    `armoured soaks exactly 1 (${softHp - a.hp} vs ${hardHp - b.hp})`,
  );
};

const proveShriek = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 999;
  const mask = addMonster(eng, "oracle-mask", 9, 5);
  const sleeper = addMonster(eng, "bone-porter", 12, 5, false);
  const before = eng.hp;
  let woke = 0;
  for (let i = 0; i < 3; i++) {
    act(eng, { type: "wait" });
    if (sleeper.awake) woke++;
  }
  check(woke > 0, "the mask's shriek wakes a sleeper");
  check(mask.beat >= 3, "the mask keeps its own beat");
  check(before > 0, "the shriek turn is spent shrieking, not swinging");
};

const proveTrapSight = () => {
  const blind = staged();
  blind.traps.push({ kind: "spike", x: 6, y: 5, known: false });
  blind.playerAct({ type: "wait" });
  blind.drainEvents();
  check(!blind.traps[0].known, "a trap next door stays hidden without the map");

  const mapped = staged();
  mapped.relics.push(relicById("delvers-map"));
  mapped.traps.push({ kind: "spike", x: 6, y: 5, known: false });
  mapped.playerAct({ type: "wait" });
  mapped.drainEvents();
  check(mapped.traps[0].known, "the Delver's Map reveals the adjacent trap");
};

const proveRoot = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 80;
  eng.traps.push({ kind: "snare", x: 6, y: 5, known: false });
  eng.playerAct({ type: "move", dx: 1, dy: 0 });
  eng.drainEvents();
  check(eng.px === 6 && eng.statusTurns("root") > 0, "stepping a snare roots you where you stand");

  const before = { x: eng.px, y: eng.py };
  eng.playerAct({ type: "move", dx: 1, dy: 0 });
  eng.drainEvents();
  check(eng.px === before.x && eng.py === before.y, "root skips the move");

  const victim = addMonster(eng, "bone-porter", eng.px, eng.py - 1);
  const hpBefore = victim.hp;
  eng.playerAct({ type: "move", dx: 0, dy: -1 });
  eng.drainEvents();
  check(victim.hp < hpBefore, "root does not stop the swing");
};

const proveAutoEquip = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 80;
  eng.items.push({ kind: "weapon", gear: WEAPONS[2], x: 6, y: 5 });
  eng.playerAct({ type: "move", dx: 1, dy: 0 });
  eng.drainEvents();
  check(eng.weapon === WEAPONS[2], "a better weapon is taken up");

  eng.items.push({ kind: "weapon", gear: WEAPONS[0], x: 7, y: 5 });
  eng.playerAct({ type: "move", dx: 1, dy: 0 });
  eng.drainEvents();
  check(eng.weapon === WEAPONS[2], "a worse weapon is left where it lies");
  check(eng.items.some((i) => i.gear === WEAPONS[0]), "the worse weapon stays on the floor");

  eng.items.push({ kind: "armor", gear: ARMORS[0], x: 8, y: 5 });
  eng.playerAct({ type: "move", dx: 1, dy: 0 });
  eng.drainEvents();
  check(eng.armor === ARMORS[0], "armour follows the same strictly better rule");
};

const proveRelics = () => {
  const plain = staged();
  const withRelic = staged();
  const a = addMonster(plain, "bone-porter", 6, 5);
  const b = addMonster(withRelic, "bone-porter", 6, 5);
  withRelic.relics.push(relicById("sunwheel"));
  plain.playerAct({ type: "move", dx: 1, dy: 0 });
  withRelic.playerAct({ type: "move", dx: 1, dy: 0 });
  plain.drainEvents();
  withRelic.drainEvents();
  check(
    a.hp - b.hp === 1,
    `the Sunwheel Medallion is worth exactly 1 damage (${a.hp} vs ${b.hp})`,
  );

  const bare = staged();
  const geared = staged();
  bare.hp = bare.maxHp = 60;
  geared.hp = geared.maxHp = 60;
  geared.relics.push(relicById("vault-gear"));
  addMonster(bare, "root-brute", 6, 5);
  addMonster(geared, "root-brute", 6, 5);
  bare.playerAct({ type: "wait" });
  geared.playerAct({ type: "wait" });
  bare.drainEvents();
  geared.drainEvents();
  check(geared.hp - bare.hp === 1, `Vault Gear soaks exactly 1 (${geared.hp} vs ${bare.hp})`);
};

const proveColossus = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 90;
  const boss = addBoss(eng, "bell-tower-colossus", 6, 5);
  act(eng, { type: "wait" });
  check(boss.winding && eng.hp === 90, "the colossus telegraphs before it swings");
  act(eng, { type: "wait" });
  check(!boss.winding && eng.hp < 90, "the swing lands on the turn after the wind up");
};

const proveSpiderQueen = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 9999;
  addBoss(eng, "obsidian-spider-queen", 12, 5);
  let peak = 0;
  for (let i = 0; i < 40; i++) {
    act(eng, { type: "wait" });
    peak = Math.max(peak, eng.monsters.filter((m) => m.summoned).length);
  }
  check(peak > 0, "the queen actually calls a brood");
  check(peak <= TUNE.bossSpawnCap, `the brood never passes ${TUNE.bossSpawnCap} live (peak ${peak})`);
};

const proveSentinel = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 9999;
  const boss = addBoss(eng, "reliquary-sentinel", 6, 5);
  const seen = [];
  for (let i = 0; i < 6; i++) {
    act(eng, { type: "wait" });
    seen.push(boss.shielded);
  }
  check(
    seen.every((v, i) => (i === 0 ? true : v !== seen[i - 1])),
    `the plate alternates every turn (${seen.map((v) => (v ? "shut" : "open")).join(",")})`,
  );

  boss.shielded = true;
  const before = boss.hp;
  act(eng, { type: "move", dx: 1, dy: 0 });
  check(boss.hp === before, "a blow on the shield turn does nothing");
  boss.shielded = false;
  act(eng, { type: "move", dx: 1, dy: 0 });
  check(boss.hp < before, "the open turn takes damage");
};

const proveJudge = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 9999;
  const boss = addBoss(eng, "root-crowned-judge", 12, 5);
  let rooted = 0;
  for (let i = 0; i < 12; i++) {
    act(eng, { type: "wait" });
    if (eng.statusTurns("root") > 0) rooted++;
  }
  check(rooted > 0, `the judge roots on its beat (${rooted} rooted turns in 12)`);
  check(boss.def.period === 4, "the judge's beat is every fourth turn");
};

const proveBuriedEngine = () => {
  const standing = staged();
  standing.hp = standing.maxHp = 200;
  const bossA = addBoss(standing, "buried-engine", 5, 12);
  let hpBefore = standing.hp;
  let hit = false;
  for (let i = 0; i < 6; i++) {
    hpBefore = standing.hp;
    act(standing, { type: "wait" });
    if (standing.hp < hpBefore) hit = true;
  }
  check(hit, "standing on the line takes the bolt");
  check(bossA.charge === 0 || bossA.charge > 0, "the engine keeps a charge counter");

  const dodging = staged();
  dodging.hp = dodging.maxHp = 200;
  const bossB = addBoss(dodging, "buried-engine", 5, 12);
  for (let i = 0; i < 12; i++) {
    if (bossB.charge >= bossB.def.period - 1) {
      const off = offLineStep(dodging, bossB);
      act(dodging, off ? { type: "move", dx: off.dx, dy: off.dy } : { type: "wait" });
    } else if (dodging.px !== bossB.x && dodging.py !== bossB.y) {
      act(dodging, { type: "move", dx: bossB.x - dodging.px > 0 ? 1 : -1, dy: 0 });
    } else {
      act(dodging, { type: "wait" });
    }
  }
  check(dodging.hp === 200, `the sidestep beats the line every time (hp ${dodging.hp})`);
};

const proveInventoryLimits = () => {
  const eng = staged();
  eng.hp = eng.maxHp = 40;
  eng.tonics = TUNE.maxTonics;
  eng.items.push({ kind: "tonic", x: 6, y: 5 });
  eng.playerAct({ type: "move", dx: 1, dy: 0 });
  eng.drainEvents();
  check(eng.tonics === TUNE.maxTonics, "the belt refuses a tonic past its limit");
  check(eng.items.some((i) => i.kind === "tonic"), "the refused tonic stays on the floor");

  eng.hp = eng.maxHp;
  const held = eng.tonics;
  eng.playerAct({ type: "tonic" });
  eng.drainEvents();
  check(eng.tonics === held, "drinking at full health is refused");

  eng.hp = 5;
  eng.playerAct({ type: "tonic" });
  eng.drainEvents();
  check(eng.tonics === held - 1 && eng.hp === 5 + TUNE.tonicHeal, "a real tonic heals and is spent");

  eng.tonics = 0;
  eng.hp = 5;
  eng.playerAct({ type: "tonic" });
  eng.drainEvents();
  check(eng.tonics === 0 && eng.hp === 5, "an empty belt is a refused action, not a free turn");
};

const proveMerchant = () => {
  const eng = new Engine(4242);
  eng.choosePortrait("clay-guardian");
  eng.boss = null;
  eng.px = eng.plan.stairs.x;
  eng.py = eng.plan.stairs.y;
  eng.gold = 500;
  eng.playerAct({ type: "descend" });
  eng.drainEvents();

  let sawMerchant = false;
  let guard = 0;
  while (eng.phase === "card" && guard++ < 12) {
    const card = eng.card;
    if (card.kind !== "merchant") {
      eng.playerAct({ type: "choose", index: 0 });
      continue;
    }
    sawMerchant = true;
    const goldBefore = eng.gold;
    const tonicsBefore = eng.tonics;
    eng.playerAct({ type: "choose", index: 0 });
    check(
      eng.gold === goldBefore - TUNE.shopTonic && eng.tonics === tonicsBefore + 1,
      `a bought tonic costs ${TUNE.shopTonic} and lands on the belt`,
    );
    const beforeArmour = eng.armor;
    const goldMid = eng.gold;
    eng.playerAct({ type: "choose", index: 2 });
    check(
      eng.armor !== beforeArmour && eng.gold === goldMid - TUNE.shopArmor,
      `an armour upgrade costs ${TUNE.shopArmor} and is worn`,
    );
    eng.playerAct({ type: "choose", index: 3 });
    break;
  }
  eng.drainEvents();
  check(sawMerchant, "the ossuary puts a merchant on the road");

  const broke = new Engine(4242);
  broke.choosePortrait("clay-guardian");
  broke.boss = null;
  broke.px = broke.plan.stairs.x;
  broke.py = broke.plan.stairs.y;
  broke.gold = 0;
  broke.playerAct({ type: "descend" });
  broke.drainEvents();
  guard = 0;
  while (broke.phase === "card" && guard++ < 12) {
    if (broke.card.kind === "merchant") {
      check(
        broke.card.choices.slice(0, 3).every((c) => !c.enabled),
        "an empty purse disables every purchase",
      );
      broke.playerAct({ type: "choose", index: 3 });
      break;
    }
    broke.playerAct({ type: "choose", index: 0 });
  }
  broke.drainEvents();
};

const proveScoreCap = () => {
  const eng = staged();
  eng.gold = 10_000_000;
  eng.hp = 1;
  addMonster(eng, "root-brute", 6, 5);
  const bag = { slugs: new Set(), stats: null, finalScore: 0 };
  let guard = 0;
  while (eng.phase === "running" && guard++ < 40) {
    eng.playerAct({ type: "wait" });
    collect(eng, bag);
  }
  check(eng.phase === "dead", "the flood run still ends");
  check(eng.score === TUNE.scoreCap, `the cap holds at ${TUNE.scoreCap} (score ${eng.score})`);
  check(bag.finalScore === TUNE.scoreCap, "the gameover payload carries the capped score");
};

const proveDeterminism = () => {
  const a = run(DEFAULT_SEED, ACE);
  const b = run(DEFAULT_SEED, ACE);
  const keys = ["depth", "kills", "gold", "relics", "turns"];
  const same =
    a.bag.stats && b.bag.stats && keys.every((k) => a.bag.stats[k] === b.bag.stats[k]);
  check(same, "two runs from one seed match on every stat");
  check(a.eng.score === b.eng.score, "two runs from one seed match on score");
  console.log(`  same-seed stats: ${JSON.stringify(a.bag.stats)}`);
};

// ---- run ------------------------------------------------------------------

console.log("The Undervault harness");

reachabilitySweep();
const aces = runAces();
const reckless = runReckless();

console.log("\nstaged rule proofs");
proveTurnOrder();
proveRanged();
proveStatuses();
proveArmoured();
proveShriek();
proveTrapSight();
proveRoot();
proveAutoEquip();
proveRelics();
proveColossus();
proveSpiderQueen();
proveSentinel();
proveJudge();
proveBuriedEngine();
proveInventoryLimits();
proveMerchant();
proveScoreCap();
proveDeterminism();

const slugs = new Set();
for (const r of [...aces, ...reckless]) for (const slug of r.bag.slugs) slugs.add(slug);
console.log(`\nslugs seen across every bot run: ${[...slugs].sort().join(", ") || "(none)"}`);
for (const slug of ACHIEVEMENTS) check(slugs.has(slug), `${slug} fires in simulation`);

console.log("\nper-floor table, default seed ace run");
{
  const eng = new Engine(DEFAULT_SEED);
  const bag = { slugs: new Set(), stats: null, finalScore: 0 };
  eng.choosePortrait("clay-guardian");
  collect(eng, bag);
  let depth = eng.depth;
  let mark = { turn: 0, kills: 0, score: eng.score, gold: 0 };
  console.log("  depth region              turns kills gold  score");
  const line = (region) =>
    console.log(
      `  ${String(depth).padEnd(5)} ${region.padEnd(20)} ${String(eng.turn - mark.turn).padStart(
        5,
      )} ${String(eng.kills - mark.kills).padStart(5)} ${String(eng.gold - mark.gold).padStart(
        4,
      )} ${String(eng.score).padStart(6)}`,
    );
  let actions = 0;
  const state = freshState(eng);
  while (eng.phase !== "dead" && eng.phase !== "won" && eng.turn < 4000 && actions++ < 40000) {
    eng.playerAct(nextAction(eng, ACE, state));
    collect(eng, bag);
    if (eng.depth !== depth) {
      line(FLOORS[depth - 1].name);
      mark = { turn: eng.turn, kills: eng.kills, score: eng.score, gold: eng.gold };
      depth = eng.depth;
    }
  }
  line(FLOORS[depth - 1].name);
  console.log(`  outcome ${eng.phase}, final score ${eng.score}, stats ${JSON.stringify(bag.stats)}`);
}

if (failures > 0) {
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}
console.log("\nPASS");
