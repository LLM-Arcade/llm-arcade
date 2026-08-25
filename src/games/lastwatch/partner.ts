// The AI partner: a full class character driven by utility scoring. It
// produces the same InputState a human would, so the engine treats both
// identically and the harness can assert every behavior.

import { emptyInput, type InputState, type RoomId } from "./types.ts";
import { CLASSES, KIT, upgradeEffects } from "./kits.ts";
import { WEAPONS } from "./arsenal.ts";
import { GLOAM } from "./gloam.ts";
import { DOORS, ROOMS, WATCHFIRE_POS, doorMid, elevAt, findPath, hasLos } from "./hold.ts";
import type { Character, Engine, GloamUnit } from "./engine.ts";

export type PartnerObjective =
  | "revive"
  | "survive"
  | "heal"
  | "counter-raid"
  | "command"
  | "fight"
  | "hold";

export interface PartnerBrain {
  objective: PartnerObjective;
  thinkT: number;
  anchor: { room: RoomId; x: number; y: number } | null;
  targetId: number;
  act: "idle" | "light" | "heavy" | "draw" | "bolt";
  actT: number;
  aimErrX: number;
  aimErrY: number;
  retargetT: number;
}

const THINK_EVERY = 0.5; // s
const REACTION = 0.3; // s after a target switch before firing
const AIM_ERR = 0.052; // rad, about 3 degrees of standard error
const LOW_HP = 0.3;
const ALLY_HEAL_AT = 0.6;

function dodgeIncoming(eng: Engine, me: Character, input: InputState) {
  for (const imp of eng.impacts) {
    if (imp.hurts !== "watch" || imp.room !== me.room) continue;
    if (Math.hypot(imp.x - me.x, imp.y - me.y) < 2.2) {
      const rx = Math.cos(input.yaw - Math.PI / 2);
      const ry = Math.sin(input.yaw - Math.PI / 2);
      const side = (imp.x - me.x) * rx + (imp.y - me.y) * ry > 0 ? -1 : 1;
      input.strafe = side;
      return;
    }
  }
  // Standing in a burn puddle is never the plan either.
  for (const h of eng.hazards) {
    if (h.hurts !== "watch" || h.room !== me.room) continue;
    if (Math.hypot(h.x - me.x, h.y - me.y) < h.radius + 0.6) {
      const away = Math.atan2(me.y - h.y, me.x - h.x);
      const fx = Math.cos(input.yaw);
      const fy = Math.sin(input.yaw);
      input.forward = Math.cos(away) * fx + Math.sin(away) * fy;
      const rx = Math.cos(input.yaw - Math.PI / 2);
      const ry = Math.sin(input.yaw - Math.PI / 2);
      input.strafe = Math.cos(away) * rx + Math.sin(away) * ry;
      return;
    }
  }
}

export function partnerThink(eng: Engine, me: Character, brain: PartnerBrain): InputState {
  const input = partnerThinkInner(eng, me, brain);
  if (me.state === "up") dodgeIncoming(eng, me, input);
  return input;
}

function partnerThinkInner(eng: Engine, me: Character, brain: PartnerBrain): InputState {
  const input = emptyInput();
  input.yaw = me.yaw;
  input.pitch = me.pitch;
  if (me.state === "gone") return input;
  const player = eng.chars[0];

  brain.thinkT -= 1 / 60;
  brain.retargetT = Math.max(0, brain.retargetT - 1 / 60);
  if (brain.thinkT <= 0) {
    brain.thinkT = THINK_EVERY;
    decide(eng, me, brain);
  }

  if (me.state === "downed") {
    // Crawl toward the player so the revive is short.
    if (player.state === "up") moveToward(eng, me, input, player.room, player.x, player.y);
    return input;
  }

  switch (brain.objective) {
    case "revive": {
      if (player.state !== "downed") break;
      const d = Math.hypot(player.x - me.x, player.y - me.y);
      // Clear a bubble only against a real swarm; through light pressure,
      // tank the hits and channel. Three seconds beats a trade.
      const swarm = eng.gloam.filter(
        (g) => g.room === player.room &&
          Math.hypot(g.x - player.x, g.y - player.y) < 3,
      ).length;
      if (swarm >= 3 && me.hp > me.maxHp * 0.5 && d < 6) {
        const crowd = nearestThreat(eng, player.x, player.y, player.room, 3);
        if (crowd) {
          aimAt(eng, me, brain, input, crowd);
          attackWith(eng, me, brain, input, crowd);
          return input;
        }
      }
      if (d > KIT.reviveRange) {
        moveToward(eng, me, input, player.room, player.x, player.y);
      } else {
        input.interact = true;
      }
      return input;
    }
    case "survive": {
      const chaser = nearestThreat(eng, me.x, me.y, me.room, 9);
      if (chaser) {
        // Back away while putting the pursuer down. Outrunning a faster
        // Gloam is not a plan; a dead one is.
        const dx = me.x - chaser.x;
        const dy = me.y - chaser.y;
        const l = Math.hypot(dx, dy) || 1;
        aimAt(eng, me, brain, input, chaser);
        const fx = Math.cos(input.yaw);
        const fy = Math.sin(input.yaw);
        const rx = Math.cos(input.yaw - Math.PI / 2);
        const ry = Math.sin(input.yaw - Math.PI / 2);
        input.forward = (dx * fx + dy * fy) / l;
        input.strafe = (dx * rx + dy * ry) / l;
        const w = WEAPONS[me.weapon.id];
        const reach = (w.reach ?? 2.4) + chaser.radius;
        const d = Math.hypot(chaser.x - me.x, chaser.y - me.y);
        if (me.cls === "knight") {
          if (d <= reach && me.attackCd <= 0) input.primary = pulse(brain, w.cycle ?? 0.5);
          else input.secondary = true; // shield up while backing off
        } else if (me.cls === "archer") {
          if (d < 2.5) input.secondary = true; // dagger backstep
          else if (me.arrows > 0) input.primary = pulse(brain, 0.6);
        } else if (me.mana >= 10) {
          input.primary = pulse(brain, 0.5);
        }
        return input;
      }
      moveToward(eng, me, input, "gateyard", WATCHFIRE_POS.x, WATCHFIRE_POS.y + 2);
      const threat = nearestThreat(eng, me.x, me.y, me.room, 10);
      if (me.cls === "mage" && threat == null) {
        // Self-mend once clear: aim away from the ally so the heal lands home.
        input.yaw = Math.atan2(me.y - player.y, me.x - player.x);
        input.secondary = pulse(brain, 0.8);
      } else if (me.bandages > 0 && threat == null && me.bandageT <= 0) {
        input.bandage = true;
      }
      return input;
    }
    case "heal": {
      const d = Math.hypot(player.x - me.x, player.y - me.y);
      const sees =
        player.room === me.room ||
        hasLos(me.room, me.x, me.y, player.room, player.x, player.y, (dr) => eng.doorOpen[dr.id]);
      if (d > KIT.mendRange - 2 || !sees) {
        moveToward(eng, me, input, player.room, player.x, player.y);
      } else {
        input.yaw = Math.atan2(player.y - me.y, player.x - me.x);
        input.secondary = pulse(brain, 0.8);
        eng.bark("partner-heal");
      }
      return input;
    }
    case "counter-raid":
    case "fight": {
      const target = eng.gloam.find((g) => g.id === brain.targetId) ?? null;
      if (!target) break;
      aimAt(eng, me, brain, input, target);
      attackWith(eng, me, brain, input, target);
      return input;
    }
    default:
      break;
  }

  // Hold or command: sit the anchor, fight what comes.
  const anchor = brain.anchor ?? { room: "gateyard" as RoomId, x: 0, y: 20 };
  // A knight partner peels for the ranged player: taunt when the swarm
  // reaches either of you.
  if (me.cls === "knight" && me.skillCd <= 0) {
    const pressOnAlly = eng.gloam.filter(
      (g) => g.room === player.room &&
        Math.hypot(g.x - player.x, g.y - player.y) < 6,
    ).length;
    const pressOnMe = eng.gloam.filter(
      (g) => g.room === me.room && Math.hypot(g.x - me.x, g.y - me.y) < 6,
    ).length;
    if (pressOnAlly >= 2 || pressOnMe >= 3) input.skill = true;
  }
  const target = pickTarget(eng, me);
  if (target) {
    brain.targetId = target.id;
    aimAt(eng, me, brain, input, target);
    attackWith(eng, me, brain, input, target);
    // Melee closes distance; ranged holds the anchor.
    if (WEAPONS[me.weapon.id].kind !== "melee") {
      const da = Math.hypot(anchor.x - me.x, anchor.y - me.y);
      if (da > 4 || me.room !== anchor.room) {
        moveToward(eng, me, input, anchor.room, anchor.x, anchor.y);
      }
    }
    return input;
  }
  const da = Math.hypot(anchor.x - me.x, anchor.y - me.y);
  if (me.room !== anchor.room || da > 2) {
    moveToward(eng, me, input, anchor.room, anchor.x, anchor.y);
  } else if (
    me.bandages > 0 &&
    me.hp < me.maxHp * 0.6 &&
    me.bandageT <= 0 &&
    nearestThreat(eng, me.x, me.y, me.room, 8) == null
  ) {
    input.bandage = true;
  }
  return input;
}

function decide(eng: Engine, me: Character, brain: PartnerBrain) {
  const player = eng.chars[0];
  const prev = brain.objective;
  const hpFrac = me.hp / me.maxHp;

  if (player.state === "downed") {
    brain.objective = "revive";
  } else if (hpFrac < LOW_HP && me.state === "up") {
    brain.objective = "survive";
    if (prev !== "survive") eng.bark("partner-retreat");
  } else if (
    me.cls === "mage" &&
    player.state === "up" &&
    player.hp / player.maxHp < ALLY_HEAL_AT &&
    me.mana >= 40
  ) {
    brain.objective = "heal";
  } else {
    const raid = eng.gloam.find(
      (g) =>
        (g.type === "filcher" && (g.state === "steal" || g.state === "flee")) ||
        (g.type === "sapper" && g.state === "dig"),
    );
    const playerBusy = raid
      ? Math.hypot(player.x - raid.x, player.y - raid.y) > 12
      : false;
    const raidGuard = raid
      ? eng.gloam.filter(
          (g) => g.room === raid.room &&
            Math.hypot(g.x - raid.x, g.y - raid.y) < 6,
        ).length
      : 99;
    if (raid && playerBusy && raidGuard <= 3 && hpFrac > 0.6) {
      brain.objective = "counter-raid";
      brain.targetId = raid.id;
    } else {
      const target = pickTarget(eng, me);
      if (target) {
        brain.objective = "fight";
        if (brain.targetId !== target.id) brain.retargetT = REACTION;
        brain.targetId = target.id;
      } else {
        brain.objective = "hold";
      }
    }
  }

  // Anchor from the command wheel.
  switch (eng.command) {
    case "defend-arch":
      brain.anchor = { room: "gateyard", x: 0, y: 22 };
      break;
    case "follow":
      brain.anchor = { room: player.room, x: player.x, y: player.y };
      break;
    case "regroup":
      brain.anchor = { room: "gateyard", x: WATCHFIRE_POS.x + 2, y: WATCHFIRE_POS.y };
      break;
    default:
      brain.anchor = hottestChoke(eng);
      break;
  }
  // Fresh aim error per think so the hand drifts like a hand.
  brain.aimErrX = (eng.rng() + eng.rng() - 1) * AIM_ERR;
  brain.aimErrY = (eng.rng() + eng.rng() - 1) * AIM_ERR;
}

// The busiest live approach: anchor behind the door with the most gloam
// pressing toward it.
function hottestChoke(eng: Engine): { room: RoomId; x: number; y: number } {
  let best = { room: "gateyard" as RoomId, x: 0, y: 21 };
  let bestCount = -1;
  const player = eng.chars[0];
  for (const d of DOORS) {
    if (!eng.doorOpen[d.id]) continue;
    let inner = d.a === "gateyard" || d.b === "gateyard" ? "gateyard"
      : d.a === "hall" || d.b === "hall" ? "hall"
      : d.a === "armory" || d.b === "armory" ? "armory"
      : d.a === "wellcourt" || d.b === "wellcourt" ? "wellcourt"
      : null;
    if (!inner) continue;
    // Hold district chokes only beside the player; alone, fall back to
    // the yard side and let the flow come to you.
    if (inner !== "gateyard" && player.room !== inner) inner = "gateyard";
    const mid = doorMid(d);
    let count = 0;
    for (const g of eng.gloam) {
      if (Math.hypot(g.x - mid.x, g.y - mid.y) < 16) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      const room = ROOMS[inner as RoomId];
      const cx = Math.max(room.x0 + 1, Math.min(room.x1 - 1, mid.x));
      const cy = Math.max(room.y0 + 1, Math.min(room.y1 - 1, mid.y + (inner === "gateyard" ? -2.5 : 2.5)));
      best = { room: inner as RoomId, x: cx, y: cy };
    }
  }
  return best;
}

const INTERIOR: Set<RoomId> = new Set([
  "gateyard",
  "armory",
  "wellcourt",
  "hall",
  "undercroft",
  "stairW",
  "stairE",
  "rampart",
]);

function pickTarget(eng: Engine, me: Character): GloamUnit | null {
  const player = eng.chars[0];
  const melee = WEAPONS[me.weapon.id].kind === "melee";
  let best: GloamUnit | null = null;
  let bestScore = -Infinity;
  for (const g of eng.gloam) {
    // A melee partner holds the walls; it never chases into the open.
    if (melee && !INTERIOR.has(g.room)) continue;
    const d = Math.hypot(g.x - me.x, g.y - me.y);
    if (d > 34) continue;
    const sees =
      g.room === me.room ||
      hasLos(me.room, me.x, me.y, g.room, g.x, g.y, (dr) => eng.doorOpen[dr.id]);
    if (!sees) continue;
    let score = -d;
    if (g.type === "hexer") score += 100;
    else if (g.type === "alpha") score += 70;
    else if (g.type === "lobber") score += 50;
    else if (g.type === "breacher" && g.state === "chew") score += 40;
    else if (GLOAM[g.type].boss) score += 30;
    const dToPlayer = Math.hypot(g.x - player.x, g.y - player.y);
    if (dToPlayer < 4) score += 25;
    best = score > bestScore ? ((bestScore = score), g) : best;
  }
  return best;
}

function nearestThreat(
  eng: Engine,
  x: number,
  y: number,
  room: RoomId,
  radius: number,
): GloamUnit | null {
  let best: GloamUnit | null = null;
  let bestD = radius;
  for (const g of eng.gloam) {
    if (g.room !== room) continue;
    const d = Math.hypot(g.x - x, g.y - y);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

function moveToward(
  eng: Engine,
  me: Character,
  input: InputState,
  room: RoomId,
  x: number,
  y: number,
) {
  let tx = x;
  let ty = y;
  if (me.room !== room) {
    const path = findPath(me.room, room, eng.doorPassableWatch, () => 0);
    if (path && path.length > 0) {
      const mid = doorMid(path[0]);
      tx = mid.x;
      ty = mid.y;
    }
  }
  const dx = tx - me.x;
  const dy = ty - me.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.2) return;
  // World direction into the local frame of the current aim yaw.
  const fx = Math.cos(input.yaw);
  const fy = Math.sin(input.yaw);
  const rx = Math.cos(input.yaw - Math.PI / 2);
  const ry = Math.sin(input.yaw - Math.PI / 2);
  input.forward = Math.max(-1, Math.min(1, (dx * fx + dy * fy) / d));
  input.strafe = Math.max(-1, Math.min(1, (dx * rx + dy * ry) / d));
  if (d > 8 && !me.charging) input.sprint = true;
}

function aimAt(
  eng: Engine,
  me: Character,
  brain: PartnerBrain,
  input: InputState,
  target: GloamUnit,
) {
  const dx = target.x - me.x;
  const dy = target.y - me.y;
  const d = Math.hypot(dx, dy) || 1;
  input.yaw = Math.atan2(dy, dx) + brain.aimErrX;
  const eye = elevAt(ROOMS[me.room], me.y) + CLASSES[me.cls].eyeHeight;
  const targetMid = elevAt(ROOMS[target.room], target.y) + target.height * 0.55;
  input.pitch = Math.atan2(targetMid - eye, d) + brain.aimErrY;
}

function attackWith(
  eng: Engine,
  me: Character,
  brain: PartnerBrain,
  input: InputState,
  target: GloamUnit,
) {
  const w = WEAPONS[me.weapon.id];
  // Reaction pauses gate aimed shots; a melee arc hits whatever stands in
  // it, so the swing keeps its rhythm through target churn.
  if (brain.retargetT > 0 && w.kind !== "melee") return;
  const d = Math.hypot(target.x - me.x, target.y - me.y);

  if (w.kind === "melee") {
    const reach = (w.reach ?? 2.4) + target.radius;
    if (d > reach * 0.9 && brain.act === "idle") {
      moveToward(eng, me, input, target.room, target.x, target.y);
    }
    const crowd = eng.gloam.filter(
      (g) => g.room === me.room && Math.hypot(g.x - me.x, g.y - me.y) < 4,
    ).length;
    if (me.cls === "knight" && crowd >= 2 && brain.act === "idle" && me.attackCd > 0.2 && me.guard > 25) {
      input.secondary = true;
    }
    // Swing state machine: wind up once, release once. The release edge
    // is what fires, so the hold must actually end.
    if (brain.act === "idle" && d <= reach && me.attackCd <= 0) {
      brain.act = crowd >= 3 ? "heavy" : "light";
      brain.actT = 0;
    }
    if (brain.act === "heavy" || brain.act === "light") {
      brain.actT += 1 / 60;
      const hold = brain.act === "heavy" ? (w.heavyWindup ?? 1.1) + 0.05 : 0.04;
      if (brain.actT <= hold) {
        input.primary = true;
      } else {
        input.primary = false;
        brain.act = "idle";
        brain.actT = 0;
      }
    }
    return;
  }

  if (w.kind === "bow") {
    if (me.arrows <= 0) return;
    if (d < 3) {
      input.secondary = true; // dagger panic
      return;
    }
    if (w.flat) {
      input.primary = me.attackCd <= 0;
      return;
    }
    const drawMult = upgradeEffects.drawMult[me.tiers["draw-line"] ?? 0];
    const need = (w.chargeTime ?? 0.9) * drawMult + 0.08;
    if (me.attackCd <= 0) {
      brain.actT += 1 / 60;
      if (brain.actT <= need) input.primary = true;
      else {
        input.primary = false;
        brain.actT = 0;
      }
    }
    return;
  }

  // Focus: bolts, with a burn field on a real cluster.
  const cluster = eng.gloam.filter(
    (g) => g.room === target.room && Math.hypot(g.x - target.x, g.y - target.y) < 3.5,
  ).length;
  const mendCost = 30;
  const reserve = eng.chars[0].hp / eng.chars[0].maxHp < 0.75 ? mendCost : 0;
  if (
    cluster >= 4 &&
    me.skillCd <= 0 &&
    me.mana >= KIT.burnFieldCost + reserve &&
    d < 10
  ) {
    input.skill = true;
    return;
  }
  if (me.mana >= (w.boltCost ?? 6) + reserve && me.attackCd <= 0) {
    input.primary = pulse(brain, w.boltCycle ?? 0.45);
  }
}

// A press that lasts one think-slice then releases, so edge-triggered
// actions fire once per cycle.
function pulse(brain: PartnerBrain, cycle: number): boolean {
  brain.actT += 1 / 60;
  if (brain.actT >= cycle * 1.2) brain.actT = 0; // competence pad: ~80% ace rate
  return brain.actT < 0.05;
}
