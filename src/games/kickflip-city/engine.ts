// Kickflip City engine. Matter.js integrates the skater box against the lane,
// the ramps and the grindable bars; every rule above that (pushing, tricks,
// grind balance, the open line, banking, bails, the district clock) is plain
// state. DOM-free and seeded, so the node harness runs the same simulation the
// browser does.

import Matter from "matter-js";
import {
  DISTRICTS,
  GROUND_Y,
  buildCourse,
  grindBox,
  obstacleBox,
  slopeAt,
  surfaceYAt,
  type Course,
  type Grindable,
} from "./course.ts";

export const W = 960;
export const H = 540;

export const TUNE = {
  seed: 0x4b1cf7, // default PRNG seed; the harness may pass its own

  substepMs: 1000 / 120, // physics substep length, ms
  maxSubsteps: 6, // per update() call, so a long stall cannot spiral
  maxDt: 0.05, // s; dt clamp before accumulation

  gravity: 1500, // px/s^2; Matter's own gravity is off and this is applied here
  fallCap: 1400, // px/s terminal fall speed
  laneSlab: 140, // px of static depth under every lane segment

  bodyW: 26, // px, skater physics box
  bodyH: 54, // px
  drawH: 80, // px, drawn skater height; board contact sits at the body bottom

  pushSpeed: 340, // px/s, top rolling speed
  pushAccel: 320, // px/s^2 while Right is held
  brakeAccel: 560, // px/s^2 while Left is held
  airControl: 0.25, // fraction of pushAccel available while airborne
  rollDrag: 46, // px/s^2 of passive rolling friction
  respawnSpeed: 120, // px/s the skater rolls at after a bail
  bailSpeed: 40, // px/s; under this an obstacle contact stops the skater instead
  stumbleSpeed: 155, // px/s; under this a hazard contact stumbles, no wreck
  hazardRearmPx: 70, // px moved from the last stumble or respawn before hazards re-arm
  sameHazardPx: 140, // px around the last wreck where a repeat contact only stumbles

  ollieVel: 575, // px/s up; a 110 px rise at this gravity
  crouchFull: 0.4, // s of crouch that reaches the full preload
  crouchBoost: 0.162, // velocity gain at full preload; 1.162^2 is 1.35x the height
  coyote: 0.08, // s of late-jump grace after the surface drops away
  // Upward speed a support contact still counts as grounded. The steepest ramp
  // pushes the skater up at about 130 px/s, an ollie leaves at 575, so this
  // separates climbing a ramp from leaving the ground.
  groundedVyCap: 200, // px/s

  flipTime: 0.5, // s for a kickflip or a heelflip to complete
  flipSpinRate: 420, // deg/s of presentation roll while a flip spins
  // The sheet authors one ollie pose per facing, so a flip is presented as a
  // bounded tilt driven by the spin phase rather than a full sprite rotation,
  // which would leave the skater upside down at the moment of completion.
  flipTilt: 0.55, // rad of peak tilt
  // A flip this far through its spin lands as caught, not slammed. Bailing
  // on a technicality the player cannot see read as random punishment.
  flipForgive: 0.65, // fraction of flipTime
  grabTilt: 0.3, // rad of held-grab tilt
  grabRate: 60, // points per second of grab held

  grindLockWindow: 14, // px of vertical slack that turns a landing into a grind
  grindBarH: 10, // px, collision depth of a rail bar
  grindDrag: 26, // px/s^2 of friction while grinding
  grindPerStep: 24, // px of grind that scores one step
  grindStepPoints: 10, // points per grind step
  grindSparkEvery: 30, // px of grind between spark effects
  balanceDrift: 0.62, // 1/s the balance meter runs toward the edge it leans to
  balanceNudge: 1.35, // 1/s of correction from Left/Right while grinding
  balanceStart: 0.12, // lean magnitude the meter locks in at

  bankDelay: 1.2, // s grounded with no trick before the open line banks
  bailTumble: 0.9, // s of tumble before the respawn
  bailClockPenalty: 3, // s taken off the district clock by a bail
  bailBackoff: 90, // px behind the bail point the respawn starts looking
  pitDepth: 120, // px below the lane before a fall counts as a pit bail

  cameraBias: 280, // px from the camera left edge where the skater rides
  backtrackPx: 240, // px of backtracking the camera edge allows

  districtSeconds: 120, // s on the clock per district
  districtHold: 2, // s of clear banner before the next district

  olliePoints: 50,
  flipPoints: 150,
  grabPoints: 100,
  // A one-link line banks at x1; every trick link past the first adds half a
  // multiplier. Plain ollies pay their points but never grow the multiplier,
  // and repeating the same move inside one line decays toward the floor, so
  // hop-spam and one-trick loops cannot ride an unbanked line to the cap.
  multPerLink: 0.5,
  maxMult: 5,
  repeatDecay: 0.6, // each repeat of a label in one line pays this of the last
  repeatFloor: 0.4, // of base points; the decay never goes below this

  districtClearBonus: 500,
  timeBonusPerSecond: 8,
  timeBonusCap: 400,
  lapBonus: 1500, // for completing all three districts of a lap
  lapSpeedRamp: 0.08, // extra top speed per completed lap
  lapSpeedRampCap: 0.4,
  lapClockDrop: 8, // s less district clock per completed lap
  lapClockFloor: 80, // s
  scoreCap: 80000,

  lineStarterLinks: 3, // links in one banked line that fire line-starter
  cleanLandingLinks: 5, // links in one banked line that fire clean-landing
  railWorkerPx: 400, // px of grinding in one line that fires rail-worker

  // Calibrated from the harness bots over the same six seeds AFTER the
  // anti-spam pass (ollies never multiply, repeated moves decay). The ace,
  // which links real tricks and grinds, scores 11,170 to 14,185. The plodder,
  // which clears every district without linking, tops out at 5,280. 9,000
  // sits between those populations: 70% above the best sloppy finish and 19%
  // under the worst ace run.
  legendScore: 9000,
} as const;

export type Phase = "skating" | "district-clear" | "gameover" | "victory";

export type Stance = "rolling" | "airborne" | "grinding" | "bailing";

export type TrickKind = "kickflip" | "heelflip" | "grab";

export type SfxName =
  | "ollie"
  | "land"
  | "flip"
  | "grab"
  | "grindOn"
  | "grindOff"
  | "bank"
  | "bail"
  | "districtClear"
  | "victory"
  | "timeout";

export type FxKind = "landing-puff" | "grind-sparks" | "ollie-streak" | "combo-flash" | "dust";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, number> };

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  born: number;
}

/** One scored entry in the open line. */
export interface LineLink {
  label: string;
  points: number;
  /** False for a plain ollie, which pays but never grows the multiplier. */
  trick: boolean;
}

export interface ActiveTrick {
  kind: TrickKind;
  elapsed: number;
  /** deg of presentation roll accumulated so far */
  spin: number;
  held: number;
  complete: boolean;
}

export interface Input {
  dir: -1 | 0 | 1;
  crouch: boolean;
  jump: boolean;
  trickA: boolean;
  trickB: boolean;
  trickC: boolean;
}

const DEG = Math.PI / 180;
const FX_TTL = 0.45; // s

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

/** Along-slope share of gravity for a lane of the given rise over run. */
const slopeFactor = (slope: number) => slope / (1 + slope * slope);

/** Matter stores velocity as px per 1000/60 ms regardless of the substep. */
const toMatterSpeed = (pxPerSecond: number) => pxPerSecond / 60;

const TRICK_LABEL: Record<TrickKind, string> = {
  kickflip: "Kickflip",
  heelflip: "Heelflip",
  grab: "Grab",
};

export class Engine {
  phase: Phase = "skating";
  time = 0;
  score = 0;

  districtIndex = 0;
  courses: Course[];
  course: Course;
  clock: number = TUNE.districtSeconds;

  stance: Stance = "rolling";
  /** px/s along the lane, positive is forward */
  vx = 0;
  /** px/s, positive falls */
  vy = 0;
  facing: 1 | -1 = 1;
  crouchTime = 0;
  trick: ActiveTrick | null = null;
  /** true while airborne under the skater's own ollie */
  ollied = false;

  grind: Grindable | null = null;
  balance = 0;
  grindPx = 0;

  line: LineLink[] = [];
  lineGrindPx = 0;
  /** s the skater has been grounded with nothing scoring */
  quiet = 0;

  scrollX = 0;
  fx: Fx[] = [];

  districtsCleared = 0;
  /** Completed loops of all three districts; drives the endless ramp. */
  lap = 0;
  tricksLanded = 0;
  bestLine = 0;
  longestGrindPx = 0;
  bails = 0;

  input: Input = {
    dir: 0,
    crouch: false,
    jump: false,
    trickA: false,
    trickB: false,
    trickC: false,
  };

  /** exposed so the harness can drive Matter directly in its staged proofs */
  mEngine: Matter.Engine;
  body: Matter.Body;

  private rand: () => number;
  private courseBodies: Matter.Body[] = [];
  private contacts: Matter.Pair[] = [];
  private grounded = false;
  private jumpPressed = false;
  private trickPressed: TrickKind | null = null;
  private airTime = 0;
  private clearTimer = 0;
  private accumulator = 0;
  private prevJump = false;
  private prevTrick = { a: false, b: false, c: false };
  private tumble = 0;
  private layoutSeed: number;
  private hazardArmX = -Infinity;
  private lastBailX = -Infinity;
  private sparkAt = 0;
  private bailedThisRun = false;
  private gameoverSent = false;
  private events: GameEvent[] = [];
  private achieved = new Set<string>();

  constructor(seed: number = TUNE.seed) {
    // Layout runs off its own stream so a course never depends on how the
    // player skated the district before it.
    const layout = mulberry32(seed ^ 0x9e3779b9);
    this.layoutSeed = seed;
    this.courses = DISTRICTS.map((_, i) => buildCourse(i, layout));
    this.course = this.courses[0];
    this.rand = mulberry32(seed);

    this.mEngine = Matter.Engine.create();
    this.mEngine.gravity.x = 0;
    this.mEngine.gravity.y = 0;

    this.body = Matter.Bodies.rectangle(0, 0, TUNE.bodyW, TUNE.bodyH, {
      label: "skater",
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      restitution: 0,
    });
    Matter.Body.setInertia(this.body, Infinity);
    Matter.Composite.add(this.mEngine.world, this.body);
    Matter.Events.on(this.mEngine, "collisionStart", (evt) => {
      for (const pair of evt.pairs) this.contacts.push(pair);
    });
    Matter.Events.on(this.mEngine, "collisionActive", (evt) => {
      for (const pair of evt.pairs) this.contacts.push(pair);
    });

    this.installCourse();
    this.placeAt(this.course.startX, TUNE.respawnSpeed);
  }

  get tumbleLeft(): number {
    return this.tumble;
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  private sfx(sound: SfxName) {
    this.emit({ type: "sfx", sound });
  }

  private achieve(slug: string) {
    if (this.achieved.has(slug)) return;
    this.achieved.add(slug);
    this.emit({ type: "achievement", slug });
  }

  private addScore(points: number) {
    this.score = Math.min(TUNE.scoreCap, this.score + points);
    if (this.score >= TUNE.legendScore) this.achieve("city-legend");
  }

  private addFx(kind: FxKind, x: number, y: number) {
    this.fx.push({ kind, x, y, born: this.time });
  }

  // ---- course setup -----------------------------------------------------

  private installCourse() {
    for (const b of this.courseBodies) Matter.Composite.remove(this.mEngine.world, b);
    this.courseBodies = [];

    const add = (body: Matter.Body) => {
      this.courseBodies.push(body);
      Matter.Composite.add(this.mEngine.world, body);
    };

    // Each lane segment is a static slab whose top edge is the rideable line.
    // The slab center sits one half depth along the downward perpendicular of
    // the segment, so rotating it about that center lands the top edge exactly
    // on the segment.
    for (const s of this.course.segments) {
      const dx = s.x1 - s.x0;
      const dy = s.y1 - s.y0;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const half = TUNE.laneSlab / 2;
      const body = Matter.Bodies.rectangle(
        (s.x0 + s.x1) / 2 - Math.sin(angle) * half,
        (s.y0 + s.y1) / 2 + Math.cos(angle) * half,
        len,
        TUNE.laneSlab,
        { isStatic: true, label: "lane", friction: 0, restitution: 0 },
      );
      Matter.Body.setAngle(body, angle);
      add(body);
    }

    for (const g of this.course.grindables) {
      const box = grindBox(g, TUNE.grindBarH);
      const body = Matter.Bodies.rectangle(
        (box.x0 + box.x1) / 2,
        (box.top + box.bottom) / 2,
        box.x1 - box.x0,
        box.bottom - box.top,
        { isStatic: true, label: "grind", friction: 0, restitution: 0 },
      );
      add(body);
    }

    for (const o of this.course.obstacles) {
      const box = obstacleBox(o);
      add(
        Matter.Bodies.rectangle(o.x, (box.top + box.bottom) / 2, o.w, o.h, {
          isStatic: true,
          label: "obstacle",
          friction: 0,
          restitution: 0,
        }),
      );
    }
  }

  private placeAt(x: number, speed: number) {
    const surface = surfaceYAt(this.course, x) ?? GROUND_Y;
    Matter.Body.setPosition(this.body, { x, y: surface - TUNE.bodyH / 2 });
    Matter.Body.setVelocity(this.body, { x: toMatterSpeed(speed), y: 0 });
    this.vx = speed;
    this.vy = 0;
    this.stance = "rolling";
    this.facing = 1;
    this.grind = null;
    this.trick = null;
    this.ollied = false;
    this.crouchTime = 0;
    this.airTime = 0;
    this.contacts.length = 0;
    this.grounded = false;
    // Fresh placements start with hazards disarmed until the skater has
    // actually travelled, so a respawn can never chain straight into the
    // wreck that caused it.
    this.hazardArmX = x;
  }

  get x() {
    return this.body.position.x;
  }

  get y() {
    return this.body.position.y;
  }

  /** The drawn skater's board contact, which is the body's bottom edge. */
  get feetY() {
    return this.body.position.y + TUNE.bodyH / 2;
  }

  topSpeed(): number {
    return TUNE.pushSpeed * (1 + Math.min(TUNE.lapSpeedRampCap, this.lap * TUNE.lapSpeedRamp));
  }

  lapClock(): number {
    return Math.max(TUNE.lapClockFloor, TUNE.districtSeconds - this.lap * TUNE.lapClockDrop);
  }

  get multiplier() {
    const trickLinks = this.line.reduce((n, link) => n + (link.trick ? 1 : 0), 0);
    return Math.min(TUNE.maxMult, 1 + TUNE.multPerLink * Math.max(0, trickLinks - 1));
  }

  /** Pushes a link with the same-label repeat decay applied to its points. */
  private pushLink(label: string, points: number, trick: boolean) {
    const repeats = this.line.reduce((n, link) => n + (link.label === label ? 1 : 0), 0);
    const factor = Math.max(TUNE.repeatFloor, Math.pow(TUNE.repeatDecay, repeats));
    this.line.push({ label, points: Math.round(points * factor), trick });
  }

  get linePoints() {
    let total = 0;
    for (const link of this.line) total += link.points;
    return total;
  }

  // ---- the loop ---------------------------------------------------------

  update(dt: number) {
    const step = Math.min(TUNE.maxDt, dt);
    this.time += step;
    this.fx = this.fx.filter((f) => this.time - f.born < FX_TTL);

    if (this.phase === "gameover" || this.phase === "victory") return;

    if (this.phase === "district-clear") {
      this.clearTimer -= step;
      if (this.clearTimer <= 0) this.advanceDistrict();
      return;
    }

    this.clock -= step;
    if (this.clock <= 0) {
      this.clock = 0;
      this.endRun("gameover");
      return;
    }

    this.accumulator += step;
    const sub = TUNE.substepMs / 1000;
    let taken = 0;
    while (this.accumulator >= sub && taken < TUNE.maxSubsteps) {
      this.accumulator -= sub;
      taken++;
      this.substep(sub);
      if (this.phase !== "skating") return;
    }
    if (taken === TUNE.maxSubsteps) this.accumulator = 0;

    this.followCamera();
  }

  /**
   * Read through a getter rather than comparing this.stance inline: the
   * substep's helpers change the stance, and narrowing from the early return
   * would tell the compiler the later checks are dead.
   */
  private get bailed() {
    return this.stance === "bailing";
  }

  private substep(sub: number) {
    this.readEdges();

    if (this.bailed) {
      this.tumble -= sub;
      if (this.tumble <= 0) this.respawn();
      return;
    }

    if (this.stance === "grinding") this.stepGrind(sub);
    else this.stepSkate(sub);
    if (this.bailed) return;

    const prevFeetY = this.feetY;
    this.stepPhysics(sub);
    this.readSupport();

    if (this.stance !== "grinding" && !this.tryGrind(prevFeetY)) this.resolveLanding(sub);
    if (this.bailed) return;
    this.checkPit();
    if (this.bailed) return;
    this.checkHazards();
    if (this.bailed) return;
    this.stepLine(sub);
    this.checkFinish();
  }

  /** Jump and trick buttons are edge triggered, so a held key fires once. */
  private readEdges() {
    const i = this.input;
    this.jumpPressed = i.jump && !this.prevJump;
    this.prevJump = i.jump;
    if (i.trickA && !this.prevTrick.a) this.trickPressed = "kickflip";
    else if (i.trickB && !this.prevTrick.b) this.trickPressed = "heelflip";
    else if (i.trickC && !this.prevTrick.c) this.trickPressed = "grab";
    else this.trickPressed = null;
    this.prevTrick = { a: i.trickA, b: i.trickB, c: i.trickC };
  }

  // ---- rolling and airborne --------------------------------------------

  private stepSkate(sub: number) {
    const dir = this.input.dir;

    if (this.stance === "rolling") {
      if (dir > 0) this.vx = Math.min(this.topSpeed(), this.vx + TUNE.pushAccel * sub);
      else if (dir < 0) this.vx = Math.max(-this.topSpeed() * 0.4, this.vx - TUNE.brakeAccel * sub);
      else if (this.vx > 0) this.vx = Math.max(0, this.vx - TUNE.rollDrag * sub);
      else if (this.vx < 0) this.vx = Math.min(0, this.vx + TUNE.rollDrag * sub);

      // Read before the crouch timer updates, so releasing crouch on the same
      // frame as the jump still spends the preload.
      if (this.jumpPressed) this.ollie();
      else this.crouchTime = this.input.crouch ? this.crouchTime + sub : 0;

      this.vx += TUNE.gravity * slopeFactor(slopeAt(this.course, this.x)) * sub;
    } else {
      this.airTime += sub;
      // Air control is deliberately weak; the line is decided before takeoff.
      if (dir !== 0) this.vx += dir * TUNE.pushAccel * TUNE.airControl * sub;
      this.vx = Math.max(-this.topSpeed(), Math.min(this.topSpeed(), this.vx));
      if (this.jumpPressed && !this.ollied && this.airTime <= TUNE.coyote) this.ollie();
      this.stepTrick(sub);
    }

    if (this.vx > 1) this.facing = 1;
    else if (this.vx < -1) this.facing = -1;
  }

  private ollie() {
    const preload = Math.min(1, this.crouchTime / TUNE.crouchFull);
    this.vy = -TUNE.ollieVel * (1 + TUNE.crouchBoost * preload);
    this.crouchTime = 0;
    this.ollied = true;
    this.stance = "airborne";
    this.airTime = 0;
    this.grind = null;
    this.addFx("ollie-streak", this.x, this.feetY);
    this.sfx("ollie");
  }

  private stepTrick(sub: number) {
    if (this.trickPressed && !this.trick) {
      const kind = this.trickPressed;
      this.trick = { kind, elapsed: 0, spin: 0, held: 0, complete: false };
      this.sfx(kind === "grab" ? "grab" : "flip");
    }
    const t = this.trick;
    if (!t) return;

    t.elapsed += sub;
    if (t.kind === "grab") {
      if (this.input.trickC) t.held += sub;
      else t.complete = true;
      return;
    }
    t.spin += TUNE.flipSpinRate * sub;
    if (t.elapsed >= TUNE.flipTime) t.complete = true;
  }

  // ---- grinding ---------------------------------------------------------

  private stepGrind(sub: number) {
    const rail = this.grind!;
    this.vx -= Math.sign(this.vx) * TUNE.grindDrag * sub;
    this.vy = 0;

    const lean = this.balance === 0 ? 1 : Math.sign(this.balance);
    this.balance += (TUNE.balanceDrift * lean - this.input.dir * TUNE.balanceNudge) * sub;

    const travelled = Math.abs(this.vx) * sub;
    this.grindPx += travelled;
    this.lineGrindPx += travelled;
    this.longestGrindPx = Math.max(this.longestGrindPx, this.grindPx);
    if (this.lineGrindPx >= TUNE.railWorkerPx) this.achieve("rail-worker");

    const link = this.line[this.line.length - 1];
    if (link) link.points = TUNE.grindStepPoints * Math.floor(this.grindPx / TUNE.grindPerStep);
    if (this.grindPx >= this.sparkAt) {
      this.sparkAt += TUNE.grindSparkEvery;
      this.addFx("grind-sparks", this.x, rail.y);
    }

    if (Math.abs(this.balance) >= 1) {
      this.bail();
      return;
    }
    if (this.jumpPressed) {
      this.leaveGrind();
      this.ollie();
      return;
    }
    if (this.x < rail.x0 - TUNE.bodyW / 2 || this.x > rail.x1 + TUNE.bodyW / 2) {
      this.leaveGrind();
      this.stance = "airborne";
      this.airTime = 0;
    }
  }

  private enterGrind(rail: Grindable) {
    this.grind = rail;
    this.stance = "grinding";
    this.balance = this.rand() < 0.5 ? -TUNE.balanceStart : TUNE.balanceStart;
    this.grindPx = 0;
    this.sparkAt = 0;
    this.trick = null;
    this.ollied = false;
    Matter.Body.setPosition(this.body, { x: this.x, y: rail.y - TUNE.bodyH / 2 });
    this.line.push({ label: `${rail.kind} grind`, points: 0, trick: true });
    this.quiet = 0;
    this.sfx("grindOn");
  }

  private leaveGrind() {
    this.grind = null;
    this.grindPx = 0;
    this.balance = 0;
    this.tricksLanded++;
    this.sfx("grindOff");
  }

  // ---- physics ----------------------------------------------------------

  private stepPhysics(sub: number) {
    if (this.stance !== "grinding") {
      this.vy = Math.min(TUNE.fallCap, this.vy + TUNE.gravity * sub);
    }
    Matter.Body.setVelocity(this.body, {
      x: toMatterSpeed(this.vx),
      y: toMatterSpeed(this.vy),
    });

    this.contacts.length = 0;
    Matter.Engine.update(this.mEngine, TUNE.substepMs);

    // Only the vertical axis is read back. Matter owns landing and penetration,
    // the engine owns forward speed: a skater pinned against a wall keeps its
    // intended push, which is what turns the contact into a bail instead of a
    // deadlock where the model speed never rises past the bail threshold.
    this.vy = this.body.velocity.y * 60;

    // The camera edge is a soft wall; the skater may drift back into it but
    // never past it, so a district stays reachable in one direction.
    const wall = this.scrollX + TUNE.cameraBias - TUNE.backtrackPx;
    if (this.x < wall) {
      Matter.Body.setPosition(this.body, { x: wall, y: this.y });
      if (this.vx < 0) this.vx = 0;
    }
  }

  /**
   * Support is read from the contact normal, not from the other body's box. A
   * ramp slab is one long rotated rect whose bounding box reaches well above
   * the skater at the low end, so a box test calls a ramp "air"; the normal
   * points up out of whatever the board is actually standing on and also
   * rejects the vertical face of a wall.
   */
  private readSupport() {
    this.grounded = false;
    for (const pair of this.contacts) {
      const fromSkater =
        pair.bodyA === this.body ? 1 : pair.bodyB === this.body ? -1 : 0;
      if (fromSkater === 0) continue;
      // Matter points the normal out of the surface and toward the skater, so
      // a support reads as -1 on y once the pair order is normalized.
      if (pair.collision.normal.y * fromSkater <= -0.5) {
        this.grounded = true;
        return;
      }
    }
  }

  /**
   * Grind entry is decided here rather than left to whichever way Matter
   * happens to push a corner contact. A descending skater whose board crosses a
   * grindable's top line inside the lock window locks on; anything else that
   * overlaps the same body is a side hit and falls through to checkHazards.
   */
  private tryGrind(prevFeetY: number) {
    if (this.stance !== "airborne" || this.vy < 0) return false;
    const halfW = TUNE.bodyW / 2;
    for (const g of this.course.grindables) {
      if (this.x + halfW <= g.x0 || this.x - halfW >= g.x1) continue;
      if (prevFeetY > g.y + TUNE.grindLockWindow) continue;
      if (this.feetY < g.y - TUNE.grindLockWindow) continue;
      this.enterGrind(g);
      return true;
    }
    return false;
  }

  private resolveLanding(sub: number) {
    if (this.grounded && this.vy >= -TUNE.groundedVyCap) {
      if (this.stance === "airborne") {
        this.land();
        return;
      }
      this.stance = "rolling";
      this.airTime = 0;
      return;
    }

    if (this.stance === "rolling") {
      this.stance = "airborne";
      this.airTime = sub;
      this.ollied = false;
    }
  }

  private land() {
    const t = this.trick;
    if (t && !t.complete) {
      if (t.kind === "grab") {
        t.complete = true; // a grab ends when the ground does
      } else if (t.elapsed >= TUNE.flipTime * TUNE.flipForgive) {
        t.complete = true; // caught late, not slammed
      } else {
        this.bail();
        return;
      }
    }

    this.stance = "rolling";
    this.airTime = 0;
    this.addFx("landing-puff", this.x, this.feetY);
    this.sfx("land");

    if (t) {
      const points =
        t.kind === "grab" ? TUNE.grabPoints + Math.round(TUNE.grabRate * t.held) : TUNE.flipPoints;
      this.pushLink(TRICK_LABEL[t.kind], points, true);
      this.tricksLanded++;
      this.quiet = 0;
    } else if (this.ollied) {
      this.pushLink("Ollie", TUNE.olliePoints, false);
      this.tricksLanded++;
      this.quiet = 0;
    }
    this.trick = null;
    this.ollied = false;
  }

  // ---- hazards ----------------------------------------------------------

  private overlapsBox(box: { x0: number; x1: number; top: number; bottom: number }) {
    const halfW = TUNE.bodyW / 2;
    const halfH = TUNE.bodyH / 2;
    return (
      this.x + halfW > box.x0 &&
      this.x - halfW < box.x1 &&
      this.y + halfH > box.top + 2 &&
      this.y - halfH < box.bottom
    );
  }

  private checkHazards() {
    if (Math.abs(this.vx) < TUNE.bailSpeed) return;
    if (Math.abs(this.x - this.hazardArmX) < TUNE.hazardRearmPx) return;
    let hit = false;
    for (const o of this.course.obstacles) {
      if (this.overlapsBox(obstacleBox(o))) {
        hit = true;
        break;
      }
    }
    // A grindable is only a grind from above. Riding into its side is the
    // same contact as riding into a bin.
    if (!hit) {
      for (const g of this.course.grindables) {
        if (g === this.grind) continue;
        if (this.overlapsBox(grindBox(g, TUNE.grindBarH))) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) return;
    // Only real speed wrecks. A slow contact is a stumble: the run and the
    // open line survive, the skater just bonks and has to jump the hazard.
    if (
      Math.abs(this.vx) < TUNE.stumbleSpeed ||
      Math.abs(this.x - this.lastBailX) < TUNE.sameHazardPx
    ) {
      this.vx = 0;
      Matter.Body.setVelocity(this.body, { x: 0, y: this.body.velocity.y });
      this.hazardArmX = this.x;
      this.addFx("dust", this.x, this.feetY);
      this.sfx("land");
      return;
    }
    this.bail();
  }

  private checkPit() {
    const surface = surfaceYAt(this.course, this.x);
    if (this.feetY > (surface ?? GROUND_Y) + TUNE.pitDepth) this.bail();
  }

  // ---- the open line ----------------------------------------------------

  private stepLine(sub: number) {
    if (this.stance !== "rolling") {
      this.quiet = 0;
      return;
    }
    if (this.line.length === 0) return;
    this.quiet += sub;
    if (this.quiet >= TUNE.bankDelay) this.bank();
  }

  private bank() {
    if (this.line.length === 0) return;
    const links = this.line.reduce((n, link) => n + (link.trick ? 1 : 0), 0);
    const total = Math.round(this.linePoints * this.multiplier);
    this.bestLine = Math.max(this.bestLine, total);
    this.addScore(total);
    this.achieve("first-ollie");
    if (links >= TUNE.lineStarterLinks) this.achieve("line-starter");
    if (links >= TUNE.cleanLandingLinks && !this.bailedThisRun) this.achieve("clean-landing");
    this.addFx("combo-flash", this.x, this.feetY - 40);
    this.sfx("bank");
    this.line = [];
    this.lineGrindPx = 0;
    this.quiet = 0;
  }

  private bail() {
    if (this.stance === "bailing") return;
    this.stance = "bailing";
    this.bails++;
    this.bailedThisRun = true;
    this.line = [];
    this.lineGrindPx = 0;
    this.grind = null;
    this.grindPx = 0;
    this.trick = null;
    this.ollied = false;
    this.quiet = 0;
    this.tumble = TUNE.bailTumble;
    this.lastBailX = this.x;
    this.clock = Math.max(0, this.clock - TUNE.bailClockPenalty);
    this.vx = 0;
    Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
    this.addFx("dust", this.x, this.feetY);
    this.sfx("bail");
  }

  /**
   * Walks back from the bail point until the skater box clears every hazard on
   * solid ground, so a bail into an obstacle drops the skater short of it
   * instead of inside it.
   */
  private safeRespawnX(from: number) {
    const floor = this.course.startX;
    for (let x = Math.max(floor, from - TUNE.bailBackoff); x >= floor; x -= 10) {
      if (surfaceYAt(this.course, x) === null) continue;
      const halfW = TUNE.bodyW / 2 + 6;
      let clear = true;
      for (const o of this.course.obstacles) {
        const box = obstacleBox(o);
        if (x + halfW > box.x0 && x - halfW < box.x1) clear = false;
      }
      for (const g of this.course.grindables) {
        if (x + halfW > g.x0 && x - halfW < g.x1) clear = false;
      }
      if (clear) return x;
    }
    return floor;
  }

  private respawn() {
    this.placeAt(this.safeRespawnX(this.x), TUNE.respawnSpeed);
  }

  /** Drops the skater back on the district's checkpoint with the score intact. */
  respawnAtCheckpoint() {
    this.placeAt(this.course.startX, TUNE.respawnSpeed);
    this.line = [];
    this.lineGrindPx = 0;
    this.quiet = 0;
  }

  // ---- districts --------------------------------------------------------

  private checkFinish() {
    if (this.x < this.course.finishX) return;
    this.bank();
    const timeBonus = Math.min(
      TUNE.timeBonusCap,
      Math.round(TUNE.timeBonusPerSecond * Math.max(0, this.clock)),
    );
    this.addScore(TUNE.districtClearBonus + timeBonus);
    this.districtsCleared++;
    const slug = DISTRICTS[this.districtIndex].clearSlug;
    if (slug) this.achieve(slug);

    if (this.districtIndex >= DISTRICTS.length - 1) {
      // Endless: a finished lap pays the lap bonus and loops the city with
      // fresh layouts, a faster board, and a tighter clock. The run only
      // ends when a clock runs out.
      this.addScore(TUNE.lapBonus);
      this.lap++;
      this.sfx("victory");
    } else {
      this.sfx("districtClear");
    }
    this.phase = "district-clear";
    this.clearTimer = TUNE.districtHold;
  }

  private advanceDistrict() {
    this.districtIndex = (this.districtIndex + 1) % DISTRICTS.length;
    if (this.districtIndex === 0) {
      // New lap, new layouts: the seed shifts so the city never repeats.
      const stream = mulberry32((this.layoutSeed ^ 0x9e3779b9) + this.lap * 7919);
      this.courses = DISTRICTS.map((_, i) => buildCourse(i, stream));
    }
    this.course = this.courses[this.districtIndex];
    this.installCourse();
    this.scrollX = 0;
    this.clock = this.lapClock();
    this.placeAt(this.course.startX, TUNE.respawnSpeed);
    this.phase = "skating";
  }

  private followCamera() {
    const target = Math.max(0, Math.min(this.course.length - W, this.x - TUNE.cameraBias));
    this.scrollX = Math.max(this.scrollX, target);
  }

  private endRun(phase: "gameover" | "victory") {
    this.phase = phase;
    if (phase === "gameover") this.sfx("timeout");
    if (this.gameoverSent) return;
    this.gameoverSent = true;
    this.emit({
      type: "gameover",
      score: this.score,
      stats: {
        districts_cleared: this.districtsCleared,
        laps: this.lap,
        tricks_landed: this.tricksLanded,
        best_line: this.bestLine,
        longest_grind_px: Math.round(this.longestGrindPx),
      },
    });
  }

  // ---- read-only helpers the renderer and the bots share ----------------

  /** Presentation tilt of the current trick, in radians. */
  trickTilt() {
    const t = this.trick;
    if (!t) return 0;
    if (t.kind === "grab") return TUNE.grabTilt;
    const sign = t.kind === "kickflip" ? 1 : -1;
    return Math.sin(t.spin * DEG) * TUNE.flipTilt * sign;
  }

  /** The next pit in front of the skater, or null when the lane is solid. */
  nextPit(): { x0: number; x1: number } | null {
    const step = 8;
    const limit = Math.min(this.course.length, this.x + 900);
    let x = this.x + step;
    while (x < limit) {
      if (surfaceYAt(this.course, x) === null) {
        const x0 = x;
        while (x < limit && surfaceYAt(this.course, x) === null) x += step;
        return { x0, x1: x };
      }
      x += step;
    }
    return null;
  }
}
