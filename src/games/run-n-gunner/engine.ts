// Run 'n Gunner engine. Side-scrolling run-and-gun, fully original.
// Three chunk-built stages, a forward-only camera, trickle-spawned runners,
// turrets and lobbers, supply drones, six parameterized bosses, checkpoint
// respawns, and a one-life-run score multiplier. Framework-free, engine
// time only, event queue drained by the component (Starfall contract).

import {
  GROUND_Y,
  STAGES,
  TUNE,
  WEAPONS,
  buildStage,
  groundAt,
  type BossDef,
  type BuiltStage,
  type EnemyKind,
  type SpawnDef,
  type WeaponId,
} from "./stages.ts";

export const W = 480;
export const H = 270;

export type SfxName =
  | "shoot"
  | "hit"
  | "boom"
  | "hurt"
  | "down"
  | "pickup"
  | "jump"
  | "bossDown"
  | "stageClear"
  | "victory";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, string | number> };

export interface PlayerShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  pierce: boolean;
  size: number;
}

export interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grav: boolean; // grenades arc, orbs fly straight
}

export interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number; // feet (ground units) or platform top; drones use center
  vy: number;
  hp: number;
  fireT: number;
  wobble: number; // drone sine phase
}

export interface Pickup {
  x: number;
  y: number;
  vy: number;
  item: WeaponId;
}

export interface Boss {
  def: BossDef;
  x: number;
  y: number; // center
  hp: number;
  dir: number;
  arenaX: number;
  attackT: number[];
  chargeT: number;
  charging: number; // s left of an active charge
  lastVolley: number; // engine time of the last attack volley
  flash: number;
  playerHurt: boolean; // any player damage during this fight
}

export interface Explosion {
  x: number;
  y: number;
  age: number;
}

export type Phase = "playing" | "respawn" | "stageclear" | "gameover" | "victory";

const PLAYER_HALF_W = 6;
const PLAYER_H = 22;

const ENEMY_SIZE: Record<EnemyKind, { hw: number; hh: number }> = {
  runner: { hw: 8, hh: 9 },
  turret: { hw: 10, hh: 10 },
  lobber: { hw: 9, hh: 8 },
  drone: { hw: 9, hh: 6 },
};

const DRONE_ITEMS: WeaponId[] = ["fan", "raker", "slug"];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Engine {
  time = 0;
  score = 0;
  kills = 0;
  bossesDown = 0;
  deaths = 0;
  lives = TUNE.lives;
  hp = TUNE.playerHp;
  stageIndex = 0;
  stage: BuiltStage;
  phase: Phase = "playing";
  scrollX = 0;
  banner = "";
  bannerUntil = 0;

  player = {
    x: 40,
    y: GROUND_Y, // feet
    lastGroundY: GROUND_Y, // feet at the last grounded moment; enemies aim here
    vy: 0,
    facing: 1,
    grounded: true,
    iFrames: 0,
    dropT: 0,
    kb: 0,
    fireCd: 0,
    weapon: "rifle" as WeaponId,
  };
  input = { dir: 0, jump: false, fire: false, up: false, down: false };

  enemies: Enemy[] = [];
  playerShots: PlayerShot[] = [];
  enemyShots: EnemyShot[] = [];
  pickups: Pickup[] = [];
  explosions: Explosion[] = [];
  boss: Boss | null = null;
  muzzle = 0; // s of muzzle flash left

  private spawnPtr = 0;
  private trickleT = 2;
  private phaseT = 0;
  private checkpoint = { scrollX: 0, x: 40 };
  private prevJump = false;
  private collectedWeapons = new Set<WeaponId>();
  private gameoverSent = false;
  private events: GameEvent[] = [];
  private achieved = new Set<string>();

  constructor() {
    this.stage = buildStage(STAGES[0]);
    this.setBanner("STAGE 1 · CANYON ROAD", 2);
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
    if (this.score >= TUNE.legendScore) this.achieve("gunner-legend");
  }

  // ---- Update -----------------------------------------------------------

  update(dt: number) {
    this.time += dt;
    this.explosions = this.explosions.filter((x) => (x.age += dt) < 0.45);
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.time > this.bannerUntil) this.banner = "";

    if (this.phase === "gameover" || this.phase === "victory") return;

    if (this.phase === "stageclear") {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.nextStage();
      return;
    }
    if (this.phase === "respawn") {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.respawn();
      return;
    }

    this.updatePlayer(dt);
    // Losing the last life or falling into a pit mid-frame must not let
    // the rest of the tick keep fighting a dead player.
    if (this.phase !== "playing") return;

    this.activateSpawns();
    this.trickle(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateShots(dt);
    this.updatePickups(dt);
    this.collide();
    if (this.phase !== "playing") return;
    this.updateCamera();
    this.checkTriggers();
  }

  // ---- Player -----------------------------------------------------------

  private updatePlayer(dt: number) {
    const p = this.player;
    if (p.iFrames > 0) p.iFrames -= dt;
    if (p.dropT > 0) p.dropT -= dt;
    p.kb -= p.kb * TUNE.knockbackDecay * dt;

    if (this.input.dir !== 0) p.facing = this.input.dir;

    const jumpPressed = this.input.jump && !this.prevJump;
    this.prevJump = this.input.jump;
    if (jumpPressed && p.grounded) {
      if (this.input.down && this.onPlatform()) {
        p.dropT = TUNE.dropTime;
        p.grounded = false;
      } else {
        p.vy = -TUNE.jumpVel;
        p.grounded = false;
        this.emit({ type: "sfx", sound: "jump" });
      }
    }
    if (!this.input.jump && p.vy < -TUNE.jumpCutVel) p.vy = -TUNE.jumpCutVel;

    const prevY = p.y;
    if (!p.grounded) {
      p.vy = Math.min(TUNE.fallCap, p.vy + TUNE.gravity * dt);
      p.y += p.vy * dt;
    }
    p.x += this.input.dir * TUNE.runSpeed * dt + p.kb * dt;
    p.x = Math.max(this.scrollX + PLAYER_HALF_W, Math.min(this.scrollX + W - PLAYER_HALF_W, p.x));

    // land on ground or platforms, feet crossing the surface from above
    if (p.vy >= 0) {
      let landed: number | null = null;
      if (prevY <= GROUND_Y && p.y >= GROUND_Y && groundAt(this.stage, p.x)) landed = GROUND_Y;
      if (landed === null && p.dropT <= 0) {
        for (const pl of this.stage.platforms) {
          if (p.x < pl.x || p.x > pl.x + pl.w) continue;
          if (prevY <= pl.y && p.y >= pl.y) {
            landed = pl.y;
            break;
          }
        }
      }
      if (landed !== null) {
        p.y = landed;
        p.lastGroundY = landed;
        p.vy = 0;
        p.grounded = true;
      } else if (p.grounded) {
        // walked off an edge
        if (!(p.y === GROUND_Y && groundAt(this.stage, p.x)) && !this.onPlatform()) {
          p.grounded = false;
          p.vy = 0;
        }
      }
    }

    if (p.y > H + 20) return this.loseLife();

    this.fire(dt);
  }

  private onPlatform(): boolean {
    const p = this.player;
    if (p.y === GROUND_Y) return false;
    return this.stage.platforms.some(
      (pl) => Math.abs(p.y - pl.y) < 1 && p.x >= pl.x && p.x <= pl.x + pl.w,
    );
  }

  private fire(dt: number) {
    const p = this.player;
    p.fireCd -= dt;
    if (!this.input.fire || p.fireCd > 0) return;
    const w = WEAPONS[p.weapon];
    p.fireCd = w.cooldown;
    this.muzzle = 0.06;
    this.emit({ type: "sfx", sound: "shoot" });

    let angle: number;
    if (this.input.up) {
      angle = this.input.dir !== 0 ? (p.facing > 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4) : -Math.PI / 2;
    } else {
      angle = p.facing > 0 ? 0 : Math.PI;
    }
    const y = p.y - PLAYER_H * 0.55;
    const jitter = w.pellets === 1 && w.spread > 0 ? rnd(-w.spread, w.spread) : 0;
    for (let i = 0; i < w.pellets; i++) {
      const a = angle + (i - (w.pellets - 1) / 2) * w.spread + jitter;
      this.playerShots.push({
        x: p.x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * w.speed,
        vy: Math.sin(a) * w.speed,
        dmg: w.dmg,
        pierce: w.pierce,
        size: w.size,
      });
    }
  }

  // ---- Spawning ---------------------------------------------------------

  private activateSpawns() {
    const edge = this.scrollX + W + 40;
    while (this.spawnPtr < this.stage.spawns.length && this.stage.spawns[this.spawnPtr].x <= edge) {
      this.instantiate(this.stage.spawns[this.spawnPtr]);
      this.spawnPtr++;
    }
  }

  private instantiate(s: SpawnDef) {
    if (s.type === "drone") {
      this.enemies.push({ kind: "drone", x: this.scrollX + W + 20, y: 70, vy: 0, hp: TUNE.droneHp, fireT: 0, wobble: rnd(0, 6) });
      return;
    }
    this.enemies.push({
      kind: s.type,
      x: s.x,
      y: s.y ?? GROUND_Y,
      vy: 0,
      hp: s.type === "turret" ? TUNE.turretHp : s.type === "lobber" ? TUNE.lobberHp : TUNE.runnerHp,
      fireT: rnd(0.6, 1.4),
      wobble: 0,
    });
  }

  private trickle(dt: number) {
    if (this.boss) return;
    this.trickleT -= dt;
    if (this.trickleT > 0) return;
    this.trickleT = TUNE.trickleInterval[this.stageIndex];
    const runners = this.enemies.filter((e) => e.kind === "runner").length;
    if (runners >= TUNE.trickleMax) return;
    const behind = Math.random() < TUNE.trickleBehindChance && this.scrollX > 20;
    const x = behind ? this.scrollX - 12 : this.scrollX + W + 12;
    if (!groundAt(this.stage, x)) return;
    this.enemies.push({ kind: "runner", x, y: GROUND_Y, vy: 0, hp: TUNE.runnerHp, fireT: 0, wobble: 0 });
  }

  // ---- Enemies ----------------------------------------------------------

  private updateEnemies(dt: number) {
    const p = this.player;
    const s = this.stageIndex;

    for (const e of this.enemies) {
      switch (e.kind) {
        case "runner": {
          const dir = Math.sign(p.x - e.x) || 1;
          e.x += dir * TUNE.runnerSpeed[s] * dt;
          if (e.y >= GROUND_Y && !groundAt(this.stage, e.x)) e.y += 1; // start falling into the pit
          if (e.y > GROUND_Y) {
            e.vy = Math.min(TUNE.fallCap, e.vy + TUNE.gravity * dt);
            e.y += e.vy * dt;
            if (e.y > H + 40) e.hp = 0;
          }
          break;
        }
        case "turret": {
          e.fireT -= dt;
          const dx = p.x - e.x;
          if (e.fireT <= 0 && Math.abs(dx) < TUNE.turretRange && this.onScreen(e.x)) {
            e.fireT = TUNE.turretInterval[s];
            this.aimShot(e.x, e.y - 10, TUNE.shotSpeed[s]);
          }
          break;
        }
        case "lobber": {
          e.fireT -= dt;
          if (e.fireT <= 0 && Math.abs(p.x - e.x) < 340 && this.onScreen(e.x)) {
            e.fireT = TUNE.lobberInterval[s];
            const t = 2 * (TUNE.grenadeVy / TUNE.gravity);
            const vx = (p.x - e.x) / t;
            this.enemyShots.push({ x: e.x, y: e.y - 12, vx: Math.max(-160, Math.min(160, vx)), vy: -TUNE.grenadeVy, grav: true });
          }
          break;
        }
        case "drone": {
          e.wobble += dt;
          e.x -= TUNE.droneSpeed * dt;
          e.y = 70 + Math.sin(e.wobble * 2.2) * 18;
          if (e.x < this.scrollX - 40) e.hp = 0;
          break;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private onScreen(x: number): boolean {
    return x > this.scrollX - 20 && x < this.scrollX + W + 20;
  }

  // NES-honest aim: shots target the standing center at the player's last
  // grounded height, never a mid-jump position, so a jump is a real dodge
  private aimY() {
    return this.player.lastGroundY - PLAYER_H / 2;
  }

  private aimShot(x: number, y: number, speed: number) {
    const dx = this.player.x - x;
    const dy = this.aimY() - y;
    const d = Math.hypot(dx, dy) || 1;
    this.enemyShots.push({ x, y, vx: (dx / d) * speed, vy: (dy / d) * speed, grav: false });
  }

  // ---- Boss -------------------------------------------------------------

  private updateBoss(dt: number) {
    const b = this.boss;
    if (!b) return;
    if (b.flash > 0) b.flash -= dt;
    const p = this.player;
    // patrol keeps clear of the left half so a player holding distance is
    // never pinned against the camera wall
    const lo = b.arenaX + 220;
    const hi = b.arenaX + W - 50;

    if (b.def.hover) {
      // stays above head height: the finale is fought with vertical fire
      b.y = GROUND_Y - 78 + Math.sin(this.time * 1.4) * 16;
      b.x += b.dir * b.def.speed * dt;
      if (b.x < lo) b.dir = 1;
      if (b.x > hi) b.dir = -1;
    } else if (b.charging > 0) {
      b.charging -= dt;
      b.x += b.dir * b.def.speed * 3.4 * dt;
      if (b.x < b.arenaX + 70 || b.x > hi) {
        b.charging = 0;
        b.dir *= -1;
      }
    } else {
      b.x += b.dir * b.def.speed * dt;
      if (b.x < lo) b.dir = 1;
      if (b.x > hi) b.dir = -1;
      if (b.def.chargeEvery > 0) {
        b.chargeT -= dt;
        if (b.chargeT <= 0) {
          // never charge into our own volley; the shots-plus-body combo
          // is undodgeable
          if (this.time - b.lastVolley < 1.2) {
            b.chargeT = 0.3;
          } else {
            b.chargeT = b.def.chargeEvery;
            b.charging = 1.1;
            b.lastVolley = this.time; // a charge counts as a volley
            b.dir = Math.sign(p.x - b.x) || -1;
          }
        }
      }
    }

    // a charge is its own attack; firing through it is unreadable
    if (b.charging > 0) return;

    b.def.attacks.forEach((atk, i) => {
      b.attackT[i] -= dt;
      if (b.attackT[i] > 0) return;
      // two volleys landing in the same breath are unreadable; hold this
      // one until the previous volley has had daylight
      if (this.time - b.lastVolley < 1.25) {
        b.attackT[i] = 0;
        return;
      }
      b.attackT[i] = atk.every;
      b.lastVolley = this.time;
      const ox = b.x;
      const oy = b.y;
      if (atk.kind === "burst") {
        const base = Math.atan2(this.aimY() - oy, p.x - ox);
        for (let k = 0; k < atk.count; k++) {
          const a = base + (k - (atk.count - 1) / 2) * 0.14;
          this.enemyShots.push({ x: ox, y: oy, vx: Math.cos(a) * atk.speed, vy: Math.sin(a) * atk.speed, grav: false });
        }
      } else if (atk.kind === "arc") {
        for (let k = 0; k < atk.count; k++) {
          const t = 2 * (TUNE.grenadeVy / TUNE.gravity);
          const vx = (p.x + (k - (atk.count - 1) / 2) * 40 - ox) / t;
          this.enemyShots.push({ x: ox, y: oy, vx: Math.max(-170, Math.min(170, vx)), vy: -TUNE.grenadeVy, grav: true });
        }
      } else {
        const base = Math.atan2(this.aimY() - oy, p.x - ox);
        for (let k = 0; k < atk.count; k++) {
          const a = base + (k - (atk.count - 1) / 2) * 0.32;
          this.enemyShots.push({ x: ox, y: oy, vx: Math.cos(a) * atk.speed, vy: Math.sin(a) * atk.speed, grav: false });
        }
      }
    });
  }

  private spawnBoss(triggerIdx: number) {
    const trigger = this.stage.triggers[triggerIdx];
    const def = this.stage.def.bosses[trigger.kind === "mid" ? 0 : 1];
    this.scrollX = trigger.x;
    this.boss = {
      def,
      x: trigger.x + W * 0.72,
      y: def.hover ? GROUND_Y - 78 : GROUND_Y - def.h / 2,
      hp: def.hp,
      dir: -1,
      arenaX: trigger.x,
      attackT: def.attacks.map((a, i) => a.every * 0.7 + i * 0.9),
      chargeT: def.chargeEvery,
      charging: 0,
      lastVolley: -9,
      flash: 0,
      playerHurt: false,
    };
    this.setBanner(def.name, 1.8);
  }

  private killBoss() {
    const b = this.boss!;
    this.boss = null;
    this.bossesDown++;
    this.kills++;
    this.explosions.push({ x: b.x, y: b.y, age: 0 }, { x: b.x - 14, y: b.y + 10, age: 0.1 }, { x: b.x + 14, y: b.y - 8, age: 0.15 });
    this.emit({ type: "sfx", sound: "bossDown" });
    this.addScore(TUNE.bossPoints[b.def.kind]);
    if (!b.playerHurt) {
      this.addScore(TUNE.bossNoHitBonus);
      this.achieve("flawless-duel");
    }
    const trigger = this.stage.triggers.find((t) => t.x === b.arenaX)!;
    trigger.cleared = true;
    if (b.def.kind === "mid") {
      this.checkpoint = { scrollX: b.arenaX, x: b.arenaX + 60 };
      this.setBanner("CHECKPOINT", 1.4);
    } else {
      this.stageClear();
    }
  }

  private stageClear() {
    this.addScore(TUNE.stageClearBonus);
    if (this.stageIndex === 0) this.achieve("open-road");
    this.phase = "stageclear";
    this.phaseT = TUNE.stageClearHold;
    this.enemyShots = [];
    this.setBanner(this.stageIndex === 2 ? "CORE DESTROYED" : "STAGE CLEAR +1000", TUNE.stageClearHold);
    this.emit({ type: "sfx", sound: "stageClear" });
  }

  private nextStage() {
    if (this.stageIndex >= 2) return this.victory();
    this.stageIndex++;
    this.stage = buildStage(STAGES[this.stageIndex]);
    this.scrollX = 0;
    this.spawnPtr = 0;
    this.trickleT = 2;
    this.enemies = [];
    this.playerShots = [];
    this.enemyShots = [];
    this.pickups = [];
    this.boss = null;
    this.hp = TUNE.playerHp;
    this.checkpoint = { scrollX: 0, x: 40 };
    const p = this.player;
    p.x = 40;
    p.y = GROUND_Y;
    p.vy = 0;
    p.grounded = true;
    p.iFrames = 1;
    this.phase = "playing";
    this.setBanner(`STAGE ${this.stageIndex + 1} · ${this.stage.def.name}`, 2);
  }

  // ---- Shots / pickups --------------------------------------------------

  private updateShots(dt: number) {
    for (const s of this.playerShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    for (const s of this.enemyShots) {
      if (s.grav) s.vy += TUNE.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    const lo = this.scrollX - 30;
    const hi = this.scrollX + W + 30;
    this.playerShots = this.playerShots.filter((s) => s.x > lo && s.x < hi && s.y > -20 && s.y < H + 20);
    this.enemyShots = this.enemyShots.filter(
      (s) => s.x > lo && s.x < hi && s.y > -30 && (s.grav ? s.y < GROUND_Y + 4 : s.y < H + 20),
    );
  }

  private updatePickups(dt: number) {
    for (const pk of this.pickups) {
      if (pk.y < GROUND_Y) {
        pk.vy = Math.min(TUNE.fallCap, pk.vy + TUNE.gravity * dt);
        pk.y = Math.min(GROUND_Y, pk.y + pk.vy * dt);
      }
    }
  }

  // ---- Collisions -------------------------------------------------------

  private collide() {
    const p = this.player;
    const pcx = p.x;
    const pcy = p.y - PLAYER_H / 2;

    // player shots vs enemies and boss
    for (const s of this.playerShots) {
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const sz = ENEMY_SIZE[e.kind];
        const ecy = e.kind === "drone" ? e.y : e.y - sz.hh;
        if (Math.abs(s.x - e.x) < sz.hw + s.size && Math.abs(s.y - ecy) < sz.hh + s.size) {
          e.hp -= s.dmg;
          if (!s.pierce) s.x = -9999;
          if (e.hp <= 0) this.killEnemy(e);
          else this.emit({ type: "sfx", sound: "hit" });
          if (!s.pierce) break;
        }
      }
      const b = this.boss;
      if (b && Math.abs(s.x - b.x) < b.def.w / 2 + s.size && Math.abs(s.y - b.y) < b.def.h / 2 + s.size) {
        b.hp -= s.dmg;
        b.flash = 0.1;
        if (!s.pierce) s.x = -9999;
        this.emit({ type: "sfx", sound: "hit" });
        if (b.hp <= 0) {
          this.killBoss();
          if (this.phase !== "playing") return;
        }
      }
    }
    this.playerShots = this.playerShots.filter((s) => s.x > -999);
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    // pickups
    for (const pk of this.pickups) {
      if (Math.abs(pk.x - pcx) < 16 && Math.abs(pk.y - 8 - pcy) < 22) {
        pk.x = -9999;
        this.collect(pk.item);
      }
    }
    for (const fp of this.stage.pickups) {
      if (!fp.collected && Math.abs(fp.x - pcx) < 16 && Math.abs(GROUND_Y - 8 - pcy) < 26) {
        fp.collected = true;
        this.collect(fp.item);
      }
    }
    this.pickups = this.pickups.filter((pk) => pk.x > -999);

    if (p.iFrames > 0) return;

    // enemy shots vs player
    for (const s of this.enemyShots) {
      const r = s.grav ? 7 : 5;
      if (Math.abs(s.x - pcx) < PLAYER_HALF_W + r && Math.abs(s.y - pcy) < PLAYER_H / 2 + r) {
        const dir = Math.sign(pcx - s.x) || 1;
        s.x = -9999;
        return this.hurt(dir);
      }
    }

    // enemy bodies vs player
    for (const e of this.enemies) {
      const sz = ENEMY_SIZE[e.kind];
      const ecy = e.kind === "drone" ? e.y : e.y - sz.hh;
      if (Math.abs(e.x - pcx) < sz.hw + PLAYER_HALF_W && Math.abs(ecy - pcy) < sz.hh + PLAYER_H / 2) {
        if (e.kind === "runner") {
          e.hp = 0;
          this.explosions.push({ x: e.x, y: ecy, age: 0 });
          this.enemies = this.enemies.filter((o) => o.hp > 0);
        }
        return this.hurt(Math.sign(pcx - e.x) || 1);
      }
    }

    // boss body vs player
    const b = this.boss;
    if (b && Math.abs(b.x - pcx) < b.def.w / 2 + PLAYER_HALF_W && Math.abs(b.y - pcy) < b.def.h / 2 + PLAYER_H / 2) {
      return this.hurt(Math.sign(pcx - b.x) || 1);
    }
  }

  private collect(item: WeaponId) {
    this.player.weapon = item;
    this.collectedWeapons.add(item);
    if (this.collectedWeapons.size >= 3) this.achieve("arsenal");
    this.emit({ type: "sfx", sound: "pickup" });
    this.setBanner(`${WEAPONS[item].name} EQUIPPED`, 1.2);
  }

  private killEnemy(e: Enemy) {
    this.kills++;
    if (this.kills >= TUNE.wreckCount) this.achieve("wrecking-crew");
    const sz = ENEMY_SIZE[e.kind];
    this.explosions.push({ x: e.x, y: e.kind === "drone" ? e.y : e.y - sz.hh, age: 0 });
    this.emit({ type: "sfx", sound: "boom" });
    this.addScore(TUNE.points[e.kind]);
    if (e.kind === "drone") {
      const item = DRONE_ITEMS[Math.floor(Math.random() * DRONE_ITEMS.length)];
      this.pickups.push({ x: e.x, y: e.y, vy: 0, item });
    }
  }

  private hurt(dir: number) {
    const p = this.player;
    if (this.boss) this.boss.playerHurt = true;
    this.hp--;
    if (this.hp <= 0) return this.loseLife();
    p.iFrames = TUNE.iFrames;
    p.kb = dir * TUNE.knockback;
    this.emit({ type: "sfx", sound: "hurt" });
  }

  private loseLife() {
    this.lives--;
    this.deaths++;
    const p = this.player;
    this.explosions.push({ x: p.x, y: p.y - PLAYER_H / 2, age: 0 });
    this.emit({ type: "sfx", sound: "down" });
    if (this.lives <= 0) return this.gameOver();
    this.phase = "respawn";
    this.phaseT = TUNE.respawnDelay;
  }

  private respawn() {
    const p = this.player;
    this.scrollX = this.checkpoint.scrollX;
    p.x = this.checkpoint.x;
    p.y = GROUND_Y;
    p.vy = 0;
    p.grounded = true;
    p.iFrames = 2;
    p.kb = 0;
    p.weapon = "rifle";
    this.hp = TUNE.playerHp;
    this.enemies = [];
    this.playerShots = [];
    this.enemyShots = [];
    this.pickups = [];
    this.boss = null;
    this.trickleT = 2.5;
    // re-arm everything ahead of the checkpoint camera; a boss trigger only
    // stays consumed once its fight was actually won
    this.spawnPtr = this.stage.spawns.findIndex((s) => s.x >= this.scrollX);
    if (this.spawnPtr < 0) this.spawnPtr = this.stage.spawns.length;
    this.phase = "playing";
  }

  // ---- Camera / triggers ------------------------------------------------

  private updateCamera() {
    if (this.boss) return; // locked to the arena
    const target = this.player.x - W * 0.4;
    this.scrollX = Math.max(this.scrollX, Math.min(target, this.stage.length - W));
  }

  private checkTriggers() {
    if (this.boss) return;
    for (let i = 0; i < this.stage.triggers.length; i++) {
      const t = this.stage.triggers[i];
      if (!t.cleared && this.scrollX >= t.x) {
        this.spawnBoss(i);
        return;
      }
    }
  }

  // ---- Endings ----------------------------------------------------------

  private victory() {
    this.phase = "victory";
    this.addScore(TUNE.victoryBonus);
    this.achieve("long-march");
    if (this.deaths === 0) {
      this.achieve("one-life-run");
      this.score = Math.min(TUNE.scoreCap, this.score * TUNE.oneLifeMult);
      if (this.score >= TUNE.legendScore) this.achieve("gunner-legend");
      this.setBanner("ONE-LIFE RUN · SCORE DOUBLED", 4);
    } else {
      this.setBanner("MISSION COMPLETE", 4);
    }
    this.emit({ type: "sfx", sound: "victory" });
    this.sendGameover();
  }

  private gameOver() {
    this.phase = "gameover";
    this.banner = "";
    this.sendGameover();
  }

  private sendGameover() {
    if (this.gameoverSent) return;
    this.gameoverSent = true;
    this.emit({
      type: "gameover",
      score: this.score,
      stats: {
        stage: this.stageIndex + 1,
        kills: this.kills,
        bosses: this.bossesDown,
        deaths: this.deaths,
      },
    });
  }
}
