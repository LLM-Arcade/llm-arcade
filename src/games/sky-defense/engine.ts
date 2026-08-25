// Sky Defense engine. A seeded interception ruleset over three regions.
// DOM-free with relative .ts imports so scripts/harness/sky-defense.mjs runs
// the identical simulation under node.
//
// Burst groups are the core structure. One shot opens a group; its burst, and
// any ember-mine detonation that burst sets off, all credit that same group.
// The group settles once nothing in it can still kill, which is what lets a
// chain score with its opener instead of as separate hits.

import { FAMILIES, REGIONS, type RegionDef } from "./waves.ts";

export const W = 960;
export const H = 540;

export const GROUND_Y = 470;
export const BATTERY_X = 480;
export const MUZZLE_Y = GROUND_Y - 72;
/** Four building slots, left to right, shared by every region. */
export const BUILDING_X = [150, 300, 660, 810] as const;
/** Authored bearings in battery-aim.png, far-left through far-right. */
export const AIM_FRAMES = 8;

export const TUNE = {
  seed: 0x5ad3f2, // default PRNG seed; the harness may pass its own

  maxDt: 0.05, // s; dt clamp before the engine advances
  spawnY: -30, // px; threats enter above the canvas

  aimRadius: 300, // px; arc the reticle rides on around the battery
  aimSpanDeg: 132, // deg; total sweep the eight authored bearings cover
  interceptorSpeed: 520, // px/s
  burstRadius: 64, // px at full growth
  burstGrow: 0.35, // s to full radius; a burst only kills while it grows
  burstFade: 0.25, // s of fade after growth, drawn but harmless
  chainRadius: 56, // px; an ember mine's own burst
  chainDelay: 0.15, // s between a mine dying and its burst

  magazine: 8,
  shotCooldown: 0.3, // s between shots
  reloadTime: 2.2, // s; starts automatically when the magazine empties

  deathHold: 0.12, // s the damage frame shows before the threat leaves
  regionHold: 2.0, // s of region-clear banner
  fxTtl: 0.5, // s, generic effect lifetime
  fireFlash: 0.09, // s of the battery fire frame
  hitFlash: 0.12, // s of the battery hit frame

  maxHealth: 100,
  repairPerRegion: 30, // health restored during each region banner
  batteryHitRange: 60, // px from the battery that counts as a battery hit

  regionClearBonus: 500,
  healthPointsEach: 5, // per point of health still standing at region clear
  accuracyTarget: 0.8, // killing shots over shots fired
  accuracyBonus: 400,
  victoryBonus: 1500,
  scoreCap: 60000,
  /** A burst scores its summed points times min(this, kills). */
  maxBurstMultiplier: 4,
  shieldWallKills: 4,
  // Calibrated from scripts/harness/sky-defense.mjs: see the six-seed ace
  // spread it prints. Across 24 seeds the ace never scored under 12610 and
  // never lost, while a bot given a 75 px aim error still limped to victory
  // but topped out at 11220. This sits between those two populations, so a
  // clean campaign earns it and a scraped-through one does not.
  legendScore: 11500,

  targetJitter: 20, // px of seeded slop around a chosen target
  homingSpeed: 35, // px/s lateral pull of a beetle drone toward its target
  skiffDrift: 90, // px/s lateral travel of a leaf-sail skiff
  swayRate: 2.0, // rad/s, clockwork kite
  orbitRate: 2.6, // rad/s, orbiting mask
  driftRate: 0.9, // rad/s, balloon decoy
  swarmRate: 5.0, // rad/s, wind-up swarm jitter
} as const;

export type Phase = "playing" | "region-clear" | "gameover" | "victory";

export type SfxName =
  | "fire"
  | "burst"
  | "chain"
  | "impact"
  | "buildingHit"
  | "reload"
  | "emptyClick"
  | "waveStart"
  | "regionClear"
  | "victory"
  | "gameover"
  | "danger";

export type FxKind =
  | "hit-burst"
  | "impact-star"
  | "debris"
  | "dust"
  | "shield-ring"
  | "repair-ring"
  | "repair-drone";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, number> };

export interface Threat {
  id: number;
  /** Index into FAMILIES, which is also the threats.png sprite pair index. */
  family: number;
  /** Travel line before sway is added; skiffs and beetles move it. */
  baseX: number;
  y: number;
  /** Descent px/s with the region multiplier already applied. */
  vy: number;
  driftVx: number;
  swayAmp: number;
  swayRate: number;
  phase: number;
  targetX: number;
  wave: number;
  /** null while incoming; the kill time once the damage frame is showing. */
  diedAt: number | null;
  /** True when a burst took it, false when it reached the ground. */
  killed: boolean;
}

export interface Interceptor {
  x: number;
  y: number;
  tx: number;
  ty: number;
  angle: number;
  travelled: number;
  distance: number;
  group: number;
}

export interface Burst {
  x: number;
  y: number;
  born: number;
  radius: number;
  group: number;
  /** Cleared the frame the burst stops growing, which releases its group. */
  killing: boolean;
}

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  born: number;
}

interface BurstGroup {
  id: number;
  kills: number;
  points: number;
  /** False for a group opened by staging, true for a real shot. */
  fromShot: boolean;
  /** Interceptors, live bursts, and queued detonations still to resolve. */
  pending: number;
  x: number;
  y: number;
}

interface Spawn {
  at: number;
  family: number;
  x: number;
  targetX: number;
  spread: number;
}

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 0 intact, 1 damaged, 2 destroyed. Drives the horizon and building art. */
export const tierForHealth = (health: number) => (health >= 67 ? 0 : health >= 34 ? 1 : 2);

/** Radians from straight up, negative left, for one authored aim frame. */
export const bearingAngle = (index: number) =>
  ((index / (AIM_FRAMES - 1) - 0.5) * TUNE.aimSpanDeg * Math.PI) / 180;

export const bearingPoint = (index: number) => {
  const a = bearingAngle(index);
  return {
    x: BATTERY_X + Math.sin(a) * TUNE.aimRadius,
    y: GROUND_Y - Math.cos(a) * TUNE.aimRadius,
  };
};

/** Nearest authored bearing to a free reticle, so pointer and keys agree. */
export const aimIndexFor = (x: number, y: number) => {
  const half = (TUNE.aimSpanDeg * Math.PI) / 360;
  const a = Math.atan2(x - BATTERY_X, Math.max(1, GROUND_Y - y));
  const k = Math.max(0, Math.min(1, (a + half) / (2 * half)));
  return Math.round(k * (AIM_FRAMES - 1));
};

export const threatX = (t: Threat, time: number) =>
  t.baseX + t.swayAmp * Math.sin(time * t.swayRate + t.phase);

/**
 * Where a threat will be `ahead` seconds from now. The engine uses it for
 * nothing; the harness ace bot leads its shots with it so a bot never guesses
 * at motion the engine implements differently.
 */
export const predictThreat = (t: Threat, time: number, ahead: number) => ({
  x:
    t.baseX +
    t.driftVx * ahead +
    t.swayAmp * Math.sin((time + ahead) * t.swayRate + t.phase),
  y: t.y + t.vy * ahead,
});

export class Engine {
  phase: Phase = "playing";
  time = 0;
  score = 0;
  health: number = TUNE.maxHealth;

  regionIndex = 0;
  region: RegionDef = REGIONS[0];
  waveIndex = 0;

  threats: Threat[] = [];
  interceptors: Interceptor[] = [];
  bursts: Burst[] = [];
  fx: Fx[] = [];

  ammo: number = TUNE.magazine;
  reloading = 0;
  cooldown = 0;

  reticle = bearingPoint(AIM_FRAMES / 2 - 1);
  aimIndex = AIM_FRAMES / 2 - 1;

  regionsHeld = 0;
  threatsDowned = 0;
  bestBurst = 0;
  shotsFired = 0;
  killingShots = 0;
  /** Health lost inside the current region; zero at clear earns perfect-sky. */
  regionDamage = 0;

  firedAt = -1;
  hitAt = -1;

  input = { aimX: this.reticle.x, aimY: this.reticle.y, fire: false };

  private rand: () => number;
  private pending: Spawn[] = [];
  private groups = new Map<number, BurstGroup>();
  private chains: { x: number; y: number; at: number; group: number }[] = [];
  private nextGroup = 1;
  private nextThreat = 1;
  private stageTimer = 0;
  private prevFire = false;
  private regionShots = 0;
  private regionKillingShots = 0;
  private gameoverSent = false;
  private events: GameEvent[] = [];
  private achieved = new Set<string>();

  constructor(seed: number = TUNE.seed) {
    this.rand = mulberry32(seed);
    this.startRegion(0);
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  /** True while the last wave of the last region is running. */
  get finalWave(): boolean {
    return (
      this.phase === "playing" &&
      this.regionIndex === REGIONS.length - 1 &&
      this.waveIndex === this.region.waves.length - 1
    );
  }

  get healthTier(): number {
    return tierForHealth(this.health);
  }

  get accuracyPct(): number {
    return Math.round((this.killingShots / Math.max(1, this.shotsFired)) * 100);
  }

  /** Steps the reticle one authored bearing along the arc. */
  stepAim(dir: number) {
    this.aimIndex = Math.max(0, Math.min(AIM_FRAMES - 1, this.aimIndex + dir));
    const p = bearingPoint(this.aimIndex);
    this.input.aimX = p.x;
    this.input.aimY = p.y;
  }

  update(dt: number) {
    const step = Math.min(TUNE.maxDt, dt);
    this.time += step;
    this.fx = this.fx.filter((f) => this.time - f.born < TUNE.fxTtl);
    this.bursts = this.bursts.filter(
      (b) => this.time - b.born < TUNE.burstGrow + TUNE.burstFade,
    );

    const firePressed = this.input.fire && !this.prevFire;
    this.prevFire = this.input.fire;

    if (this.phase === "gameover" || this.phase === "victory") return;

    this.reticle = {
      x: Math.max(8, Math.min(W - 8, this.input.aimX)),
      y: Math.max(8, Math.min(GROUND_Y - 12, this.input.aimY)),
    };
    this.aimIndex = aimIndexFor(this.reticle.x, this.reticle.y);

    if (this.phase === "region-clear") {
      this.stageTimer -= step;
      if (this.stageTimer <= 0) this.advanceRegion();
      return;
    }

    this.tickBattery(step, firePressed);
    this.tickSpawns();
    this.tickThreats(step);
    this.tickInterceptors(step);
    this.tickBursts();
    this.tickChains();
    this.reapThreats();
    if (this.phase !== "playing") return;
    this.checkWave();
  }

  // ---- events and scoring -------------------------------------------------

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  private sfx(sound: SfxName) {
    this.events.push({ type: "sfx", sound });
  }

  private achieve(slug: string) {
    if (this.achieved.has(slug)) return;
    this.achieved.add(slug);
    this.emit({ type: "achievement", slug });
  }

  private addScore(points: number) {
    this.score = Math.min(TUNE.scoreCap, this.score + points);
    if (this.score >= TUNE.legendScore) this.achieve("defense-legend");
  }

  private addFx(kind: FxKind, x: number, y: number) {
    this.fx.push({ kind, x, y, born: this.time });
  }

  // ---- region and wave flow ----------------------------------------------

  private startRegion(index: number) {
    this.regionIndex = index;
    this.region = REGIONS[index];
    this.waveIndex = 0;
    this.regionDamage = 0;
    this.regionShots = 0;
    this.regionKillingShots = 0;
    this.phase = "playing";
    this.startWave(0);
  }

  private startWave(index: number) {
    this.waveIndex = index;
    const wave = this.region.waves[index];
    this.pending = [];
    for (let i = 0; i < wave.count; i++) {
      const family = wave.families[Math.floor(this.rand() * wave.families.length)];
      const targets = [...BUILDING_X, BATTERY_X];
      const targetX =
        targets[Math.floor(this.rand() * targets.length)] +
        (this.rand() * 2 - 1) * TUNE.targetJitter;
      // Slot i gets its own slice of the wave window, so a wave arrives paced
      // instead of clumping on one unlucky roll.
      const slot = (i + this.rand()) * (wave.spread / wave.count);
      this.pending.push({
        at: this.time + slot,
        family,
        x: 90 + this.rand() * (W - 180),
        targetX,
        spread: this.rand(),
      });
    }
    this.pending.sort((a, b) => a.at - b.at);
    this.sfx("waveStart");
  }

  private checkWave() {
    if (this.pending.length > 0) return;
    if (this.threats.some((t) => t.wave === this.waveIndex)) return;
    if (this.waveIndex < this.region.waves.length - 1) {
      this.startWave(this.waveIndex + 1);
      return;
    }
    this.enterRegionClear();
  }

  private enterRegionClear() {
    this.settleAllGroups();
    const accuracy = this.regionKillingShots / Math.max(1, this.regionShots);
    this.addScore(
      TUNE.regionClearBonus +
        this.health * TUNE.healthPointsEach +
        (accuracy >= TUNE.accuracyTarget ? TUNE.accuracyBonus : 0),
    );
    this.achieve(this.region.clearSlug);
    if (this.regionDamage === 0) this.achieve("perfect-sky");
    this.regionsHeld++;
    this.health = Math.min(TUNE.maxHealth, this.health + TUNE.repairPerRegion);
    this.addFx("repair-ring", BATTERY_X, GROUND_Y - 90);
    this.addFx("repair-drone", BATTERY_X - 120, GROUND_Y - 130);
    this.addFx("repair-drone", BATTERY_X + 120, GROUND_Y - 150);
    this.sfx("regionClear");
    this.phase = "region-clear";
    this.stageTimer = TUNE.regionHold;
  }

  private advanceRegion() {
    if (this.regionIndex >= REGIONS.length - 1) {
      this.phase = "victory";
      this.addScore(TUNE.victoryBonus);
      this.sfx("victory");
      this.sendGameover();
      return;
    }
    this.startRegion(this.regionIndex + 1);
  }

  // ---- battery ------------------------------------------------------------

  private tickBattery(step: number, firePressed: boolean) {
    if (this.reloading > 0) {
      this.reloading -= step;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = TUNE.magazine;
      }
    }
    if (this.cooldown > 0) this.cooldown -= step;
    if (!firePressed) return;
    if (this.reloading > 0 || this.ammo <= 0 || this.cooldown > 0) {
      if (this.reloading > 0 || this.ammo <= 0) this.sfx("emptyClick");
      return;
    }
    this.fire(this.reticle.x, this.reticle.y);
  }

  /** Sends one interceptor at a point and opens its burst group. */
  fire(tx: number, ty: number): number {
    this.ammo--;
    this.cooldown = TUNE.shotCooldown;
    this.shotsFired++;
    this.regionShots++;
    this.firedAt = this.time;
    const group = this.openGroup(true, tx, ty);
    const dx = tx - BATTERY_X;
    const dy = ty - MUZZLE_Y;
    this.interceptors.push({
      x: BATTERY_X,
      y: MUZZLE_Y,
      tx,
      ty,
      angle: Math.atan2(dy, dx),
      travelled: 0,
      distance: Math.max(1, Math.hypot(dx, dy)),
      group,
    });
    this.sfx("fire");
    if (this.ammo <= 0) {
      this.reloading = TUNE.reloadTime;
      this.sfx("reload");
    }
    return group;
  }

  // ---- spawning and threat motion ----------------------------------------

  private tickSpawns() {
    while (this.pending.length > 0 && this.pending[0].at <= this.time) {
      this.spawn(this.pending.shift()!);
    }
  }

  private spawn(slot: Spawn) {
    const fam = FAMILIES[slot.family];
    const vy = fam.speed * this.region.speedMul;
    for (let unit = 0; unit < fam.units; unit++) {
      const offset = fam.units > 1 ? (unit - (fam.units - 1) / 2) * 34 : 0;
      let baseX = slot.x + offset;
      let driftVx = 0;
      let swayAmp = 0;
      let swayRate = 0;
      switch (fam.motion) {
        case "sway":
          swayAmp = 60;
          swayRate = TUNE.swayRate;
          break;
        case "drift":
          swayAmp = 40;
          swayRate = TUNE.driftRate;
          break;
        case "orbit":
          swayAmp = 40;
          swayRate = TUNE.orbitRate;
          break;
        case "swarm":
          swayAmp = 8;
          swayRate = TUNE.swarmRate;
          break;
        case "diagonal":
          // Skiffs enter from a top corner and cut across the sky.
          baseX = slot.spread < 0.5 ? 60 + offset : W - 60 + offset;
          driftVx = slot.spread < 0.5 ? TUNE.skiffDrift : -TUNE.skiffDrift;
          break;
        default:
          break;
      }
      this.threats.push({
        id: this.nextThreat++,
        family: slot.family,
        baseX,
        y: TUNE.spawnY - unit * 12,
        vy,
        driftVx,
        swayAmp,
        swayRate,
        phase: slot.spread * Math.PI * 2 + unit,
        targetX: slot.targetX,
        wave: this.waveIndex,
        diedAt: null,
        killed: false,
      });
    }
  }

  private tickThreats(step: number) {
    for (const t of this.threats) {
      if (t.diedAt !== null) continue;
      const fam = FAMILIES[t.family];
      if (fam.motion === "home") {
        const gap = t.targetX - t.baseX;
        t.driftVx = Math.max(-TUNE.homingSpeed, Math.min(TUNE.homingSpeed, gap));
      }
      t.baseX += t.driftVx * step;
      t.y += t.vy * step;
      if (t.y >= GROUND_Y) this.impact(t);
    }
  }

  private impact(t: Threat) {
    const fam = FAMILIES[t.family];
    const x = threatX(t, this.time);
    t.diedAt = this.time - TUNE.deathHold; // leaves the sky on this frame's reap
    this.addFx("impact-star", x, GROUND_Y);
    if (fam.impact === 0) {
      this.addFx("dust", x, GROUND_Y - 10);
      this.sfx("impact");
      return;
    }
    this.addFx("debris", x, GROUND_Y - 6);
    this.damage(fam.impact, x);
  }

  private damage(amount: number, x: number) {
    const before = this.health;
    this.health = Math.max(0, this.health - amount);
    this.regionDamage += before - this.health;
    const nearBuilding = BUILDING_X.some((bx) => Math.abs(bx - x) < 56);
    this.sfx(nearBuilding ? "buildingHit" : "impact");
    if (Math.abs(x - BATTERY_X) <= TUNE.batteryHitRange) this.hitAt = this.time;
    if (tierForHealth(this.health) !== tierForHealth(before)) this.sfx("danger");
    if (this.health <= 0) {
      this.settleAllGroups();
      this.phase = "gameover";
      this.sfx("gameover");
      this.sendGameover();
    }
  }

  private reapThreats() {
    if (this.threats.length === 0) return;
    const keep: Threat[] = [];
    for (const t of this.threats) {
      if (t.diedAt !== null && this.time - t.diedAt >= TUNE.deathHold) {
        if (t.killed) this.addFx("hit-burst", threatX(t, this.time), t.y);
        continue;
      }
      keep.push(t);
    }
    this.threats = keep;
  }

  // ---- interceptors, bursts, chains --------------------------------------

  private openGroup(fromShot: boolean, x: number, y: number): number {
    const id = this.nextGroup++;
    this.groups.set(id, { id, kills: 0, points: 0, fromShot, pending: 1, x, y });
    return id;
  }

  private releaseGroup(id: number) {
    const g = this.groups.get(id);
    if (!g) return;
    g.pending--;
    if (g.pending > 0) return;
    this.settleGroup(g);
  }

  private settleGroup(g: BurstGroup) {
    this.groups.delete(g.id);
    if (g.kills === 0) return;
    this.addScore(g.points * Math.min(TUNE.maxBurstMultiplier, g.kills));
    if (g.fromShot) {
      this.killingShots++;
      this.regionKillingShots++;
    }
    if (g.kills > this.bestBurst) this.bestBurst = g.kills;
    if (g.kills >= TUNE.shieldWallKills) {
      this.achieve("shield-wall");
      this.addFx("shield-ring", g.x, g.y);
    }
  }

  private settleAllGroups() {
    for (const g of [...this.groups.values()]) this.settleGroup(g);
    this.groups.clear();
  }

  private tickInterceptors(step: number) {
    if (this.interceptors.length === 0) return;
    const keep: Interceptor[] = [];
    for (const i of this.interceptors) {
      i.travelled += TUNE.interceptorSpeed * step;
      if (i.travelled < i.distance) {
        const k = i.travelled / i.distance;
        i.x = BATTERY_X + (i.tx - BATTERY_X) * k;
        i.y = MUZZLE_Y + (i.ty - MUZZLE_Y) * k;
        keep.push(i);
        continue;
      }
      this.bursts.push({
        x: i.tx,
        y: i.ty,
        born: this.time,
        radius: TUNE.burstRadius,
        group: i.group,
        killing: true,
      });
      const g = this.groups.get(i.group);
      if (g) g.pending++;
      this.releaseGroup(i.group);
      this.sfx("burst");
    }
    this.interceptors = keep;
  }

  private tickBursts() {
    for (const b of this.bursts) {
      if (!b.killing) continue;
      const age = this.time - b.born;
      const r = b.radius * Math.min(1, age / TUNE.burstGrow);
      for (const t of this.threats) {
        if (t.diedAt !== null) continue;
        if (Math.hypot(threatX(t, this.time) - b.x, t.y - b.y) > r) continue;
        this.kill(t, b.group);
      }
      // A burst kills only while it grows, and its group can settle the frame
      // it stops. The fade that follows is drawing only.
      if (age >= TUNE.burstGrow) {
        b.killing = false;
        this.releaseGroup(b.group);
      }
    }
  }

  private kill(t: Threat, group: number) {
    const fam = FAMILIES[t.family];
    t.diedAt = this.time;
    t.killed = true;
    this.threatsDowned++;
    this.achieve("first-intercept");
    const g = this.groups.get(group);
    if (g) {
      g.kills++;
      g.points += fam.points;
    }
    if (!fam.detonates) return;
    const x = threatX(t, this.time);
    this.chains.push({ x, y: t.y, at: this.time + TUNE.chainDelay, group });
    if (g) g.pending++;
  }

  private tickChains() {
    if (this.chains.length === 0) return;
    const keep: typeof this.chains = [];
    for (const c of this.chains) {
      if (c.at > this.time) {
        keep.push(c);
        continue;
      }
      this.bursts.push({
        x: c.x,
        y: c.y,
        born: this.time,
        radius: TUNE.chainRadius,
        group: c.group,
        killing: true,
      });
      const g = this.groups.get(c.group);
      if (g) g.pending++;
      this.releaseGroup(c.group);
      this.sfx("chain");
    }
    this.chains = keep;
  }

  private sendGameover() {
    if (this.gameoverSent) return;
    this.gameoverSent = true;
    this.emit({
      type: "gameover",
      score: this.score,
      stats: {
        regions_held: this.regionsHeld,
        threats_downed: this.threatsDowned,
        best_burst: this.bestBurst,
        accuracy_pct: this.accuracyPct,
      },
    });
  }
}
