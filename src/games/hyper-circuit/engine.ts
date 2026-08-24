// Hyper Circuit engine. F-Zero homage, fully original. A grand prix of
// three circuits, 3 laps each, against four rivals. Shield is the single
// resource: boost spends it, rails and rivals drain it, the pit strip
// refills it, zero is a blowout DNF. Best lap is recorded per circuit and
// replayed as a translucent ghost. Framework-free, engine time only, event
// queue drained by the component (same contract as Starfall Squadron).

import {
  COURSES,
  buildTrack,
  curvatureAt,
  trackPos,
  type Track,
} from "./courses.ts";

export const LAPS = 3;

export type SfxName =
  | "count"
  | "go"
  | "boost"
  | "pad"
  | "rail"
  | "bump"
  | "lap"
  | "bestLap"
  | "finish"
  | "blowout"
  | "recharge"
  | "denied";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, string | number> };

export interface Racer {
  x: number;
  y: number;
  heading: number;
  speed: number;
  s: number;
  progress: number;
  lat: number;
  lap: number; // 1-based, LAPS+1 means finished
}

export interface Rival extends Racer {
  name: string;
  spriteIdx: number;
  finished: boolean;
}

export interface Spark {
  x: number;
  y: number;
  age: number;
  side: number; // -1 left rail, 1 right rail, 0 center
}

export type Phase = "countdown" | "racing" | "finished" | "gameover";

export const TUNE = {
  maxSpeed: 330, // units/s
  accel: 200, // units/s^2
  boostAccelMult: 1.6, // thrust multiplier while a burn is live
  coastDecel: 140, // units/s^2
  brakeDecel: 260, // units/s^2
  yawRate: 2.6, // rad/s at standstill
  yawHighSpeedScale: 0.38, // yaw fraction lost at max speed
  gripLow: 8, // 1/s velocity realignment below gripSplit
  gripHigh: 4.5, // 1/s realignment above gripSplit (drift)
  gripSplit: 0.6, // fraction of max speed where grip drops
  boostTime: 1.6, // s of manual burn
  boostMult: 1.35, // top-speed multiplier while burning
  boostCost: 18, // shield
  boostMinShield: 22, // shield required to ignite
  padBoostTime: 1.2, // s of pad burn
  padBoostMult: 1.4,
  padCooldown: 1, // s between pad triggers
  padZone: 40, // pad length, units
  craftHalf: 10, // craft half width vs the rail, units
  railHitCost: 3, // shield, base per hard hit
  railImpactScale: 0.03, // extra shield per unit of lateral impact speed
  railImpactMax: 12, // shield cap per hard hit
  railHitSpeedCut: 0.82, // speed multiplier on a hard hit
  railHitWindow: 0.3, // s separating hard hits from grinding
  railGrindDrain: 6, // shield/s while grinding
  railGrindCap: 0.9, // speed cap fraction while grinding
  pitRegen: 28, // shield/s on the strip
  rivalContactDist: 26, // units
  rivalContactCost: 3, // shield
  rivalContactCooldown: 0.5, // s
  shieldMax: 100,
  interRaceService: 25, // shield restored between circuits
  countdown: 3.2, // s
  finishedHold: 3.5, // s of results before the next circuit
  gridGapS: 16, // units between grid rows
  gridLatFrac: 0.35, // rival grid lateral offset, fraction of halfWidth
  rivalStagger: 0.025, // speed fraction lost per grid slot
  rivalAccel: 160, // units/s^2
  rivalDecel: 300, // units/s^2
  rivalLatAccel: 480, // units/s^2 cornering budget
  rivalLookahead: 150, // units of curvature lookahead
  rivalSwayHz: 0.25, // lateral sway cycles per second
  rubberBandRange: 4000, // progress gap, units, for full rubber effect
  rubberLo: 0.94,
  rubberHi: 1.03,
  posPoints: [4000, 2600, 1800, 1200, 800], // finish standings 1st..5th
  finishBonus: 500,
  shieldBonusRate: 5, // points per shield unit at finish
  parRate: 200, // points per second under par
  parCapPerLap: 1200,
  cleanBoostPts: 150,
  padPts: 50,
  scoreCap: 40000,
  legendScore: 18000,
  ghostHz: 30, // recording rate
};

const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

/**
 * Nearest-centerline projection with a local search window around a hint
 * index. Lat is signed along the normal (-dirY, dirX): positive is the
 * right-hand side of travel in canvas coordinates. Full scan when the
 * hint is negative (spawn placement).
 */
const projectToTrack = (
  t: Track,
  x: number,
  y: number,
  hintIdx: number,
): { s: number; lat: number; idx: number } => {
  let best = 0;
  let bestD = Infinity;
  if (hintIdx < 0) {
    for (let i = 0; i < t.n; i++) {
      const dx = x - t.pts[2 * i];
      const dy = y - t.pts[2 * i + 1];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  } else {
    const WIN = 48;
    for (let k = -WIN; k <= WIN; k++) {
      const i = (hintIdx + k + t.n) % t.n;
      const dx = x - t.pts[2 * i];
      const dy = y - t.pts[2 * i + 1];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  const i1 = (best + 1) % t.n;
  let dx = t.pts[2 * i1] - t.pts[2 * best];
  let dy = t.pts[2 * i1 + 1] - t.pts[2 * best + 1];
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const px = x - t.pts[2 * best];
  const py = y - t.pts[2 * best + 1];
  const along = px * dx + py * dy;
  const lat = dx * py - dy * px;
  let s = (best * t.step + along) % t.total;
  if (s < 0) s += t.total;
  return { s, lat, idx: best };
};

// Signed turn direction ahead of s: positive means an upcoming right-hand
// bend in canvas coordinates, matching the sign convention of lat.
const signedTurnAhead = (t: Track, s: number): number => {
  let sum = 0;
  for (let k = 40; k <= 160; k += 40) {
    let w = (s + k) % t.total;
    if (w < 0) w += t.total;
    const i = Math.floor(w / t.step) % t.n;
    const ip = (i - 1 + t.n) % t.n;
    const inx = (i + 1) % t.n;
    const ax = t.pts[2 * i] - t.pts[2 * ip];
    const ay = t.pts[2 * i + 1] - t.pts[2 * ip + 1];
    const bx = t.pts[2 * inx] - t.pts[2 * i];
    const by = t.pts[2 * inx + 1] - t.pts[2 * i + 1];
    sum += Math.sign(ax * by - ay * bx);
  }
  return sum;
};

const RIVAL_NAMES = ["Saltflat Comet", "Basalt Bull", "Dust Moth", "Cinder Fox"];
const PLACE_LABEL = ["1ST", "2ND", "3RD", "4TH", "5TH"];

interface GhostLap {
  data: Float32Array; // x, y, heading triplets at ghostHz
  count: number;
}

export class Engine {
  time = 0;
  phase: Phase = "countdown";
  circuitIndex = 0;
  track: Track;
  score = 0;
  banner = "";
  bannerUntil = 0;
  countdown = TUNE.countdown;

  player: Racer & { shield: number } = {
    x: 0, y: 0, heading: 0, speed: 0,
    s: 0, progress: 0, lat: 0, lap: 1,
    shield: TUNE.shieldMax,
  };
  rivals: Rival[] = [];
  sparks: Spark[] = [];

  input = { steer: 0, accel: false, brake: false, boost: false };

  lapTimes: number[] = [];
  bestLap: number | null = null;
  boostT = 0;
  railHits = 0;
  cleanBoosts = 0;
  wins = 0;

  private vx = 0;
  private vy = 0;
  private raceClock = 0;
  private lapStartClock = 0;
  private trackIdx = 0;
  private countInt = 4;
  private finishedAt = 0;
  private playerStanding = 0;
  private playerFinished = false;
  private circuitsFinished = 0;
  private railContact = false;
  private lastHardHit = -9;
  private lastPadAt = -9;
  private lastBumpAt = -9;
  private lastDeniedAt = -9;
  private lastRechargeTick = -9;
  private manualBoost = false;
  private boostDirty = false; // rail or bump touched during the burn
  private railHitsRace = 0;
  private cleanBoostsRace = 0;
  private finishOrder = 0; // racers across the line so far this race
  private bestLapEver: number | null = null;
  private prevBoostInput = false;

  private ghost: GhostLap | null = null;
  private ghostRec = new Float32Array(3 * TUNE.ghostHz * 120);
  private ghostRecCount = 0;
  private ghostAcc = 0;

  private events: GameEvent[] = [];
  private achieved = new Set<string>();
  private gameoverSent = false;

  constructor() {
    this.track = buildTrack(COURSES[0]);
    this.setupRace();
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  private achieve(slug: string) {
    if (this.achieved.has(slug)) return;
    this.achieved.add(slug);
    this.emit({ type: "achievement", slug });
  }

  private setBanner(text: string, dur = 1.6) {
    this.banner = text;
    this.bannerUntil = this.time + dur;
  }

  private addScore(pts: number) {
    this.score = Math.min(TUNE.scoreCap, this.score + pts);
    if (this.score >= TUNE.legendScore) this.achieve("circuit-legend");
  }

  get position(): number {
    if (this.playerFinished) return this.playerStanding;
    let ahead = 0;
    for (const r of this.rivals) if (r.progress > this.player.progress) ahead++;
    return 1 + ahead;
  }

  get currentLapTime(): number {
    return this.raceClock - this.lapStartClock;
  }

  get isBoosting(): boolean {
    return this.boostT > 0;
  }

  ghostPos(): { x: number; y: number; heading: number } | null {
    const g = this.ghost;
    if (!g || this.phase !== "racing" || this.playerFinished) return null;
    const i = Math.min(g.count - 1, Math.floor(this.currentLapTime * TUNE.ghostHz));
    if (i < 0) return null;
    return { x: g.data[3 * i], y: g.data[3 * i + 1], heading: g.data[3 * i + 2] };
  }

  // ---- Race lifecycle --------------------------------------------------

  private setupRace() {
    const t = this.track;
    const start = trackPos(t, 0);
    const p = this.player;
    p.x = start.x;
    p.y = start.y;
    p.heading = Math.atan2(start.dirY, start.dirX);
    p.speed = 0;
    p.s = 0;
    p.progress = 0;
    p.lat = 0;
    p.lap = 1;
    this.vx = 0;
    this.vy = 0;
    this.trackIdx = 0;

    this.rivals = RIVAL_NAMES.map((name, i) => {
      const s = TUNE.gridGapS * (1 + Math.floor(i / 2));
      const pos = trackPos(t, s);
      const lat = (i % 2 === 0 ? -1 : 1) * t.def.halfWidth * TUNE.gridLatFrac;
      return {
        name,
        spriteIdx: i,
        x: pos.x - pos.dirY * lat,
        y: pos.y + pos.dirX * lat,
        heading: Math.atan2(pos.dirY, pos.dirX),
        speed: 0,
        s,
        progress: s,
        lat,
        lap: 1,
        finished: false,
      };
    });

    this.phase = "countdown";
    this.countdown = TUNE.countdown;
    this.countInt = 4;
    this.raceClock = 0;
    this.lapStartClock = 0;
    this.lapTimes = [];
    this.bestLap = null;
    this.boostT = 0;
    this.manualBoost = false;
    this.railHitsRace = 0;
    this.cleanBoostsRace = 0;
    this.finishOrder = 0;
    this.playerFinished = false;
    this.playerStanding = 0;
    this.railContact = false;
    this.ghost = null;
    this.ghostRecCount = 0;
    this.ghostAcc = 0;
    this.sparks = [];
    this.setBanner(t.def.name.toUpperCase(), 2.2);
  }

  private advanceCircuit() {
    this.circuitIndex++;
    if (this.circuitIndex >= COURSES.length) {
      this.achieve("grand-circuit");
      return this.gameOver();
    }
    this.player.shield = Math.min(
      TUNE.shieldMax,
      this.player.shield + TUNE.interRaceService,
    );
    this.track = buildTrack(COURSES[this.circuitIndex]);
    this.setupRace();
  }

  private gameOver() {
    if (this.gameoverSent) return;
    this.gameoverSent = true;
    this.phase = "gameover";
    this.banner = "";
    this.emit({
      type: "gameover",
      score: this.score,
      stats: {
        circuits_finished: this.circuitsFinished,
        wins: this.wins,
        best_lap: this.bestLapEver === null ? 0 : Math.round(this.bestLapEver * 100) / 100,
        rail_hits: this.railHits,
        clean_boosts: this.cleanBoosts,
      },
    });
  }

  // ---- Update ----------------------------------------------------------

  update(dt: number) {
    this.time += dt;
    for (const sp of this.sparks) sp.age += dt;
    this.sparks = this.sparks.filter((sp) => sp.age < 0.45);
    if (this.time > this.bannerUntil) this.banner = "";

    if (this.phase === "gameover") return;

    if (this.phase === "countdown") {
      this.countdown -= dt;
      const ci = Math.ceil(this.countdown);
      if (ci < this.countInt && ci > 0) {
        this.countInt = ci;
        this.emit({ type: "sfx", sound: "count" });
      }
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.raceClock = 0;
        this.lapStartClock = 0;
        this.emit({ type: "sfx", sound: "go" });
        this.setBanner("GO", 0.8);
      }
      return;
    }

    this.raceClock += dt;
    this.updateRivals(dt);

    if (this.phase === "finished") {
      if (this.time - this.finishedAt > TUNE.finishedHold) this.advanceCircuit();
      return;
    }

    this.updatePlayer(dt);
    if (this.phase !== "racing") return; // blowout or finish inside updatePlayer
    this.recordGhost(dt);
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    const t = this.track;

    // boost ignites on the rising edge only
    const pressed = this.input.boost && !this.prevBoostInput;
    this.prevBoostInput = this.input.boost;
    if (pressed) {
      if (this.boostT <= 0 && p.shield > TUNE.boostMinShield) {
        this.boostT = TUNE.boostTime;
        this.manualBoost = true;
        this.boostDirty = false;
        p.shield -= TUNE.boostCost;
        this.emit({ type: "sfx", sound: "boost" });
      } else if (this.boostT <= 0 && this.time - this.lastDeniedAt > 0.5) {
        this.lastDeniedAt = this.time;
        this.emit({ type: "sfx", sound: "denied" });
      }
    }
    if (this.boostT > 0) {
      this.boostT -= dt;
      if (this.boostT <= 0 && this.manualBoost) {
        if (!this.boostDirty) {
          this.cleanBoosts++;
          this.cleanBoostsRace++;
          this.addScore(TUNE.cleanBoostPts);
          if (this.cleanBoostsRace >= 5) this.achieve("boost-artist");
        }
        this.manualBoost = false;
      }
    }

    // steering and thrust
    const speedFrac = p.speed / TUNE.maxSpeed;
    const yaw = TUNE.yawRate * (1 - TUNE.yawHighSpeedScale * Math.min(1, speedFrac));
    p.heading += this.input.steer * yaw * dt;

    const boosting = this.boostT > 0;
    const mult = boosting ? (this.manualBoost ? TUNE.boostMult : TUNE.padBoostMult) : 1;
    const vmax = TUNE.maxSpeed * mult;
    // brake beats the burn, so a boost carried into a corner has an out
    if (this.input.brake) {
      p.speed = Math.max(0, p.speed - TUNE.brakeDecel * dt);
    } else if (this.input.accel || boosting) {
      p.speed = Math.min(vmax, p.speed + TUNE.accel * (boosting ? TUNE.boostAccelMult : 1) * dt);
    } else {
      p.speed = Math.max(0, p.speed - TUNE.coastDecel * dt);
    }
    if (!boosting && p.speed > TUNE.maxSpeed) {
      // burn just ended: bleed the surplus instead of clamping it away
      p.speed = Math.max(TUNE.maxSpeed, p.speed - TUNE.coastDecel * 1.5 * dt);
    }

    // velocity chases heading: grip drops with speed, which is the drift
    let velAng = p.speed > 1 ? Math.atan2(this.vy, this.vx) : p.heading;
    const grip = speedFrac < TUNE.gripSplit ? TUNE.gripLow : TUNE.gripHigh;
    velAng += wrapAngle(p.heading - velAng) * Math.min(1, grip * dt);
    this.vx = Math.cos(velAng) * p.speed;
    this.vy = Math.sin(velAng) * p.speed;
    p.x += this.vx * dt;
    p.y += this.vy * dt;

    // track projection, rails, progress
    const proj = projectToTrack(t, p.x, p.y, this.trackIdx);
    this.trackIdx = proj.idx;
    const limit = t.def.halfWidth - TUNE.craftHalf;
    let lat = proj.lat;
    if (Math.abs(lat) > limit) {
      const side = Math.sign(lat);
      const c = trackPos(t, proj.s);
      // clamp to the rail line and kill the outward velocity component
      p.x = c.x - c.dirY * side * limit;
      p.y = c.y + c.dirX * side * limit;
      const nOutX = -c.dirY * side;
      const nOutY = c.dirX * side;
      const vOut = this.vx * nOutX + this.vy * nOutY;
      if (vOut > 0) {
        this.vx -= nOutX * vOut;
        this.vy -= nOutY * vOut;
      }
      if (this.time - this.lastHardHit > TUNE.railHitWindow && !this.railContact) {
        this.lastHardHit = this.time;
        const cost = Math.min(
          TUNE.railImpactMax,
          TUNE.railHitCost + Math.max(0, vOut) * TUNE.railImpactScale,
        );
        this.railHits++;
        this.railHitsRace++;
        this.boostDirty = true;
        this.emit({ type: "sfx", sound: "rail" });
        this.sparks.push({ x: p.x, y: p.y, age: 0, side });
        this.vx *= TUNE.railHitSpeedCut;
        this.vy *= TUNE.railHitSpeedCut;
        this.drainShield(cost);
      } else {
        this.drainShield(TUNE.railGrindDrain * dt);
        const cap = TUNE.maxSpeed * TUNE.railGrindCap * mult;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > cap) {
          this.vx *= cap / sp;
          this.vy *= cap / sp;
        }
        this.boostDirty = true;
      }
      if (this.phase !== "racing") return; // blowout inside drainShield
      // velocity is the truth after a clamp: resync speed and heading pull
      p.speed = Math.hypot(this.vx, this.vy);
      if (p.speed > 1) {
        const va = Math.atan2(this.vy, this.vx);
        p.heading = va + wrapAngle(p.heading - va) * 0.5;
      }
      this.railContact = true;
      lat = side * limit;
    } else {
      this.railContact = false;
    }

    let ds = proj.s - p.s;
    if (ds > t.total / 2) ds -= t.total;
    if (ds < -t.total / 2) ds += t.total;
    p.s = proj.s;
    p.lat = lat;
    const prevProgress = p.progress;
    p.progress += ds;

    // boost pads
    if (this.time - this.lastPadAt > TUNE.padCooldown && ds > 0) {
      for (const f of t.def.boostPads) {
        const center = f * t.total;
        let d = p.s - center;
        if (d > t.total / 2) d -= t.total;
        if (d < -t.total / 2) d += t.total;
        if (Math.abs(d) < TUNE.padZone / 2) {
          this.lastPadAt = this.time;
          this.boostT = Math.max(this.boostT, TUNE.padBoostTime);
          this.addScore(TUNE.padPts);
          this.emit({ type: "sfx", sound: "pad" });
          break;
        }
      }
    }

    // pit strip regen
    const sFrac = p.s / t.total;
    if (
      sFrac >= t.def.pitLane[0] &&
      sFrac <= t.def.pitLane[1] &&
      p.shield < TUNE.shieldMax
    ) {
      p.shield = Math.min(TUNE.shieldMax, p.shield + TUNE.pitRegen * dt);
      if (this.time - this.lastRechargeTick > 0.25) {
        this.lastRechargeTick = this.time;
        this.emit({ type: "sfx", sound: "recharge" });
      }
    }

    // rival contact: a shove, a shield ding, never a wreck
    if (this.time - this.lastBumpAt > TUNE.rivalContactCooldown) {
      for (const r of this.rivals) {
        const dx = p.x - r.x;
        const dy = p.y - r.y;
        const d2 = dx * dx + dy * dy;
        const min = TUNE.rivalContactDist;
        if (d2 < min * min) {
          this.lastBumpAt = this.time;
          const d = Math.sqrt(d2) || 1;
          this.vx += (dx / d) * 40;
          this.vy += (dy / d) * 40;
          this.boostDirty = true;
          this.emit({ type: "sfx", sound: "bump" });
          this.sparks.push({ x: (p.x + r.x) / 2, y: (p.y + r.y) / 2, age: 0, side: 0 });
          this.drainShield(TUNE.rivalContactCost);
          if (this.phase !== "racing") return;
          break;
        }
      }
    }

    // lap and race completion
    const lapEdge = p.lap * t.total;
    if (prevProgress < lapEdge && p.progress >= lapEdge) {
      const lapTime = this.raceClock - this.lapStartClock;
      this.lapStartClock = this.raceClock;
      this.lapTimes.push(lapTime);
      this.addScore(
        Math.min(
          TUNE.parCapPerLap,
          Math.floor(Math.max(0, t.def.parLap - lapTime) * TUNE.parRate),
        ),
      );
      const hadGhost = this.ghost !== null;
      if (this.bestLap === null || lapTime < this.bestLap) {
        this.bestLap = lapTime;
        if (this.bestLapEver === null || lapTime < this.bestLapEver) {
          this.bestLapEver = lapTime;
        }
        this.ghost = {
          data: this.ghostRec.slice(0, 3 * this.ghostRecCount),
          count: this.ghostRecCount,
        };
        if (hadGhost) this.achieve("ghost-chaser");
        this.emit({ type: "sfx", sound: "bestLap" });
      } else {
        this.emit({ type: "sfx", sound: "lap" });
      }
      this.ghostRecCount = 0;
      this.ghostAcc = 0;
      p.lap++;
      if (p.lap > LAPS) this.finishRace();
      else this.setBanner(`LAP ${p.lap}`, 1.1);
    }
  }

  private drainShield(amount: number) {
    const p = this.player;
    p.shield -= amount;
    if (p.shield <= 0) {
      p.shield = 0;
      this.emit({ type: "sfx", sound: "blowout" });
      for (let i = 0; i < 6; i++) {
        this.sparks.push({ x: p.x, y: p.y, age: i * 0.04, side: 0 });
      }
      this.setBanner("SHIELD GONE", 2);
      this.gameOver();
    }
  }

  private finishRace() {
    const p = this.player;
    this.playerFinished = true;
    this.finishOrder++;
    this.playerStanding = this.finishOrder;
    this.circuitsFinished++;
    const standing = this.playerStanding;
    this.addScore(
      TUNE.posPoints[Math.min(standing, TUNE.posPoints.length) - 1] +
        TUNE.finishBonus +
        Math.floor(p.shield) * TUNE.shieldBonusRate,
    );
    this.achieve("first-finish");
    if (standing === 1) {
      this.wins++;
      this.achieve("front-runner");
    }
    if (this.railHitsRace === 0) this.achieve("clean-circuit");
    this.setBanner(`${PLACE_LABEL[standing - 1]} PLACE`, TUNE.finishedHold);
    this.emit({ type: "sfx", sound: "finish" });
    this.phase = "finished";
    this.finishedAt = this.time;
  }

  private recordGhost(dt: number) {
    this.ghostAcc += dt;
    const interval = 1 / TUNE.ghostHz;
    while (this.ghostAcc >= interval) {
      this.ghostAcc -= interval;
      const i = this.ghostRecCount;
      if (3 * i + 2 < this.ghostRec.length) {
        this.ghostRec[3 * i] = this.player.x;
        this.ghostRec[3 * i + 1] = this.player.y;
        this.ghostRec[3 * i + 2] = this.player.heading;
        this.ghostRecCount++;
      }
    }
  }

  private updateRivals(dt: number) {
    const t = this.track;

    for (let i = 0; i < this.rivals.length; i++) {
      const r = this.rivals[i];

      // a lateral-acceleration budget converts upcoming curvature to a
      // speed limit, so rivals brake into hairpins like the player must
      let worstCurv = 1e-5;
      for (let k = 0; k < TUNE.rivalLookahead; k += 16) {
        const c = curvatureAt(t, (r.s + k) % t.total);
        if (c > worstCurv) worstCurv = c;
      }
      const vCurve = Math.sqrt(TUNE.rivalLatAccel / worstCurv);

      const gap = this.player.progress - r.progress;
      const rubber = Math.min(
        TUNE.rubberHi,
        Math.max(TUNE.rubberLo, 1 + (gap / TUNE.rubberBandRange) * (TUNE.rubberHi - 1)),
      );
      const base = t.def.rivalSpeed * (1 - TUNE.rivalStagger * i) * rubber;
      const target = r.finished ? base * 0.55 : Math.min(base, vCurve);

      if (r.speed < target) r.speed = Math.min(target, r.speed + TUNE.rivalAccel * dt);
      else r.speed = Math.max(target, r.speed - TUNE.rivalDecel * dt);

      const ds = r.speed * dt;
      r.s += ds;
      if (r.s >= t.total) r.s -= t.total;
      if (!r.finished) {
        r.progress += ds;
        if (r.progress >= r.lap * t.total) {
          r.lap++;
          if (r.lap > LAPS) {
            r.finished = true;
            this.finishOrder++;
          }
        }
      }

      // racing line: hug the inside of the upcoming turn plus gentle sway
      const bias = signedTurnAhead(t, r.s) * t.def.halfWidth * 0.075;
      const sway =
        Math.sin(this.time * TUNE.rivalSwayHz * 2 * Math.PI + i * 1.9) *
        t.def.halfWidth *
        0.18;
      const latTarget = Math.max(
        -t.def.halfWidth * 0.6,
        Math.min(t.def.halfWidth * 0.6, bias + sway),
      );
      r.lat += (latTarget - r.lat) * Math.min(1, 2.2 * dt);

      const c = trackPos(t, r.s);
      r.x = c.x - c.dirY * r.lat;
      r.y = c.y + c.dirX * r.lat;
      r.heading = Math.atan2(c.dirY, c.dirX);
    }
  }
}
