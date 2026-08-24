// Brickstorm engine. Matter.js drives ball motion and contacts; every rule
// above that (damage, chains, powerups, boards, scoring) is plain state.
// DOM-free and seeded, so the node harness runs the exact same simulation.

import Matter from "matter-js";
import { BOARDS, brickSlots, type BoardDef } from "./levels.ts";

export const W = 960;
export const H = 540;

/** Ink playfield rect. All gameplay lives inside it. */
export const FIELD = { x0: 190, x1: 770, y0: 90, y1: 500 };

export const TUNE = {
  seed: 0x5b91c3, // default PRNG seed; the harness may pass its own

  substepMs: 1000 / 120, // physics substep length, ms
  maxSubsteps: 6, // per update() call, so a long stall cannot spiral
  maxDt: 0.05, // s; dt clamp before accumulation

  gridX: 192, // px, left edge of column 0
  gridY: 126, // px, top edge of row 0
  cellW: 72, // px
  cellH: 36, // px
  brickW: 66, // px, physics body
  brickH: 24, // px, physics body

  paddleW: 116, // px
  paddleExpandedW: 156, // px
  paddleH: 16, // px
  paddleY: 474, // px, body center
  paddleKeySpeed: 620, // px/s, keyboard glide
  paddlePointerSpeed: 1400, // px/s, pointer snap cap; never teleports past a ball

  ballRadius: 12, // px
  ballBaseSpeed: 430, // px/s
  ballSpeedPerBrick: 12, // px/s added per brick destroyed this run
  ballMaxSpeed: 620, // px/s
  slowFactor: 0.7, // speed multiplier while slow is active
  minVyRatio: 0.22, // of speed; kills horizontal stalemates
  launchAngleDeg: 80, // from horizontal, off the paddle at serve
  paddleDeflectDeg: 62, // max deflection from vertical at the paddle edge
  minDeflect: 0.12, // fraction of the clamp; a dead-center return would loop forever
  paddleHitCooldown: 0.05, // s; one contact must not score twice

  floorY: 512, // px; a ball center past this is lost
  wallThickness: 40, // px, static rects outside the playfield

  lives: 3,
  maxLives: 5,
  maxBalls: 6,

  dropChance: 0.22, // per destroyed brick
  dropSpeed: 150, // px/s
  dropCatchPadX: 15, // px added to the paddle half width for the catch box
  dropCatchPadY: 15, // px added to the paddle half height for the catch box

  expandSeconds: 10,
  slowSeconds: 8,
  fireSeconds: 8,
  stickySeconds: 8,
  multiSeconds: 12,
  splitCount: 2, // extra balls per split drop
  splitAngleDeg: 25, // fan either side of the source ball
  lifeCappedPoints: 200, // when a life drop lands at max lives

  fireDamage: 2, // brick hp removed by a fire-ball hit
  brickPointsPerHp: 40, // destroy points are this times maxHp
  chainStep: 10, // added per chain link past the first
  multiFactor: 2, // score multiplier while multi is active

  boardClearBonus: 500,
  untouchedBonus: 300,
  victoryBonus: 1500,
  boardClearHold: 2.2, // s of banner between boards

  scoreCap: 50000,
  legendScore: 12000,
  // Measured ceiling: a single ball breaks at most 3 bricks per paddle trip,
  // so this threshold is a multiball reward, not a solo-play one.
  chainAchieveAt: 4,
  tripleBallAt: 3,

  streakSpeed: 520, // px/s above which the ball draws its speed frame
  trailRatio: 0.84, // of ballMaxSpeed; leaves a trail puff above this

  fxTtl: 0.42, // s, generic effect lifetime
  crackFlash: 0.07, // s of crack overlay after a brick takes damage
  paddleFlash: 0.09, // s of paddle hit state after a ball contact
  paddleMoveVx: 40, // px/s above which the paddle shows its compress frame
  trailEvery: 0.06, // s between ball trail puffs
} as const;

export type Phase = "serve" | "running" | "board-clear" | "gameover" | "victory";

export type PowerId =
  | "expand"
  | "split"
  | "slow"
  | "fire"
  | "shield"
  | "sticky"
  | "life"
  | "multi";

export const POWER_IDS: PowerId[] = [
  "expand",
  "split",
  "slow",
  "fire",
  "shield",
  "sticky",
  "life",
  "multi",
];

export type SfxName =
  | "launch"
  | "paddle"
  | "wall"
  | "brickHit"
  | "brickBreak"
  | "powerup"
  | "life"
  | "loss"
  | "clear"
  | "victory";

export type FxKind =
  | "impact"
  | "spark"
  | "clear"
  | "debris"
  | "ember"
  | "trail"
  | "dust"
  | "groundBurst"
  | "dustBurst";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, number> };

export interface Brick {
  id: number;
  col: number;
  row: number;
  material: number;
  hp: number;
  maxHp: number;
  body: Matter.Body;
  flashUntil: number;
}

export interface Ball {
  body: Matter.Body;
  /** px offset from the paddle center while held, null while free */
  stuckOffset: number | null;
  /** px travelled, drives the rolling highlight frame */
  spin: number;
  lastPaddle: number;
  lastTrail: number;
}

export interface Drop {
  power: PowerId;
  x: number;
  y: number;
}

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  born: number;
  material?: number;
}

const DEG = Math.PI / 180;

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

export const brickCenter = (col: number, row: number) => ({
  x: TUNE.gridX + col * TUNE.cellW + TUNE.cellW / 2,
  y: TUNE.gridY + row * TUNE.cellH + TUNE.cellH / 2,
});

/** Matter stores velocity as px per 1000/60 ms regardless of the substep. */
const toMatterSpeed = (pxPerSecond: number) => pxPerSecond / 60;

export class Engine {
  phase: Phase = "serve";
  time = 0;
  score = 0;
  lives: number = TUNE.lives;
  boardIndex = 0;
  board: BoardDef = BOARDS[0];

  bricks: Brick[] = [];
  balls: Ball[] = [];
  drops: Drop[] = [];
  fx: Fx[] = [];

  paddle = { x: (FIELD.x0 + FIELD.x1) / 2, halfW: TUNE.paddleW / 2, vx: 0 };

  expandUntil = 0;
  slowUntil = 0;
  fireUntil = 0;
  multiUntil = 0;
  stickyUntil = 0;
  shield = false;
  paddleFlashUntil = 0;

  chain = 0;
  maxChain = 0;
  bricksBroken = 0;
  boardsCleared = 0;
  powerupsCaught = 0;
  livesLost = 0;
  /** safety-net trips; a healthy simulation never increments this */
  containStops = 0;

  input = { dir: 0, pointerX: null as number | null, launch: false };

  private mEngine: Matter.Engine;
  private paddleBody: Matter.Body;
  private paddleBodyW: number = TUNE.paddleW;
  private wallIds = new Set<number>();
  private brickByBody = new Map<number, Brick>();
  private ballByBody = new Map<number, Ball>();
  private contacts: Array<[Matter.Body, Matter.Body]> = [];
  private doomed: Matter.Body[] = [];

  private rand: () => number;
  private dropBag: PowerId[] = [];
  private nextBrickId = 1;
  private accumulator = 0;
  private clearTimer = 0;
  private lostOnBoard = false;
  private lastDir = 1;
  private prevLaunch = false;
  private gameoverSent = false;
  private events: GameEvent[] = [];
  private achieved = new Set<string>();

  constructor(seed: number = TUNE.seed) {
    this.rand = mulberry32(seed);
    this.mEngine = Matter.Engine.create();
    this.mEngine.gravity.x = 0;
    this.mEngine.gravity.y = 0;

    const midY = (FIELD.y0 + FIELD.y1) / 2;
    const fieldH = FIELD.y1 - FIELD.y0;
    const t = TUNE.wallThickness;
    const walls = [
      Matter.Bodies.rectangle(FIELD.x0 - t / 2, midY, t, fieldH * 2, { isStatic: true, label: "wall" }),
      Matter.Bodies.rectangle(FIELD.x1 + t / 2, midY, t, fieldH * 2, { isStatic: true, label: "wall" }),
      Matter.Bodies.rectangle(
        (FIELD.x0 + FIELD.x1) / 2,
        FIELD.y0 - t / 2,
        FIELD.x1 - FIELD.x0 + t * 2,
        t,
        { isStatic: true, label: "wall" },
      ),
    ];
    for (const w of walls) this.wallIds.add(w.id);

    this.paddleBody = Matter.Bodies.rectangle(
      this.paddle.x,
      TUNE.paddleY,
      TUNE.paddleW,
      TUNE.paddleH,
      { isStatic: true, label: "paddle", restitution: 1, friction: 0 },
    );

    Matter.Composite.add(this.mEngine.world, [...walls, this.paddleBody]);
    Matter.Events.on(this.mEngine, "collisionStart", (evt) => {
      for (const pair of evt.pairs) this.contacts.push([pair.bodyA, pair.bodyB]);
    });

    this.buildBoard(0);
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

  private addScore(points: number) {
    this.score = Math.min(TUNE.scoreCap, this.score + points);
    if (this.score >= TUNE.legendScore) this.achieve("storm-legend");
  }

  private addFx(kind: FxKind, x: number, y: number, material?: number) {
    this.fx.push({ kind, x, y, born: this.time, material });
  }

  // ---- Board setup ------------------------------------------------------

  private buildBoard(index: number) {
    for (const b of this.bricks) Matter.Composite.remove(this.mEngine.world, b.body);
    this.bricks = [];
    this.brickByBody.clear();
    this.boardIndex = index;
    this.board = BOARDS[index];
    this.lostOnBoard = false;

    for (const slot of brickSlots(this.board)) {
      const c = brickCenter(slot.col, slot.row);
      const body = Matter.Bodies.rectangle(c.x, c.y, TUNE.brickW, TUNE.brickH, {
        isStatic: true,
        label: "brick",
        restitution: 1,
        friction: 0,
      });
      const brick: Brick = {
        id: this.nextBrickId++,
        col: slot.col,
        row: slot.row,
        material: slot.material,
        hp: slot.hp,
        maxHp: slot.hp,
        body,
        flashUntil: 0,
      };
      this.bricks.push(brick);
      this.brickByBody.set(body.id, brick);
      Matter.Composite.add(this.mEngine.world, body);
    }
    this.serve();
  }

  private serve() {
    for (const b of this.balls) Matter.Composite.remove(this.mEngine.world, b.body);
    this.balls = [];
    this.ballByBody.clear();
    this.drops = [];
    this.chain = 0;
    this.expandUntil = 0;
    this.slowUntil = 0;
    this.fireUntil = 0;
    this.multiUntil = 0;
    this.stickyUntil = 0;
    this.shield = false;
    this.paddle.halfW = TUNE.paddleW / 2;
    this.paddle.vx = 0;
    this.syncPaddleWidth();
    this.setPaddleBody();
    this.spawnBall(this.paddle.x, TUNE.paddleY - TUNE.paddleH / 2 - TUNE.ballRadius, 0);
    this.phase = "serve";
  }

  private spawnBall(x: number, y: number, stuckOffset: number | null): Ball {
    const body = Matter.Bodies.circle(x, y, TUNE.ballRadius, {
      label: "ball",
      restitution: 1,
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      inertia: Infinity,
      // Negative group: multiballs pass through each other, everything else
      // (group 0) still collides normally.
      collisionFilter: { group: -1, category: 1, mask: 0xffffffff },
    });
    const ball: Ball = { body, stuckOffset, spin: 0, lastPaddle: -1, lastTrail: 0 };
    this.balls.push(ball);
    this.ballByBody.set(body.id, ball);
    Matter.Composite.add(this.mEngine.world, body);
    return ball;
  }

  private setPaddleBody() {
    Matter.Body.setPosition(this.paddleBody, { x: this.paddle.x, y: TUNE.paddleY });
  }

  /** Keeps the collision body as wide as the paddle the player sees. */
  private syncPaddleWidth() {
    const want = this.paddle.halfW * 2;
    if (want === this.paddleBodyW) return;
    Matter.Body.scale(this.paddleBody, want / this.paddleBodyW, 1);
    this.paddleBodyW = want;
  }

  // ---- Speeds -----------------------------------------------------------

  ballSpeed(): number {
    const grown = Math.min(
      TUNE.ballMaxSpeed,
      TUNE.ballBaseSpeed + this.bricksBroken * TUNE.ballSpeedPerBrick,
    );
    return this.time < this.slowUntil ? grown * TUNE.slowFactor : grown;
  }

  // ---- Update -----------------------------------------------------------

  update(dt: number) {
    const step = Math.min(TUNE.maxDt, dt);
    this.time += step;
    this.fx = this.fx.filter((f) => this.time - f.born < TUNE.fxTtl);

    // Tracked every frame so a press held through a banner still needs a
    // fresh release before it launches the next ball.
    const launchPressed = this.input.launch && !this.prevLaunch;
    this.prevLaunch = this.input.launch;

    if (this.phase === "gameover" || this.phase === "victory") return;

    if (this.phase === "board-clear") {
      this.clearTimer -= step;
      if (this.clearTimer <= 0) this.advanceBoard();
      return;
    }

    if (launchPressed) this.launchHeldBalls();

    this.accumulator += step;
    const sub = TUNE.substepMs / 1000;
    let taken = 0;
    while (this.accumulator >= sub && taken < TUNE.maxSubsteps) {
      this.accumulator -= sub;
      taken++;
      this.substep(sub);
      if (this.phase !== "serve" && this.phase !== "running") return;
    }
    if (taken === TUNE.maxSubsteps) this.accumulator = 0;

    this.updateDrops(step);
    this.expireTimers();
  }

  private substep(sub: number) {
    this.movePaddle(sub);
    this.holdStuckBalls();

    this.contacts.length = 0;
    Matter.Engine.update(this.mEngine, TUNE.substepMs);
    this.resolveContacts();
    this.flushDoomed();
    this.normalizeBalls(sub);
    this.dropLostBalls();
    if (this.phase === "serve" || this.phase === "running") this.checkBoardClear();
  }

  private movePaddle(sub: number) {
    const limitLo = FIELD.x0 + this.paddle.halfW;
    const limitHi = FIELD.x1 - this.paddle.halfW;
    const before = this.paddle.x;
    let x = this.paddle.x;

    if (this.input.dir !== 0) {
      x += this.input.dir * TUNE.paddleKeySpeed * sub;
      this.lastDir = this.input.dir > 0 ? 1 : -1;
    } else if (this.input.pointerX !== null) {
      const target = Math.max(limitLo, Math.min(limitHi, this.input.pointerX));
      const maxStep = TUNE.paddlePointerSpeed * sub;
      x += Math.max(-maxStep, Math.min(maxStep, target - x));
    }

    this.paddle.x = Math.max(limitLo, Math.min(limitHi, x));
    this.paddle.vx = (this.paddle.x - before) / sub;
    if (this.paddle.vx > 1) this.lastDir = 1;
    else if (this.paddle.vx < -1) this.lastDir = -1;
    this.setPaddleBody();
  }

  private holdStuckBalls() {
    const restY = TUNE.paddleY - TUNE.paddleH / 2 - TUNE.ballRadius;
    for (const ball of this.balls) {
      if (ball.stuckOffset === null) continue;
      const x = Math.max(
        FIELD.x0 + TUNE.ballRadius,
        Math.min(FIELD.x1 - TUNE.ballRadius, this.paddle.x + ball.stuckOffset),
      );
      Matter.Body.setPosition(ball.body, { x, y: restY });
      Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
    }
  }

  private launchHeldBalls() {
    let launched = false;
    const speed = toMatterSpeed(this.ballSpeed());
    for (const ball of this.balls) {
      if (ball.stuckOffset === null) continue;
      ball.stuckOffset = null;
      const angle = TUNE.launchAngleDeg * DEG;
      Matter.Body.setVelocity(ball.body, {
        x: Math.cos(angle) * speed * this.lastDir,
        y: -Math.sin(angle) * speed,
      });
      launched = true;
    }
    if (!launched) return;
    this.phase = "running";
    this.emit({ type: "sfx", sound: "launch" });
  }

  // ---- Contacts ---------------------------------------------------------

  private resolveContacts() {
    for (const [a, b] of this.contacts) {
      const ball = this.ballByBody.get(a.id) ?? this.ballByBody.get(b.id);
      if (!ball) continue;
      const other = this.ballByBody.has(a.id) ? b : a;
      if (other.label === "ball") continue;
      if (other.id === this.paddleBody.id) this.hitPaddle(ball);
      else if (this.wallIds.has(other.id)) this.hitWall(ball);
      else {
        const brick = this.brickByBody.get(other.id);
        if (brick && brick.hp > 0) this.hitBrick(ball, brick);
      }
    }
  }

  private hitPaddle(ball: Ball) {
    if (ball.stuckOffset !== null) return;
    if (this.time - ball.lastPaddle < TUNE.paddleHitCooldown) return;
    ball.lastPaddle = this.time;
    this.chain = 0;
    this.paddleFlashUntil = this.time + TUNE.paddleFlash;

    if (this.time < this.stickyUntil) {
      ball.stuckOffset = Math.max(
        -this.paddle.halfW,
        Math.min(this.paddle.halfW, ball.body.position.x - this.paddle.x),
      );
      Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
      this.emit({ type: "sfx", sound: "paddle" });
      return;
    }

    const raw = Math.max(
      -1,
      Math.min(1, (ball.body.position.x - this.paddle.x) / this.paddle.halfW),
    );
    const side = raw === 0 ? this.lastDir : Math.sign(raw);
    const offset = Math.abs(raw) < TUNE.minDeflect ? side * TUNE.minDeflect : raw;
    const theta = -Math.PI / 2 + offset * TUNE.paddleDeflectDeg * DEG;
    const speed = toMatterSpeed(this.ballSpeed());
    Matter.Body.setVelocity(ball.body, {
      x: Math.cos(theta) * speed,
      y: Math.sin(theta) * speed,
    });
    Matter.Body.setPosition(ball.body, {
      x: ball.body.position.x,
      y: Math.min(
        ball.body.position.y,
        TUNE.paddleY - TUNE.paddleH / 2 - TUNE.ballRadius,
      ),
    });
    this.addFx("dust", ball.body.position.x, TUNE.paddleY - TUNE.paddleH);
    this.emit({ type: "sfx", sound: "paddle" });
  }

  private hitWall(ball: Ball) {
    this.addFx("impact", ball.body.position.x, ball.body.position.y);
    this.emit({ type: "sfx", sound: "wall" });
  }

  private hitBrick(ball: Ball, brick: Brick) {
    const dmg = this.time < this.fireUntil ? TUNE.fireDamage : 1;
    brick.hp -= dmg;
    brick.flashUntil = this.time + TUNE.crackFlash;
    const c = brickCenter(brick.col, brick.row);

    if (brick.hp > 0) {
      this.addFx("spark", ball.body.position.x, ball.body.position.y);
      this.emit({ type: "sfx", sound: "brickHit" });
      return;
    }

    brick.hp = 0;
    this.doomed.push(brick.body);
    this.brickByBody.delete(brick.body.id);
    this.bricksBroken++;
    this.chain++;
    if (this.chain > this.maxChain) this.maxChain = this.chain;
    if (this.chain >= TUNE.chainAchieveAt) this.achieve("brick-chain");
    this.achieve("first-break");

    const base = TUNE.brickPointsPerHp * brick.maxHp + TUNE.chainStep * (this.chain - 1);
    this.addScore(this.time < this.multiUntil ? base * TUNE.multiFactor : base);

    this.addFx("clear", c.x, c.y);
    this.addFx("debris", c.x, c.y, brick.material);
    this.emit({ type: "sfx", sound: "brickBreak" });

    if (this.rand() < TUNE.dropChance) {
      this.drops.push({ power: this.drawPower(), x: c.x, y: c.y });
    }
  }

  private flushDoomed() {
    if (this.doomed.length === 0) return;
    for (const body of this.doomed) Matter.Composite.remove(this.mEngine.world, body);
    this.doomed.length = 0;
    this.bricks = this.bricks.filter((b) => b.hp > 0);
  }

  // ---- Ball hygiene -----------------------------------------------------

  private normalizeBalls(sub: number) {
    const target = toMatterSpeed(this.ballSpeed());
    const minVy = TUNE.minVyRatio * target;
    // Resting against a wall legitimately puts the center one radius inside
    // the face, so the net only trips once the ball is fully past it.
    const lo = FIELD.x0 - TUNE.ballRadius;
    const hi = FIELD.x1 + TUNE.ballRadius;
    const top = FIELD.y0 - TUNE.ballRadius;
    const restLo = FIELD.x0 + TUNE.ballRadius;
    const restHi = FIELD.x1 - TUNE.ballRadius;
    const restTop = FIELD.y0 + TUNE.ballRadius;

    for (const ball of this.balls) {
      if (ball.stuckOffset !== null) continue;
      const v = Matter.Body.getVelocity(ball.body);
      const mag = Math.hypot(v.x, v.y);
      let vx = mag > 0 ? (v.x / mag) * target : 0;
      let vy = mag > 0 ? (v.y / mag) * target : -target;
      if (Math.abs(vy) < minVy) {
        vy = (vy < 0 ? -1 : 1) * minVy;
        const rest = Math.sqrt(Math.max(0, target * target - vy * vy));
        vx = (vx < 0 ? -1 : 1) * rest;
      }

      // Safety net: a contact solved badly must never leak the ball out of
      // the ink panel. The harness asserts this never trips.
      const p = ball.body.position;
      let cx = p.x;
      let cy = p.y;
      if (p.x < lo) {
        cx = restLo;
        vx = Math.abs(vx);
        this.containStops++;
      } else if (p.x > hi) {
        cx = restHi;
        vx = -Math.abs(vx);
        this.containStops++;
      }
      if (p.y < top) {
        cy = restTop;
        vy = Math.abs(vy);
        this.containStops++;
      }
      if (cx !== p.x || cy !== p.y) Matter.Body.setPosition(ball.body, { x: cx, y: cy });

      Matter.Body.setVelocity(ball.body, { x: vx, y: vy });
      ball.spin += Math.hypot(vx, vy) * 60 * sub;

      if (this.time < this.fireUntil && this.time - ball.lastTrail > TUNE.trailEvery) {
        ball.lastTrail = this.time;
        this.addFx("ember", p.x, p.y);
      } else if (
        Math.hypot(vx, vy) * 60 >= TUNE.ballMaxSpeed * TUNE.trailRatio &&
        this.time - ball.lastTrail > TUNE.trailEvery
      ) {
        ball.lastTrail = this.time;
        this.addFx("trail", p.x, p.y);
      }
    }
  }

  private dropLostBalls() {
    const survivors: Ball[] = [];
    const lost: Ball[] = [];
    for (const ball of this.balls) {
      if (ball.body.position.y <= TUNE.floorY) survivors.push(ball);
      else lost.push(ball);
    }
    if (lost.length === 0) return;

    // The shield saves the whole loss once: it only fires when the drain
    // would otherwise empty the field.
    if (survivors.length === 0 && this.shield) {
      this.shield = false;
      const saved = lost.shift()!;
      const v = Matter.Body.getVelocity(saved.body);
      Matter.Body.setPosition(saved.body, {
        x: saved.body.position.x,
        y: TUNE.floorY - TUNE.ballRadius * 2,
      });
      Matter.Body.setVelocity(saved.body, { x: v.x, y: -Math.abs(v.y) });
      this.addFx("dustBurst", saved.body.position.x, TUNE.floorY);
      this.emit({ type: "sfx", sound: "powerup" });
      survivors.push(saved);
    }

    for (const ball of lost) {
      this.ballByBody.delete(ball.body.id);
      Matter.Composite.remove(this.mEngine.world, ball.body);
    }
    this.balls = survivors;
    if (this.balls.length === 0) this.loseLife();
  }

  private loseLife() {
    this.lives--;
    this.livesLost++;
    this.lostOnBoard = true;
    this.addFx("groundBurst", this.paddle.x, TUNE.paddleY);
    this.emit({ type: "sfx", sound: "loss" });
    if (this.lives <= 0) {
      this.phase = "gameover";
      this.sendGameover();
      return;
    }
    this.serve();
  }

  // ---- Drops and powers -------------------------------------------------

  private drawPower(): PowerId {
    if (this.dropBag.length === 0) {
      const bag = [...POWER_IDS];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        const tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      this.dropBag = bag;
    }
    return this.dropBag.pop()!;
  }

  private updateDrops(dt: number) {
    if (this.drops.length === 0) return;
    const catchHalfW = this.paddle.halfW + TUNE.dropCatchPadX;
    const catchHalfH = TUNE.paddleH / 2 + TUNE.dropCatchPadY;
    const kept: Drop[] = [];
    for (const drop of this.drops) {
      drop.y += TUNE.dropSpeed * dt;
      if (
        Math.abs(drop.x - this.paddle.x) < catchHalfW &&
        Math.abs(drop.y - TUNE.paddleY) < catchHalfH
      ) {
        this.powerupsCaught++;
        this.applyPower(drop.power);
        this.addFx("dust", drop.x, drop.y);
        continue;
      }
      if (drop.y > TUNE.floorY) continue;
      kept.push(drop);
    }
    this.drops = kept;
  }

  private applyPower(power: PowerId) {
    this.emit({ type: "sfx", sound: power === "life" ? "life" : "powerup" });
    switch (power) {
      case "expand":
        this.expandUntil = this.time + TUNE.expandSeconds;
        this.paddle.halfW = TUNE.paddleExpandedW / 2;
        this.syncPaddleWidth();
        break;
      case "split":
        this.splitBalls();
        break;
      case "slow":
        this.slowUntil = this.time + TUNE.slowSeconds;
        break;
      case "fire":
        this.fireUntil = this.time + TUNE.fireSeconds;
        break;
      case "shield":
        this.shield = true;
        break;
      case "sticky":
        this.stickyUntil = this.time + TUNE.stickySeconds;
        break;
      case "life":
        if (this.lives < TUNE.maxLives) this.lives++;
        else this.addScore(TUNE.lifeCappedPoints);
        break;
      case "multi":
        this.multiUntil = this.time + TUNE.multiSeconds;
        break;
    }
  }

  private splitBalls() {
    const source = this.balls.find((b) => b.stuckOffset === null) ?? this.balls[0];
    if (!source) return;
    const v = Matter.Body.getVelocity(source.body);
    const speed = toMatterSpeed(this.ballSpeed());
    const base = Math.atan2(v.y, v.x) || -Math.PI / 2;
    for (let i = 0; i < TUNE.splitCount; i++) {
      if (this.balls.length >= TUNE.maxBalls) break;
      const sign = i % 2 === 0 ? 1 : -1;
      const theta = base + sign * TUNE.splitAngleDeg * DEG * (Math.floor(i / 2) + 1);
      const clone = this.spawnBall(source.body.position.x, source.body.position.y, null);
      Matter.Body.setVelocity(clone.body, {
        x: Math.cos(theta) * speed,
        y: Math.sin(theta) * speed,
      });
    }
    if (this.balls.length >= TUNE.tripleBallAt) this.achieve("triple-ball");
  }

  private expireTimers() {
    if (this.paddle.halfW !== TUNE.paddleW / 2 && this.time >= this.expandUntil) {
      this.paddle.halfW = TUNE.paddleW / 2;
      this.syncPaddleWidth();
    }
  }

  // ---- Board flow -------------------------------------------------------

  private checkBoardClear() {
    if (this.bricks.length > 0) return;
    this.phase = "board-clear";
    this.clearTimer = TUNE.boardClearHold;
    this.boardsCleared++;
    this.addScore(TUNE.boardClearBonus);
    if (!this.lostOnBoard) {
      this.addScore(TUNE.untouchedBonus);
      this.achieve("untouched-board");
    }
    if (this.boardIndex === 0) this.achieve("workshop-clear");
    if (this.boardIndex === BOARDS.length - 1) this.achieve("kiln-master");
    this.emit({ type: "sfx", sound: "clear" });
  }

  private advanceBoard() {
    if (this.boardIndex >= BOARDS.length - 1) {
      this.phase = "victory";
      this.addScore(TUNE.victoryBonus);
      this.emit({ type: "sfx", sound: "victory" });
      this.sendGameover();
      return;
    }
    this.buildBoard(this.boardIndex + 1);
  }

  private sendGameover() {
    if (this.gameoverSent) return;
    this.gameoverSent = true;
    this.emit({
      type: "gameover",
      score: this.score,
      stats: {
        boards_cleared: this.boardsCleared,
        bricks_broken: this.bricksBroken,
        powerups_caught: this.powerupsCaught,
        max_chain: this.maxChain,
      },
    });
  }
}
