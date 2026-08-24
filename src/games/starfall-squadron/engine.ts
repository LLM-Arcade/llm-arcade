// Starfall Squadron — fixed-timestep-ish arcade engine (Galaga homage,
// original everything). Formation with sway/breathe, bezier entries and
// dives, captor tractor-beam capture + dual-fighter rescue, kill chains,
// and bonus challenge waves every 4th wave.

export const W = 360;
export const H = 560;
export const PLAYER_Y = H - 56;

const COLS = 10;
const ROW_Y0 = 64;
const ROW_DY = 25;
const COL_DX = 29;

export type SfxName =
  | "shoot"
  | "hitDrone"
  | "hitWarrior"
  | "hitCaptor"
  | "playerBoom"
  | "dive"
  | "beam"
  | "capture"
  | "rescue"
  | "waveClear"
  | "perfect"
  | "extraLife";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, string | number> };

export type EnemyKind = "drone" | "warrior" | "captor";

interface V {
  x: number;
  y: number;
}

interface Path {
  p0: V;
  p1: V;
  p2: V;
  p3: V;
}

const bez = (p: Path, t: number): V => {
  const u = 1 - t;
  return {
    x: u * u * u * p.p0.x + 3 * u * u * t * p.p1.x + 3 * u * t * t * p.p2.x + t * t * t * p.p3.x,
    y: u * u * u * p.p0.y + 3 * u * u * t * p.p1.y + 3 * u * t * t * p.p2.y + t * t * t * p.p3.y,
  };
};

export type EnemyState = "waiting" | "entering" | "formation" | "diving" | "beaming" | "returning";

export interface Enemy {
  kind: EnemyKind;
  col: number;
  row: number;
  x: number;
  y: number;
  angle: number;
  hp: number;
  state: EnemyState;
  path: Path | null;
  t: number;
  tSpeed: number;
  delay: number;
  beamDive: boolean;
  beamUntil: number;
  fireAt: number[];
  hasCaptive: boolean;
  challenge: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  friendly: boolean;
}

export interface Explosion {
  x: number;
  y: number;
  age: number;
}

export interface Star {
  x: number;
  y: number;
  speed: number;
  scale: number;
  alpha: number;
}

export type PlayerState = "alive" | "exploding" | "captured" | "waiting" | "gone";

const RADII: Record<EnemyKind, number> = { drone: 9, warrior: 10, captor: 13 };
const POINTS: Record<EnemyKind, number> = { drone: 50, warrior: 80, captor: 150 };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Engine {
  time = 0;
  score = 0;
  wave = 0;
  lives = 3;
  kills = 0;
  chain = 0;
  bestChain = 0;
  phase: "battle" | "cleared" | "gameover" = "battle";
  banner = "";
  bannerUntil = 0;

  player = {
    x: W / 2,
    state: "alive" as PlayerState,
    timer: 0,
    invuln: 0,
    dual: false,
  };
  input = { dir: 0, fire: false, targetX: null as number | null };

  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  explosions: Explosion[] = [];
  stars: Star[] = [];

  /** capture animation: player ship tweening up to the captor */
  captureAnim: { e: Enemy; t: number; fromX: number } | null = null;
  /** freed captive tweening down to dock */
  freedShip: { x: number; y: number; t: number; fromX: number; fromY: number } | null = null;
  private pendingDual = false;

  private fireCooldown = 0;
  private diveTimer = 3;
  private lastKillAt = -9;
  private escaped = 0;
  private isChallenge = false;
  private waveStartedAt = 0;
  private clearedAt = 0;
  private extraGiven = false;
  private gameoverSent = false;

  private events: GameEvent[] = [];
  private achieved = new Set<string>();

  constructor() {
    for (let i = 0; i < 34; i++) {
      this.stars.push({
        x: rnd(0, W),
        y: rnd(0, H),
        speed: rnd(12, 55),
        scale: rnd(0.5, 1.4),
        alpha: rnd(0.25, 0.9),
      });
    }
    this.nextWave();
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

  // ---- Waves ---------------------------------------------------------

  private slotPos(e: Enemy): V {
    const sway = Math.sin(this.time * 0.6) * 15;
    const breathe = 1 + 0.05 * Math.sin(this.time * 0.9);
    return {
      x: W / 2 + (e.col - (COLS - 1) / 2) * COL_DX * breathe + sway,
      y: ROW_Y0 + e.row * ROW_DY,
    };
  }

  private makeEnemy(kind: EnemyKind, col: number, row: number): Enemy {
    return {
      kind, col, row,
      x: -60, y: -60, angle: Math.PI,
      hp: kind === "captor" ? 2 : 1,
      state: "waiting", path: null, t: 0, tSpeed: 0.55,
      delay: 0, beamDive: false, beamUntil: 0, fireAt: [],
      hasCaptive: false, challenge: false,
    };
  }

  private entryPath(side: -1 | 1, target: V): Path {
    return {
      p0: { x: W / 2 + side * (W / 2 + 50), y: H * 0.62 },
      p1: { x: W / 2 + side * W * 0.55, y: H * rnd(0.85, 0.95) },
      p2: { x: W / 2 - side * W * 0.5, y: H * rnd(0.18, 0.3) },
      p3: target,
    };
  }

  private nextWave() {
    this.wave++;
    this.enemies = [];
    this.bullets = [];
    this.escaped = 0;
    this.phase = "battle";
    this.waveStartedAt = this.time;
    this.isChallenge = this.wave % 4 === 0;
    this.diveTimer = 3.2;
    if (this.wave >= 10) this.achieve("squadron-leader");

    if (this.isChallenge) {
      this.setBanner("CHALLENGE WAVE", 2);
      // 3 trains × 8, no formation, no fire — pure bonus targets
      for (let train = 0; train < 3; train++) {
        const side: -1 | 1 = train % 2 === 0 ? -1 : 1;
        for (let i = 0; i < 8; i++) {
          const e = this.makeEnemy(i % 3 === 2 ? "warrior" : "drone", i, train);
          e.challenge = true;
          e.delay = train * 2.2 + i * 0.16;
          e.tSpeed = 0.34;
          e.path = {
            p0: { x: W / 2 + side * (W / 2 + 40), y: H * 0.2 + train * 30 },
            p1: { x: W / 2 + side * W * 0.2, y: H * rnd(0.55, 0.7) },
            p2: { x: W / 2 - side * W * 0.55, y: H * rnd(0.25, 0.45) },
            p3: { x: W / 2 - side * (W / 2 + 60), y: H * 0.15 },
          };
          this.enemies.push(e);
        }
      }
    } else {
      this.setBanner(`WAVE ${this.wave}`, 1.6);
      const rows: Array<[EnemyKind, number[]]> = [
        ["captor", [3, 4, 5, 6]],
        ["warrior", [1, 2, 3, 4, 5, 6, 7, 8]],
        ["warrior", [1, 2, 3, 4, 5, 6, 7, 8]],
        ["drone", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
        ["drone", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
      ];
      rows.forEach(([kind, cols], row) => {
        cols.forEach((col, i) => {
          const e = this.makeEnemy(kind, col, row);
          e.delay = row * 1.05 + i * 0.12;
          e.tSpeed = 0.5;
          this.enemies.push(e);
        });
      });
    }
  }

  // ---- Difficulty knobs ------------------------------------------------

  private get battleWave() {
    return this.wave - Math.floor(this.wave / 4); // challenge waves don't scale difficulty
  }
  private get diveInterval() {
    return Math.max(0.55, 2.1 - this.battleWave * 0.13);
  }
  private get maxDivers() {
    return Math.min(4, 1 + Math.floor(this.battleWave / 3));
  }
  private get enemyShotSpeed() {
    return Math.min(265, 150 + this.battleWave * 9);
  }

  // ---- Scoring ---------------------------------------------------------

  private get chainMult() {
    return this.chain >= 10 ? 3 : this.chain >= 5 ? 2 : 1;
  }

  private addScore(pts: number) {
    this.score += pts;
    if (this.score >= 50000) this.achieve("star-ace");
    if (!this.extraGiven && this.score >= 30000) {
      this.extraGiven = true;
      this.lives++;
      this.emit({ type: "sfx", sound: "extraLife" });
      this.setBanner("EXTRA SHIP", 1.4);
    }
  }

  // ---- Update ---------------------------------------------------------

  update(dt: number) {
    this.time += dt;

    for (const s of this.stars) {
      s.y += s.speed * dt;
      if (s.y > H + 2) {
        s.y = -2;
        s.x = rnd(0, W);
      }
    }
    this.explosions = this.explosions.filter((x) => (x.age += dt) < 0.45);
    if (this.time > this.bannerUntil) this.banner = "";

    if (this.phase === "gameover") return;

    if (this.phase === "cleared") {
      this.updatePlayer(dt);
      this.updateFreed(dt);
      if (this.time - this.clearedAt > 1.3) this.nextWave();
      return;
    }

    this.updatePlayer(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateCapture(dt);
    this.updateFreed(dt);
    this.collide();
    this.checkWaveEnd();
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    if (p.invuln > 0) p.invuln -= dt;

    if (p.state === "exploding" || p.state === "waiting") {
      p.timer -= dt;
      if (p.timer <= 0) {
        if (p.state === "exploding") {
          this.lives--;
          if (this.lives <= 0) return this.gameOver();
          p.state = "waiting";
          p.timer = 1.2;
        } else {
          p.state = "alive";
          p.x = W / 2;
          p.invuln = 2.2;
          if (this.pendingDual) {
            p.dual = true;
            this.pendingDual = false;
          }
        }
      }
      return;
    }
    if (p.state !== "alive") return;

    const speed = 250;
    if (this.input.targetX !== null) {
      const d = this.input.targetX - p.x;
      p.x += Math.abs(d) < speed * dt ? d : Math.sign(d) * speed * dt;
    } else {
      p.x += this.input.dir * speed * dt;
    }
    const margin = p.dual ? 26 : 16;
    p.x = Math.max(margin, Math.min(W - margin, p.x));

    this.fireCooldown -= dt;
    if (this.input.fire && this.fireCooldown <= 0) {
      const max = p.dual ? 4 : 2;
      const mine = this.bullets.filter((b) => b.friendly).length;
      if (mine < max) {
        this.fireCooldown = 0.17;
        this.emit({ type: "sfx", sound: "shoot" });
        if (p.dual) {
          this.bullets.push({ x: p.x - 10, y: PLAYER_Y - 14, vx: 0, vy: -430, friendly: true });
          this.bullets.push({ x: p.x + 10, y: PLAYER_Y - 14, vx: 0, vy: -430, friendly: true });
        } else {
          this.bullets.push({ x: p.x, y: PLAYER_Y - 14, vx: 0, vy: -430, friendly: true });
        }
      }
    }
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.bullets = this.bullets.filter((b) => b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20);
  }

  private moveAlong(e: Enemy, dt: number): V {
    e.t = Math.min(1, e.t + e.tSpeed * dt);
    const pos = bez(e.path!, e.t);
    if (!e.challenge && e.state === "entering" && e.t > 0.82) {
      const k = (e.t - 0.82) / 0.18;
      const slot = this.slotPos(e);
      pos.x = pos.x * (1 - k) + slot.x * k;
      pos.y = pos.y * (1 - k) + slot.y * k;
    }
    return pos;
  }

  private updateEnemies(dt: number) {
    const p = this.player;

    for (const e of this.enemies) {
      const ox = e.x, oy = e.y;

      switch (e.state) {
        case "waiting":
          e.delay -= dt;
          if (e.delay <= 0) {
            e.state = "entering";
            if (!e.challenge) {
              e.path = this.entryPath(e.row % 2 === 0 ? -1 : 1, this.slotPos(e));
            }
            const start = bez(e.path!, 0);
            e.x = start.x;
            e.y = start.y;
          }
          continue;
        case "entering": {
          const pos = this.moveAlong(e, dt);
          e.x = pos.x;
          e.y = pos.y;
          if (e.t >= 1) {
            if (e.challenge) {
              e.hp = 0; // escaped — culled below without points
              this.escaped++;
            } else {
              e.state = "formation";
            }
          }
          break;
        }
        case "formation": {
          const slot = this.slotPos(e);
          e.x = slot.x;
          e.y = slot.y;
          e.angle = Math.PI;
          break;
        }
        case "diving": {
          const pos = this.moveAlong(e, dt);
          e.x = pos.x;
          e.y = pos.y;
          while (e.fireAt.length && e.t >= e.fireAt[0]) {
            e.fireAt.shift();
            this.enemyShoot(e);
          }
          if (e.t >= 1) {
            if (e.beamDive) {
              e.state = "beaming";
              e.beamUntil = this.time + 1.7;
              this.emit({ type: "sfx", sound: "beam" });
            } else {
              // exited the bottom — glide back in from the top
              e.state = "returning";
              e.x = this.slotPos(e).x;
              e.y = -30;
            }
          }
          break;
        }
        case "beaming": {
          if (
            !this.captureAnim &&
            p.state === "alive" &&
            p.invuln <= 0 &&
            Math.abs(p.x - e.x) < 30
          ) {
            if (p.dual) {
              p.dual = false;
              p.invuln = 2;
              this.emit({ type: "sfx", sound: "playerBoom" });
              this.explosions.push({ x: p.x + 10, y: PLAYER_Y, age: 0 });
            } else {
              this.captureAnim = { e, t: 0, fromX: p.x };
              p.state = "captured";
              this.emit({ type: "sfx", sound: "capture" });
            }
          }
          if (this.time >= e.beamUntil && this.captureAnim?.e !== e) {
            e.state = "returning";
          }
          break;
        }
        case "returning": {
          const slot = this.slotPos(e);
          const dx = slot.x - e.x, dy = slot.y - e.y;
          const d = Math.hypot(dx, dy);
          const step = 150 * dt;
          if (d < step + 2) {
            e.state = "formation";
          } else {
            e.x += (dx / d) * step;
            e.y += (dy / d) * step;
          }
          break;
        }
      }

      // face travel direction (sprites point up)
      if (e.state !== "formation") {
        const vx = e.x - ox, vy = e.y - oy;
        if (Math.abs(vx) + Math.abs(vy) > 0.1) {
          const target = Math.atan2(vy, vx) + Math.PI / 2;
          let d = target - e.angle;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          e.angle += d * Math.min(1, 12 * dt);
        }
      }
    }

    this.enemies = this.enemies.filter((e) => e.hp > 0);

    // dive scheduler
    if (!this.isChallenge && this.phase === "battle" && this.time - this.waveStartedAt > 3) {
      this.diveTimer -= dt;
      const diving = this.enemies.filter(
        (e) => e.state === "diving" || e.state === "beaming",
      ).length;
      if (this.diveTimer <= 0 && diving < this.maxDivers) {
        this.diveTimer = this.diveInterval;
        this.launchDive();
      }
    }
  }

  private launchDive() {
    const formed = this.enemies.filter((e) => e.state === "formation");
    if (!formed.length) return;
    // captors and warriors lead the charge
    const pool = formed.filter((e) => e.kind !== "drone");
    const e = (pool.length && Math.random() < 0.7 ? pool : formed)[
      Math.floor(Math.random() * (pool.length && Math.random() < 0.7 ? pool.length : formed.length))
    ];
    const p = this.player;

    e.t = 0;
    e.state = "diving";
    this.emit({ type: "sfx", sound: "dive" });

    if (e.kind === "captor" && !e.hasCaptive && p.state === "alive" && Math.random() < 0.55) {
      e.beamDive = true;
      e.tSpeed = 0.6;
      e.fireAt = [];
      e.path = {
        p0: { x: e.x, y: e.y },
        p1: { x: e.x + rnd(-70, 70), y: H * 0.25 },
        p2: { x: p.x + rnd(-50, 50), y: H * 0.3 },
        p3: { x: Math.max(45, Math.min(W - 45, p.x + rnd(-25, 25))), y: H * 0.42 },
      };
    } else {
      e.beamDive = false;
      e.tSpeed = rnd(0.42, 0.5) + this.battleWave * 0.012;
      e.fireAt = [rnd(0.25, 0.4), rnd(0.5, 0.72)];
      const side = Math.sign(p.x - e.x) || 1;
      e.path = {
        p0: { x: e.x, y: e.y },
        p1: { x: e.x - side * rnd(40, 90), y: e.y + H * 0.22 },
        p2: { x: p.x + side * rnd(30, 80), y: H * 0.72 },
        p3: { x: p.x + rnd(-40, 40), y: H + 50 },
      };
    }
  }

  private enemyShoot(e: Enemy) {
    if (this.player.state !== "alive") return;
    const dx = this.player.x - e.x + rnd(-25, 25);
    const dy = PLAYER_Y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const s = this.enemyShotSpeed;
    this.bullets.push({ x: e.x, y: e.y + 8, vx: (dx / d) * s, vy: (dy / d) * s, friendly: false });
  }

  // ---- Capture / rescue ---------------------------------------------------------

  private updateCapture(dt: number) {
    const c = this.captureAnim;
    if (!c) return;
    c.t = Math.min(1, c.t + dt / 0.9);
    if (c.t >= 1) {
      this.captureAnim = null;
      c.e.hasCaptive = true;
      c.e.state = "returning";
      this.lives--;
      if (this.lives <= 0) return this.gameOver();
      this.player.state = "waiting";
      this.player.timer = 2.4;
    }
  }

  /** Player x/y during the capture tween, for rendering. */
  capturePos(): V | null {
    const c = this.captureAnim;
    if (!c) return null;
    const t = c.t;
    return {
      x: c.fromX + (c.e.x - c.fromX) * t * t,
      y: PLAYER_Y + (c.e.y + 20 - PLAYER_Y) * t,
    };
  }

  private updateFreed(dt: number) {
    const f = this.freedShip;
    if (!f) return;
    f.t = Math.min(1, f.t + dt / 1.1);
    const tx = this.player.state === "alive" ? this.player.x : W / 2;
    f.x = f.fromX + (tx - f.fromX) * f.t;
    f.y = f.fromY + (PLAYER_Y - f.fromY) * (f.t * f.t);
    if (f.t >= 1) {
      this.freedShip = null;
      if (this.player.state === "alive") this.player.dual = true;
      else this.pendingDual = true;
      this.addScore(1000);
      this.achieve("wingmate");
      this.emit({ type: "sfx", sound: "rescue" });
      this.setBanner("FIGHTER RESCUED", 1.4);
    }
  }

  // ---- Collisions ---------------------------------------------------------

  private collide() {
    const p = this.player;

    // player bullets → enemies
    for (const b of this.bullets) {
      if (!b.friendly) continue;
      for (const e of this.enemies) {
        if (e.state === "waiting" || e.hp <= 0) continue;
        const r = RADII[e.kind] + 5;
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < r * r) {
          b.y = -999; // consume
          e.hp--;
          if (e.hp <= 0) this.killEnemy(e);
          else this.emit({ type: "sfx", sound: "hitCaptor" });
          break;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    if (p.state !== "alive" || p.invuln > 0) return;

    const hitPlayer = (x: number, y: number, r: number) => {
      const dx = x - p.x, dy = y - PLAYER_Y;
      const rr = r + (p.dual ? 18 : 11);
      return dx * dx + dy * dy < rr * rr;
    };

    for (const b of this.bullets) {
      if (b.friendly) continue;
      if (hitPlayer(b.x, b.y, 4)) {
        b.y = H + 999;
        return this.hitPlayer();
      }
    }
    for (const e of this.enemies) {
      if (e.state === "diving" || e.state === "returning") {
        if (hitPlayer(e.x, e.y, RADII[e.kind])) {
          this.killEnemy(e, true);
          this.enemies = this.enemies.filter((o) => o.hp > 0);
          return this.hitPlayer();
        }
      }
    }
  }

  private hitPlayer() {
    const p = this.player;
    this.explosions.push({ x: p.x, y: PLAYER_Y, age: 0 });
    this.emit({ type: "sfx", sound: "playerBoom" });
    this.chain = 0;
    if (p.dual) {
      p.dual = false;
      p.invuln = 2;
      return;
    }
    p.state = "exploding";
    p.timer = 0.9;
  }

  private killEnemy(e: Enemy, silent = false) {
    e.hp = 0;
    this.kills++;
    this.explosions.push({ x: e.x, y: e.y, age: 0 });
    if (!silent) {
      this.emit({
        type: "sfx",
        sound: e.kind === "drone" ? "hitDrone" : e.kind === "warrior" ? "hitWarrior" : "hitCaptor",
      });
    }

    // chain
    if (this.time - this.lastKillAt < 1.3) this.chain++;
    else this.chain = 1;
    this.lastKillAt = this.time;
    this.bestChain = Math.max(this.bestChain, this.chain);
    if (this.chain >= 5) this.achieve("hot-streak");
    if (this.chain >= 10) this.achieve("unbroken");

    // points
    if (e.challenge) {
      this.addScore(200);
    } else {
      const diveMult = e.state === "formation" ? 1 : 2;
      this.addScore(POINTS[e.kind] * diveMult * this.chainMult);
    }

    // captive outcomes
    if (e.kind === "captor" && e.hasCaptive) {
      if (e.state === "formation") {
        // shot down at home — the captured fighter is lost with it
        this.setBanner("FIGHTER LOST", 1.2);
      } else {
        this.freedShip = { x: e.x, y: e.y, t: 0, fromX: e.x, fromY: e.y };
      }
    }
    // captor died mid-capture — release the tractor beam victim? No:
    // capture completes only via updateCapture; if its captor dies first,
    // give the ship back.
    if (this.captureAnim?.e === e) {
      this.captureAnim = null;
      this.player.state = "alive";
      this.player.invuln = 2;
    }
  }

  // ---- Wave end / game over ---------------------------------------------------------

  private checkWaveEnd() {
    if (this.phase !== "battle") return;
    if (this.enemies.length > 0) return;
    this.phase = "cleared";
    this.clearedAt = this.time;

    if (this.isChallenge) {
      if (this.escaped === 0) {
        this.addScore(3000);
        this.achieve("perfect-volley");
        this.setBanner("PERFECT! +3000", 2);
        this.emit({ type: "sfx", sound: "perfect" });
      } else {
        this.setBanner(`${24 - this.escaped}/24 DOWN`, 1.6);
        this.emit({ type: "sfx", sound: "waveClear" });
      }
    } else {
      if (this.wave === 1) this.achieve("first-sortie");
      this.emit({ type: "sfx", sound: "waveClear" });
    }

  }

  private gameOver() {
    if (this.gameoverSent) return;
    this.gameoverSent = true;
    this.phase = "gameover";
    this.player.state = "gone";
    this.banner = "";
    this.emit({
      type: "gameover",
      score: this.score,
      stats: { wave: this.wave, kills: this.kills, best_chain: this.bestChain },
    });
  }
}
