// Munch Maze game engine: fixed-grid movement (turns at tile centers),
// target-tile ghost AI with scatter/chase cycles, frightened combos,
// levels, lives, and per-run achievement flags. Rendering lives in
// render.ts; React shell in MunchMaze.tsx.

import {
  BERRY_TILE,
  COLS,
  GHOST_HOUSE_SPOTS,
  HOUSE_CENTER,
  HOUSE_EXIT,
  PLAYER_START,
  SCATTER_TARGETS,
  TILE,
  TUNNEL_ROW,
  buildSeeds,
  isOpen,
} from "./maze";

export type Dir = 0 | 1 | 2 | 3; // right, down, left, up
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;
const opposite = (d: Dir): Dir => (((d + 2) % 4) as Dir);

export type GameEvent =
  | { type: "sfx"; sound: "chomp" | "power" | "berry" | "death" | "clear" }
  | { type: "sfx-ghost"; combo: number }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, number> };

export type Phase = "ready" | "running" | "dying" | "clear" | "gameover";
export type GhostState = "house" | "exiting" | "active" | "frightened" | "respawn";

export interface Actor {
  px: number;
  py: number;
  dir: Dir;
}

export interface Ghost extends Actor {
  id: 0 | 1 | 2 | 3;
  state: GhostState;
  releaseAt: number;
  respawnAt: number;
}

const centerOf = (t: number) => t * TILE + TILE / 2;
const tileOf = (p: number) => Math.floor(p / TILE);

const PLAYER_SPEED = 6.0 * TILE;
const FRIGHT_SPEED = 3.4 * TILE;
const TUNNEL_SPEED = 2.9 * TILE;
const EXIT_SPEED = 3.5 * TILE;
const RELEASE_TIMES = [0, 2.5, 5.5, 8.5];
const BERRY_AT = [60, 120];
const BERRY_SECONDS = 9;

export class Engine {
  phase: Phase = "ready";
  phaseT = 0; // seconds spent in current phase
  time = 0; // running game time (excludes ready/pause)

  level = 1;
  score = 0;
  lives = 3;

  seeds = buildSeeds().seeds;
  powers = buildSeeds().powers;
  seedsEatenLevel = 0;

  player: Actor = { px: 0, py: 0, dir: 0 };
  queuedDir: Dir | null = null;
  moving = false;
  mouthT = 0;

  ghosts: Ghost[] = [];
  frightT = 0; // remaining frightened seconds
  frightCombo = 0;
  modeT = 0; // scatter/chase clock

  berryActiveT = 0;
  berrySpawned = 0;
  berriesEaten = 0;

  // per-run stats + achievement flags
  ghostsEatenRun = 0;
  deathsThisLevel = 0;
  private unlocked = new Set<string>();

  events: GameEvent[] = [];

  constructor() {
    this.resetPositions();
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  /** Drain queued events (called once per frame by the component). */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private achieve(slug: string) {
    if (this.unlocked.has(slug)) return;
    this.unlocked.add(slug);
    this.emit({ type: "achievement", slug });
  }

  private ghostBaseSpeed() {
    return Math.min(6.3, 5.1 + 0.25 * (this.level - 1)) * TILE;
  }

  private frightSeconds() {
    return Math.max(2, 7.5 - (this.level - 1));
  }

  private resetPositions() {
    this.player = {
      px: centerOf(PLAYER_START.x),
      py: centerOf(PLAYER_START.y),
      dir: 2,
    };
    this.queuedDir = null;
    this.ghosts = GHOST_HOUSE_SPOTS.map((spot, i) => ({
      id: i as Ghost["id"],
      px: centerOf(spot.x),
      py: centerOf(spot.y),
      dir: i === 0 ? 2 : 3,
      state: i === 0 ? "active" : "house",
      releaseAt: this.time + RELEASE_TIMES[i],
      respawnAt: 0,
    }));
    this.frightT = 0;
    this.frightCombo = 0;
    this.berryActiveT = 0;
  }

  private startLevel(next: boolean) {
    if (next) {
      this.level += 1;
      const fresh = buildSeeds();
      this.seeds = fresh.seeds;
      this.powers = fresh.powers;
      this.seedsEatenLevel = 0;
      this.berrySpawned = 0;
      this.deathsThisLevel = 0;
    }
    this.modeT = 0;
    this.resetPositions();
    this.phase = "ready";
    this.phaseT = 0;
  }

  setDirection(dir: Dir) {
    this.queuedDir = dir;
  }

  /** scatter for 7s, chase for 20s, repeat (frightened pauses the clock) */
  private isScatter() {
    return this.modeT % 27 < 7;
  }

  update(dt: number) {
    dt = Math.min(dt, 0.04);
    this.phaseT += dt;

    switch (this.phase) {
      case "ready":
        if (this.phaseT >= 2) {
          this.phase = "running";
          this.phaseT = 0;
        }
        return;
      case "dying":
        if (this.phaseT >= 1.6) {
          if (this.lives > 0) {
            this.resetPositions();
            this.phase = "ready";
          } else {
            this.phase = "gameover";
            this.emit({
              type: "gameover",
              score: this.score,
              stats: {
                mazes: this.level,
                ghosts_eaten: this.ghostsEatenRun,
                berries: this.berriesEaten,
              },
            });
          }
          this.phaseT = 0;
        }
        return;
      case "clear":
        if (this.phaseT >= 1.8) this.startLevel(true);
        return;
      case "gameover":
        return;
    }

    // ---- running ----
    this.time += dt;
    if (this.frightT > 0) {
      this.frightT = Math.max(0, this.frightT - dt);
    } else {
      this.modeT += dt;
    }
    if (this.berryActiveT > 0) this.berryActiveT = Math.max(0, this.berryActiveT - dt);

    this.updatePlayer(dt);
    this.updateGhosts(dt);
    this.checkCollisions();
  }

  // ---------- player ----------

  private updatePlayer(dt: number) {
    const p = this.player;

    // Instant reversal anywhere
    if (this.queuedDir !== null && this.queuedDir === opposite(p.dir)) {
      p.dir = this.queuedDir;
      this.queuedDir = null;
    }

    const before = { x: p.px, y: p.py };
    this.stepActor(p, PLAYER_SPEED * dt, () => {
      const tx = tileOf(p.px), ty = tileOf(p.py);
      if (this.queuedDir !== null && isOpen(tx + DX[this.queuedDir], ty + DY[this.queuedDir])) {
        p.dir = this.queuedDir;
        this.queuedDir = null;
        return true;
      }
      return isOpen(tx + DX[p.dir], ty + DY[p.dir]);
    });
    this.moving = p.px !== before.x || p.py !== before.y;
    if (this.moving) this.mouthT += dt;

    // Eat what's under us
    const idx = tileOf(p.py) * COLS + tileOf(p.px);
    if (this.seeds.delete(idx)) {
      this.addScore(10);
      this.seedsEatenLevel += 1;
      if (this.seedsEatenLevel % 2 === 1) this.emit({ type: "sfx", sound: "chomp" });
      this.maybeSpawnBerry();
      this.checkLevelClear();
    } else if (this.powers.delete(idx)) {
      this.addScore(50);
      this.seedsEatenLevel += 1;
      this.frightT = this.frightSeconds();
      this.frightCombo = 0;
      for (const g of this.ghosts) {
        if (g.state === "active") {
          g.state = "frightened";
          g.dir = opposite(g.dir);
        } else if (g.state === "frightened") {
          g.dir = opposite(g.dir);
        }
      }
      this.emit({ type: "sfx", sound: "power" });
      this.checkLevelClear();
    }

    // Berry pickup
    if (
      this.berryActiveT > 0 &&
      tileOf(p.px) === BERRY_TILE.x &&
      tileOf(p.py) === BERRY_TILE.y
    ) {
      this.berryActiveT = 0;
      this.berriesEaten += 1;
      this.addScore(300 + 100 * Math.min(this.level - 1, 7));
      this.emit({ type: "sfx", sound: "berry" });
    }
  }

  private maybeSpawnBerry() {
    if (
      this.berrySpawned < BERRY_AT.length &&
      this.seedsEatenLevel >= BERRY_AT[this.berrySpawned]
    ) {
      this.berrySpawned += 1;
      this.berryActiveT = BERRY_SECONDS;
    }
  }

  private checkLevelClear() {
    if (this.seeds.size + this.powers.size > 0) return;
    this.phase = "clear";
    this.phaseT = 0;
    this.emit({ type: "sfx", sound: "clear" });
    if (this.level === 1) this.achieve("first-maze");
    if (this.deathsThisLevel === 0) this.achieve("untouchable");
    if (this.level + 1 >= 4) this.achieve("deep-runner");
  }

  private addScore(n: number) {
    this.score += n;
    if (this.score >= 10000) this.achieve("seed-baron");
    if (this.score >= 30000) this.achieve("maze-legend");
  }

  // ---------- ghosts ----------

  private updateGhosts(dt: number) {
    for (const g of this.ghosts) {
      switch (g.state) {
        case "house": {
          // gentle bob while waiting
          g.py = centerOf(HOUSE_CENTER.y) + Math.sin(this.time * 4 + g.id) * 3;
          if (this.time >= g.releaseAt) {
            g.state = "exiting";
            g.py = centerOf(HOUSE_CENTER.y);
          }
          break;
        }
        case "exiting": {
          const cx = centerOf(HOUSE_EXIT.x);
          if (Math.abs(g.px - cx) > 1) {
            g.px += Math.sign(cx - g.px) * Math.min(EXIT_SPEED * dt, Math.abs(g.px - cx));
          } else {
            g.px = cx;
            const targetY = centerOf(HOUSE_EXIT.y);
            g.py -= Math.min(EXIT_SPEED * dt, g.py - targetY);
            if (g.py <= targetY + 0.5) {
              g.py = targetY;
              g.state = this.frightT > 0 ? "frightened" : "active";
              g.dir = g.px < this.player.px ? 0 : 2;
            }
          }
          break;
        }
        case "respawn": {
          if (this.time >= g.respawnAt) {
            g.px = centerOf(HOUSE_CENTER.x);
            g.py = centerOf(HOUSE_CENTER.y);
            g.state = "exiting";
          }
          break;
        }
        case "active":
        case "frightened": {
          const inTunnel = tileOf(g.py) === TUNNEL_ROW && (tileOf(g.px) <= 2 || tileOf(g.px) >= COLS - 3);
          const speed =
            g.state === "frightened" ? FRIGHT_SPEED : inTunnel ? TUNNEL_SPEED : this.ghostBaseSpeed();
          this.stepActor(g, speed * dt, () => {
            this.decideGhostDir(g);
            return true; // ghosts always have a way out (no dead ends)
          });
          if (g.state === "frightened" && this.frightT <= 0) g.state = "active";
          break;
        }
      }
    }
  }

  private decideGhostDir(g: Ghost) {
    const tx = tileOf(g.px), ty = tileOf(g.py);
    const options: Dir[] = [];
    for (const d of [3, 2, 1, 0] as Dir[]) {
      if (d === opposite(g.dir)) continue;
      if (isOpen(tx + DX[d], ty + DY[d])) options.push(d);
    }
    if (options.length === 0) {
      g.dir = opposite(g.dir);
      return;
    }
    if (g.state === "frightened") {
      g.dir = options[Math.floor(Math.random() * options.length)];
      return;
    }

    const target = this.ghostTarget(g);
    let best = options[0];
    let bestDist = Infinity;
    for (const d of options) {
      const nx = tx + DX[d], ny = ty + DY[d];
      const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    g.dir = best;
  }

  private ghostTarget(g: Ghost): { x: number; y: number } {
    if (this.isScatter()) return SCATTER_TARGETS[g.id];
    const px = tileOf(this.player.px), py = tileOf(this.player.py);
    const pd = this.player.dir;
    switch (g.id) {
      case 0: // Rusty — straight chase
        return { x: px, y: py };
      case 1: // Sprig — ambush 4 tiles ahead
        return { x: px + DX[pd] * 4, y: py + DY[pd] * 4 };
      case 2: {
        // Marigold — mirrors Rusty through a point 2 ahead of the player
        const rusty = this.ghosts[0];
        const ax = px + DX[pd] * 2, ay = py + DY[pd] * 2;
        return { x: ax * 2 - tileOf(rusty.px), y: ay * 2 - tileOf(rusty.py) };
      }
      case 3: {
        // Bramble — shy: chases from afar, retreats when close
        const gx = tileOf(g.px), gy = tileOf(g.py);
        const far = (gx - px) ** 2 + (gy - py) ** 2 > 64;
        return far ? { x: px, y: py } : SCATTER_TARGETS[3];
      }
    }
  }

  // ---------- movement core ----------

  /**
   * Advance an actor along its dir, snapping through tile centers.
   * `decide` runs at each center; returns false if movement should stop
   * (blocked). Handles the tunnel wrap.
   */
  private stepActor(a: Actor, dist: number, decide: () => boolean) {
    let guard = 0;
    while (dist > 1e-4 && guard++ < 4) {
      const tx = tileOf(a.px), ty = tileOf(a.py);
      const cx = centerOf(tx), cy = centerOf(ty);
      const along = a.dir === 0 ? cx - a.px : a.dir === 2 ? a.px - cx : a.dir === 1 ? cy - a.py : a.py - cy;

      if (along > 1e-4) {
        // approaching this tile's center
        const step = Math.min(dist, along);
        a.px += DX[a.dir] * step;
        a.py += DY[a.dir] * step;
        dist -= step;
        if (dist <= 1e-4) break;
        // at center: snap + decide
        a.px = cx;
        a.py = cy;
        if (!decide()) return;
      } else {
        // at or past center: decide, then move toward the next tile
        if (Math.abs(along) < 1e-4 && !decide()) return;
        const nx = tx + DX[a.dir], ny = ty + DY[a.dir];
        const nextCenter = a.dir % 2 === 0 ? centerOf(nx) : centerOf(ny);
        const cur = a.dir % 2 === 0 ? a.px : a.py;
        const toNext = Math.abs(nextCenter - cur);
        const step = Math.min(dist, toNext);
        a.px += DX[a.dir] * step;
        a.py += DY[a.dir] * step;
        dist -= step;
        // tunnel wrap
        if (a.px < 0) a.px += COLS * TILE;
        if (a.px >= COLS * TILE) a.px -= COLS * TILE;
      }
    }
  }

  // ---------- collisions ----------

  private checkCollisions() {
    const p = this.player;
    for (const g of this.ghosts) {
      if (g.state !== "active" && g.state !== "frightened") continue;
      if (Math.abs(g.px - p.px) < 13 && Math.abs(g.py - p.py) < 13) {
        if (g.state === "frightened") {
          this.frightCombo += 1;
          this.ghostsEatenRun += 1;
          this.addScore(200 * 2 ** (this.frightCombo - 1));
          g.state = "respawn";
          g.respawnAt = this.time + 3;
          this.emit({ type: "sfx-ghost", combo: this.frightCombo });
          if (this.frightCombo === 4) this.achieve("full-course");
          if (this.ghostsEatenRun >= 8) this.achieve("ghost-hunter");
        } else {
          this.lives -= 1;
          this.deathsThisLevel += 1;
          this.phase = "dying";
          this.phaseT = 0;
          this.emit({ type: "sfx", sound: "death" });
          return;
        }
      }
    }
  }
}
