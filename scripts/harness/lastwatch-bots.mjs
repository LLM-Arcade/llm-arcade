// Lastwatch harness bots: the ace duo driver, the quality-bar casual, and
// their shared aim helpers. Imported by the proof harness and by ad-hoc
// debug runs.

import { emptyInput } from "../../src/games/lastwatch/types.ts";
import { WEAPONS } from "../../src/games/lastwatch/arsenal.ts";
import { KIT, CLASSES, upgradeEffects } from "../../src/games/lastwatch/kits.ts";
import { GLOAM } from "../../src/games/lastwatch/gloam.ts";
import { ROOMS, WATCHFIRE_POS, elevAt, findPath, doorMid, hasLos } from "../../src/games/lastwatch/hold.ts";

const TICK = 1 / 60;

export {
  aimAtUnit,
  nearestUnit,
  priorityUnit,
  makeAce,
  walkTo,
  aceInput,
  aceShop,
  makeCasual,
  casualInput,
};

function aimAtUnit(eng, c, u, headshot) {
  const dx = u.x - c.x;
  const dy = u.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const eye = elevAt(ROOMS[c.room], c.y) + CLASSES[c.cls].eyeHeight;
  const frac = headshot ? 0.93 : 0.55;
  const targetH = elevAt(ROOMS[u.room], u.y) + u.height * frac;
  return { yaw: Math.atan2(dy, dx), pitch: Math.atan2(targetH - eye, d) };
}

function nearestUnit(eng, c, filter = () => true) {
  let best = null;
  let bestD = Infinity;
  for (const u of eng.gloam) {
    if (!filter(u)) continue;
    const d = Math.hypot(u.x - c.x, u.y - c.y);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best ? { u: best, d: bestD } : null;
}

function priorityUnit(eng, c) {
  let best = null;
  let bestScore = -Infinity;
  const ranged = WEAPONS[c.weapon.id].kind !== "melee";
  for (const u of eng.gloam) {
    // Never aim at what the arrow cannot reach.
    if (
      ranged &&
      u.room !== c.room &&
      !hasLos(c.room, c.x, c.y, u.room, u.x, u.y, (d2) => eng.doorOpen[d2.id])
    ) {
      continue;
    }
    const d = Math.hypot(u.x - c.x, u.y - c.y);
    let s = -d;
    if (u.type === "hexer") s += 120;
    if (u.type === "alpha") s += 80;
    if (u.type === "lobber") s += 60;
    if (u.type === "filcher") s += 90;
    if (u.type === "sapper") s += 70;
    if (u.type === "stalker") s += 85;
    if (GLOAM[u.type].boss) s += 40;
    if (s > bestScore) {
      bestScore = s;
      best = u;
    }
  }
  return best;
}


export function weaponScore(inst) {
  const def = WEAPONS[inst.id];
  let s = def.tier;
  if (inst.quality === "fine") s += 0.3;
  if (inst.quality === "masterwork") s += 0.6;
  if (inst.id === "repeater") s -= 2.5;
  if (inst.id === "crossbow") s -= 0.4;
  return s;
}

function makeAce() {
  return { draw: 0, lastWave: 0, errands: [] };
}

function walkTo(eng, c, input, room, x, y) {
  let tx = x;
  let ty = y;
  if (c.room !== room) {
    const crowdCost = (d) => {
      const mid = doorMid(d);
      let n = 0;
      for (const g of eng.gloam) {
        if (Math.hypot(g.x - mid.x, g.y - mid.y) < 4) n++;
      }
      return n * 20;
    };
    const path = findPath(c.room, room, (d) => eng.doorOpen[d.id], crowdCost);
    if (path && path.length > 0) {
      const mid = doorMid(path[0]);
      tx = mid.x;
      ty = mid.y;
    }
  }
  const dx = tx - c.x;
  const dy = ty - c.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.2) {
    input.yaw = Math.atan2(dy, dx);
    input.forward = 1;
    input.sprint = d > 4;
  }
  return c.room === room && Math.hypot(x - c.x, y - c.y) < 2;
}

function aceInput(eng, mem) {
  const c = eng.chars[0];
  const input = emptyInput();
  input.yaw = c.yaw;
  input.pitch = c.pitch;
  if (c.state !== "up") {
    const p = eng.chars[1];
    if (p.state === "up") {
      input.yaw = Math.atan2(p.y - c.y, p.x - c.x);
      input.forward = 1;
    }
    return input;
  }
  const partner = eng.chars[1];

  // Intermission errands: walk the stations and spend.
  if (eng.phase === "intermission" && mem.errands.length > 0) {
    const e = mem.errands[0];
    if (walkTo(eng, c, input, e.room, e.x, e.y)) {
      e.action(eng, c);
      mem.errands.shift();
    }
    return input;
  }

  if (partner.state === "downed") {
    // Fight through anything pressing the approach; a corpse revives
    // nobody.
    const blocker = nearestUnit(eng, c, (u) => u.room === c.room);
    if (blocker && blocker.d < 5) {
      const aim = aimAtUnit(eng, c, blocker.u, false);
      input.yaw = aim.yaw;
      input.pitch = aim.pitch;
      if (WEAPONS[c.weapon.id].kind === "bow") {
        if (blocker.d < 2.6) input.secondary = true;
        else input.primary = c.attackCd <= 0;
      } else {
        input.primary = c.attackCd <= 0;
      }
      return input;
    }
    const d = Math.hypot(partner.x - c.x, partner.y - c.y);
    if (d > KIT.reviveRange) {
      walkTo(eng, c, input, partner.room, partner.x, partner.y);
    } else {
      input.interact = true;
    }
    return input;
  }

  if (c.bandages > 0 && c.hp < c.maxHp * 0.5) {
    const threat = nearestUnit(eng, c);
    if (!threat || threat.d > 6) input.bandage = true;
  }

  const w0 = WEAPONS[c.weapon.id];
  // The archer ace fights from the rampart: high ground over the causeway
  // funnel. When the stairs are contested it drops to the yard and kites.
  const highGroundThreats = eng.gloam.filter(
    (g) => g.room === "rampart" || g.room === "stairW" || g.room === "stairE",
  ).length;
  const q = eng.chars[1];
  const rally = q.state === "up" && q.room === "gateyard"
    ? { room: "gateyard", x: q.x, y: Math.max(2, q.y - 4) }
    : { room: "gateyard", x: 0, y: 13 };
  // Climbers on the wall: back down the rampart away from them and keep
  // one-shotting the single-file line. The rampart is its own funnel.
  let post = w0.kind === "bow"
    ? { room: "rampart", x: 0, y: 25.8 }
    : rally;
  if (w0.kind === "bow" && c.room === "rampart" && highGroundThreats > 0) {
    const near = nearestUnit(eng, c, (u) =>
      u.room === "rampart" || u.room === "stairW" || u.room === "stairE",
    );
    if (near) {
      const away = near.u.x > c.x ? -18 : 18;
      post = { room: "rampart", x: away, y: 25.8 };
      if (highGroundThreats >= 6 && near.d < 5) {
        walkTo(eng, c, input, rally.room, rally.x, rally.y);
        return input;
      }
      if (near.d < 4) {
        input.strafe = near.u.x > c.x ? -1 : 1;
      }
    }
  }
  if (w0.kind === "bow" && c.room !== "rampart" && eng.phase === "combat") {
    const dry = c.arrows === 0;
    if (!dry) {
      walkTo(eng, c, input, post.room, post.x, post.y);
      return input;
    }
  }
  // Arrow economy: when dry, drop down and collect bundles.
  if (w0.kind === "bow" && c.arrows === 0) {
    const bundle = eng.drops.find((dr) => dr.kind === "arrows" || dr.kind === "satchel");
    if (bundle) {
      walkTo(eng, c, input, bundle.room, bundle.x, bundle.y);
      return input;
    }
  }
  // Dodge incoming globs: sidestep anything landing on this spot.
  for (const imp of eng.impacts) {
    if (imp.hurts !== "watch" || imp.room !== c.room) continue;
    if (Math.hypot(imp.x - c.x, imp.y - c.y) < 2.2) {
      input.strafe = c.x < imp.x ? -1 : 1;
      input.forward = 0.3;
    }
  }

  const target = priorityUnit(eng, c);
  if (!target) {
    const drop = eng.drops.find((dr) => dr.room === c.room);
    const goal = drop ?? post;
    const d = Math.hypot(goal.x - c.x, goal.y - c.y);
    if (d > 1) {
      if (goal.room && goal.room !== c.room) walkTo(eng, c, input, goal.room, goal.x, goal.y);
      else {
        input.yaw = Math.atan2(goal.y - c.y, goal.x - c.x);
        input.forward = 1;
      }
    }
    mem.draw = 0;
    return input;
  }

  const dist = Math.hypot(target.x - c.x, target.y - c.y);
  const w = WEAPONS[c.weapon.id];
  const crowdNear = eng.gloam.filter(
    (g) => g.room === c.room && Math.hypot(g.x - c.x, g.y - c.y) < 5,
  ).length;

  if (w.kind === "melee") {
    const aim = aimAtUnit(eng, c, target, false);
    input.yaw = aim.yaw;
    input.pitch = aim.pitch;
    const reach = (w.reach ?? 2.4) + target.radius;
    const telegraphed = eng.gloam.some(
      (g) => g.room === c.room && g.state === "telegraph" &&
        Math.hypot(g.x - c.x, g.y - c.y) < 4.5,
    );
    if (telegraphed) {
      input.secondary = true;
      mem.draw = 0;
      return input;
    }
    if (dist > reach * 0.85) {
      input.forward = 1;
      input.sprint = dist > 8;
      mem.draw = 0;
      return input;
    }
    const wantHeavy = crowdNear >= 3;
    const need = wantHeavy ? (w.heavyWindup ?? 1.1) + 0.05 : 0.05;
    mem.draw += TICK;
    const hold = mem.draw < need || c.attackCd > 0;
    input.primary = hold;
    if (!hold) mem.draw = 0;
    return input;
  }

  if (w.kind === "bow") {
    const wantBodkin = target.type === "breacher" || target.type === "ironback" ||
      target.type === "coalhide";
    if (wantBodkin !== (c.arrowType === "bodkin")) input.cycleAmmo = true;
    if (dist < 2.6) {
      const aim = aimAtUnit(eng, c, target, false);
      input.yaw = aim.yaw;
      input.secondary = true;
      mem.draw = 0;
      return input;
    }
    const aim = aimAtUnit(eng, c, target, true);
    input.yaw = aim.yaw;
    input.pitch = aim.pitch;
    if (c.room !== "rampart" && (dist < 7 || crowdNear >= 2)) input.forward = -1;
    if (c.trapCharges > 0 && dist < 7 && crowdNear >= 2) input.skill = true;
    if (c.arrows > 0) {
      if (w.flat) {
        input.primary = c.attackCd <= 0;
      } else {
        const need = (w.chargeTime ?? 0.9) *
          upgradeEffects.drawMult[c.tiers["draw-line"] ?? 0] + 0.06;
        mem.draw += TICK;
        const hold = mem.draw < need || c.attackCd > 0;
        input.primary = hold;
        if (!hold) mem.draw = 0;
      }
    }
    return input;
  }

  // Mage ace.
  const hurtAlly = partner.state === "up" && partner.hp < partner.maxHp * 0.55;
  if (hurtAlly && c.mana >= 30) {
    const d = Math.hypot(partner.x - c.x, partner.y - c.y);
    input.yaw = Math.atan2(partner.y - c.y, partner.x - c.x);
    if (d > KIT.mendRange - 2) input.forward = 1;
    else input.secondary = pulseOnce(mem);
    return input;
  }
  const aim = aimAtUnit(eng, c, target, false);
  input.yaw = aim.yaw;
  input.pitch = aim.pitch;
  if (dist < 7 || crowdNear >= 2) input.forward = -1;
  const cluster = eng.gloam.filter(
    (g) => g.room === target.room && Math.hypot(g.x - target.x, g.y - target.y) < 3.2,
  ).length;
  if (cluster >= 4 && c.skillCd <= 0 && c.mana >= KIT.burnFieldCost + 20 && dist < 10) {
    input.skill = true;
    return input;
  }
  if (c.mana >= (w.boltCost ?? 8)) {
    mem.draw += TICK;
    input.primary = mem.draw < 0.05;
    if (mem.draw > (w.boltCycle ?? 0.45) + 0.05) mem.draw = 0;
  }
  return input;
}

function pulseOnce(mem) {
  mem.draw += TICK;
  if (mem.draw > 0.8) mem.draw = 0;
  return mem.draw < 0.05;
}

// Ace intermission shopping, survival first: ammo and bandages, then
// repairs, then walls and districts, then power. Runs once per intermission.
function aceShop(eng, mem) {
  if (eng.phase !== "intermission" || mem.lastWave === eng.wave) return;
  mem.lastWave = eng.wave;
  const c = eng.chars[0];
  if (eng.bossCacheOffer) {
    let bestIdx = -1;
    let bestGain = 0;
    for (let i = 0; i < eng.bossCacheOffer.length; i++) {
      const off = eng.bossCacheOffer[i];
      const who = WEAPONS[off.id].cls === c.cls ? 0 : WEAPONS[off.id].cls === eng.chars[1].cls ? 1 : -1;
      if (who < 0) continue;
      const gain = weaponScore(off) - weaponScore(eng.chars[who].weapon);
      if (gain >= 0.25 && gain > bestGain) {
        bestGain = gain;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const off = eng.bossCacheOffer[bestIdx];
      eng.claimBossCache(bestIdx, WEAPONS[off.id].cls === c.cls ? 0 : 1);
    } else {
      eng.bossCacheOffer = null; // a downgrade is left in the crate
    }
  }
  if (c.cls === "archer") eng.buy("quiver");
  while (c.bandages < KIT.maxBandages && eng.valor > 120) {
    if (!eng.buy("bandage")) break;
  }
  for (const id of ["bar-arch", "bar-sap", "bar-postern", "bar-hall-windows", "bar-armory-breach"]) {
    const s = eng.structures[id];
    if (s.tier > 0 && s.hp < s.maxHp * 0.8) eng.buy(`repair:${id}`);
  }
  if (eng.structures.watchfire.hp < 800) eng.buy("stoke");
  // Gear outranks everything below: when the racks hold a better weapon,
  // this intermission is a gear trip and the valor is held for it.
  mem.errands = [];
  const rackGate = WEAPONS[c.weapon.id].tier === 0 ? 300 : 550;
  if (eng.districts.armory && eng.valor > rackGate) {
    const better = eng.rackStock.some(
      (s) =>
        (WEAPONS[s.weapon.id].cls === c.cls &&
          weaponScore(s.weapon) > weaponScore(c.weapon)) ||
        (WEAPONS[s.weapon.id].cls === eng.chars[1].cls &&
          weaponScore(s.weapon) > weaponScore(eng.chars[1].weapon) + 0.5),
    );
    if (better) {
      mem.errands.push({
        room: "armory", x: -11, y: -7,
        action: (e) => {
          let bi = -1;
          let bg = 0;
          for (let i = 0; i < e.rackStock.length; i++) {
            const s = e.rackStock[i];
            if (WEAPONS[s.weapon.id].cls !== e.chars[0].cls) continue;
            const gain = weaponScore(s.weapon) - weaponScore(e.chars[0].weapon);
            if (gain > bg) {
              bg = gain;
              bi = i;
            }
          }
          if (bi >= 0) e.buy(`rack:${bi}`);
          // The partner's steel matters as much: buy its upgrade too.
          let pi = -1;
          let pg = 0;
          for (let i = 0; i < e.rackStock.length; i++) {
            const s = e.rackStock[i];
            if (WEAPONS[s.weapon.id].cls !== e.chars[1].cls) continue;
            const gain = weaponScore(s.weapon) - weaponScore(e.chars[1].weapon);
            if (gain > pg) {
              pg = gain;
              pi = i;
            }
          }
          if (pi >= 0) e.buy(`rack:${pi}`, 1);
        },
      });
      return;
    }
  }
  const reserve = 150;
  if (eng.wave >= 5 && !eng.districts.armory && eng.valor > 250 + reserve) eng.buy("district:armory");
  if (eng.wave >= 8 && !eng.districts.wellcourt && eng.valor > 250 + reserve) eng.buy("district:wellcourt");
  if (eng.wave >= 10 && !eng.districts.hall && eng.valor > 400 + reserve) eng.buy("district:hall");
  if (eng.wave >= 12 && !eng.districts.undercroft && eng.valor > 300 + reserve) eng.buy("district:undercroft");
  while (eng.chars[1].bandages < KIT.maxBandages && eng.valor > 200) {
    if (!eng.buy("bandage", 1)) break;
  }
  if (eng.wave >= 6) eng.buy("barricade-tier:bar-arch");
  if (eng.wave >= 8) {
    for (const id of ["bar-arch", "bar-sap", "bar-postern", "bar-armory-breach", "bar-hall-windows"]) {
      const s = eng.structures[id];
      if (s.tier === 0) eng.buy(`barricade-install:${id}`);
      if (s.tier > 0 && s.tier < 3) eng.buy(`barricade-tier:${id}`);
    }
  }
  // The supply run comes before power: poultice regen for both is the
  // cheapest effective HP in the hold.
  if (eng.districts.wellcourt && eng.wave >= 9 && eng.valor > 150) {
    mem.errands.push({
      room: "wellcourt", x: 8, y: -12,
      action: (e) => {
        e.buy("poultice");
        e.buy("poultice", 1);
      },
    });
  }
  if (eng.districts.hall && eng.valor > 500 && (c.mealWaves ?? 0) === 0) {
    mem.errands.push({ room: "hall", x: 0, y: -22, action: (e) => e.buy("meal") });
  }
  const supplyReserve = mem.errands.length > 0 ? 170 : 0;
  if (eng.valor <= supplyReserve) return;
  // One line at a time: the primary damage line, then capacity, then the
  // partner, so income never starves consumables.
  const primary = { knight: "plate-line", archer: "draw-line", mage: "focus-line" }[c.cls];
  const secondary = { knight: "guard-line", archer: "quiver-line", mage: "attune-line" }[c.cls];
  const tertiary = { knight: "fervor-line", archer: "traps-line", mage: "mending-line" }[c.cls];
  if (eng.valor > 200) eng.buy(`upgrade:${primary}`);
  if (eng.valor > 300) eng.buy(`upgrade:${secondary}`);
  if (eng.valor > 450) eng.buy(`upgrade:${tertiary}`);
  {
    const plines = {
      knight: ["plate-line", "guard-line", "fervor-line"],
      archer: ["draw-line", "quiver-line", "traps-line"],
      mage: ["mending-line", "attune-line", "focus-line"],
    }[eng.chars[1].cls];
    if (eng.valor > 400) eng.buy(`upgrade:${plines[0]}`, 1);
    if (eng.valor > 550) eng.buy(`upgrade:${plines[1]}`, 1);
    if (eng.valor > 700) eng.buy(`upgrade:${plines[2]}`, 1);
  }
  if (eng.wave >= 7 && !c.secondWind && eng.valor > 1100) eng.buy("secondwind");

  // Remaining station errands, walked in person.
  if (eng.districts.undercroft && (!c.armor || !eng.chars[1].armor) && eng.valor > 900) {
    const bestFor = (cls) => (cls === "knight" ? "plate" : cls === "archer" ? "mail" : "jack");
    mem.errands.push({
      room: "undercroft", x: -8, y: -40,
      action: (e) => {
        if (!e.chars[0].armor) e.buy(`armor:${bestFor(e.chars[0].cls)}`);
        if (!e.chars[1].armor) e.buy(`armor:${bestFor(e.chars[1].cls)}`, 1);
      },
    });
  }

}

function makeCasual() {
  return { reactT: 0, targetId: -1, draw: 0 };
}

// The quality-bar casual: slow aim (20 deg/s slew), 300 ms reactions,
// panic melee inside 3 m, never buys, hugs the watchfire.
function casualInput(eng, mem) {
  const c = eng.chars[0];
  const input = emptyInput();
  input.yaw = c.yaw;
  input.pitch = c.pitch;
  if (c.state !== "up") return input;
  const near = nearestUnit(eng, c, (u) => u.room === c.room || u.room === "causeway");
  const home = Math.hypot(c.x - WATCHFIRE_POS.x, c.y - (WATCHFIRE_POS.y + 3));
  if (!near) {
    if (home > 3) {
      input.yaw = Math.atan2(WATCHFIRE_POS.y + 3 - c.y, WATCHFIRE_POS.x - c.x);
      input.forward = 0.6;
    }
    mem.targetId = -1;
    return input;
  }
  if (near.u.id !== mem.targetId) {
    mem.targetId = near.u.id;
    mem.reactT = 0.3;
  }
  mem.reactT -= TICK;
  const want = aimAtUnit(eng, c, near.u, false);
  // Slew-limited aim: 20 degrees per second.
  const maxTurn = (20 * Math.PI / 180) * TICK * 6; // generously sloppy but slow
  let dy = want.yaw - c.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  input.yaw = c.yaw + Math.max(-maxTurn, Math.min(maxTurn, dy));
  input.pitch = want.pitch;
  if (mem.reactT > 0) return input;

  const w = WEAPONS[c.weapon.id];
  if (near.d < 3) {
    // Panic melee.
    if (c.cls === "archer") input.secondary = true;
    else if (w.kind === "melee") {
      mem.draw += TICK;
      input.primary = mem.draw < 0.05;
      if (mem.draw > 0.5) mem.draw = 0;
    } else {
      mem.draw += TICK;
      input.primary = mem.draw < 0.05;
      if (mem.draw > 0.6) mem.draw = 0;
    }
    return input;
  }
  if (w.kind === "melee") {
    input.forward = 0.8;
    mem.draw += TICK;
    input.primary = mem.draw < 0.05;
    if (mem.draw > 0.7) mem.draw = 0;
  } else {
    // Taps only, never charges.
    mem.draw += TICK;
    input.primary = mem.draw < 0.05;
    if (mem.draw > 0.8) mem.draw = 0;
  }
  return input;
}

