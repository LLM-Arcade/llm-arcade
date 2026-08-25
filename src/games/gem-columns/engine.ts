// Gem Columns engine. A seeded falling-triad ruleset over one flat grid.
// DOM-free with relative .ts imports so scripts/harness/gem-columns.mjs runs
// the identical simulation under node.
//
// Row indexing: rows are stored 0..ROWS-1 top down. Rows 0..HIDDEN_ROWS-1 are
// the hidden spawn rows above the well; visible row v is stored row
// v + HIDDEN_ROWS. Storing them in one non-negative range keeps the grid a
// single typed array and keeps every bounds check a plain comparison.

import { LEVELS, type LevelDef } from "./levels.ts";

export const W = 960;
export const H = 540;

export const COLS = 6;
export const VISIBLE_ROWS = 13;
export const HIDDEN_ROWS = 3;
export const ROWS = HIDDEN_ROWS + VISIBLE_ROWS;
export const EMPTY = -1;

export const SPAWN_COL = 2;
/** Stored row of a spawning triad's bottom gem; the triad starts hidden. */
export const SPAWN_ROW = HIDDEN_ROWS - 1;

export const TUNE = {
  seed: 0x9c37f1, // default PRNG seed; the harness may pass its own

  maxDt: 0.05, // s; dt clamp before the engine advances
  softDropCells: 14, // cells/s while soft drop is held
  moveRepeat: 0.12, // s between auto-repeat column moves

  flashSeconds: 0.11, // matched-state hold before the cells clear
  clearFxSeconds: 0.15, // clear-frame scale-and-fade window
  levelClearHold: 1.8, // s of level-clear banner
  fxTtl: 0.42, // s, generic effect lifetime
  pulseFps: 5, // falling-triad normal/pulse swap rate

  pointsPerGem: 15,
  /** Per cell beyond three in one resolution step; pays for engineered lines. */
  bigClearGemBonus: 20,
  levelClearBonus: 400,
  loopBonus: 1200, // for clearing all three wells of a loop
  loopFallRamp: 0.35, // cells/s added to every fall speed per completed loop
  loopFallCap: 2.1, // cells/s of total loop fall bonus
  /** s; finishing a level under this earns the speed bonus. */
  speedPar: 90,
  speedBonusPerSec: 8,
  speedBonusCap: 600, // per level
  scoreCap: 60000,
  // Calibrated from scripts/harness/gem-columns.mjs after the depth pass
  // (chain x3/x6, big-clear bonus, speed bonus): see the harness seed spread.
  legendScore: 5000,

  /** Visible row a stack must reach for the danger state. */
  dangerVisRow: 2,
  /** Every column must be at or below this visible row for danger-dancer. */
  dangerSafeVisRow: 4,
} as const;

export type Phase = "falling" | "resolving" | "level-clear" | "gameover";

export type SfxName =
  | "move"
  | "cycle"
  | "lock"
  | "match"
  | "cascade2"
  | "cascade3"
  | "clear"
  | "danger"
  | "levelClear"
  | "victory"
  | "gameover";

export type FxKind =
  | "landing-puff"
  | "cascade-arc"
  | "clear-burst"
  | "match-sparkle"
  | "level-rays";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, number> };

export interface Piece {
  col: number;
  /** Stored row of the bottom gem. */
  row: number;
  /** [top, middle, bottom] family ids. */
  gems: number[];
}

export interface Fx {
  kind: FxKind;
  /** Grid space, fractional allowed; the renderer owns pixel geometry. */
  col: number;
  row: number;
  born: number;
}

export interface ClearingGem {
  col: number;
  row: number;
  family: number;
  born: number;
}

export type Grid = Int8Array;

export const cellAt = (col: number, row: number) => row * COLS + col;
export const cellCol = (index: number) => index % COLS;
export const cellRow = (index: number) => Math.floor(index / COLS);
export const newGrid = (): Grid => new Int8Array(ROWS * COLS).fill(EMPTY);

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

export const chainMultiplier = (chain: number) => (chain <= 1 ? 1 : chain === 2 ? 3 : 6);

/** Lowest empty row in a column, or -1 when the column is full. */
export const dropRow = (grid: Grid, col: number): number => {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (grid[cellAt(col, row)] === EMPTY) return row;
  }
  return -1;
};

/** Topmost occupied stored row across the board, or ROWS when it is empty. */
export const topOccupiedRow = (grid: Grid): number => {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[cellAt(col, row)] !== EMPTY) return row;
    }
  }
  return ROWS;
};

// East, south, south-east, north-east. Their opposites are covered by the
// run-start test below, so four vectors span all four axes.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/**
 * Every cell in a line of three or more of one family, in ascending cell
 * order. Overlapping lines collapse into one set, so a shared gem is listed
 * once and scores once.
 */
export const findMatches = (grid: Grid): number[] => {
  const hit = new Set<number>();
  for (const [dc, dr] of DIRS) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const family = grid[cellAt(col, row)];
        if (family === EMPTY) continue;
        const pc = col - dc;
        const pr = row - dr;
        const started =
          pc < 0 || pc >= COLS || pr < 0 || pr >= ROWS || grid[cellAt(pc, pr)] !== family;
        if (!started) continue;
        let len = 0;
        let c = col;
        let r = row;
        while (c >= 0 && c < COLS && r >= 0 && r < ROWS && grid[cellAt(c, r)] === family) {
          len++;
          c += dc;
          r += dr;
        }
        if (len < 3) continue;
        c = col;
        r = row;
        for (let i = 0; i < len; i++) {
          hit.add(cellAt(c, r));
          c += dc;
          r += dr;
        }
      }
    }
  }
  return [...hit].sort((a, b) => a - b);
};

/** Compacts every column downward in place. */
export const applyGravity = (grid: Grid) => {
  for (let col = 0; col < COLS; col++) {
    let write = ROWS - 1;
    for (let row = ROWS - 1; row >= 0; row--) {
      const family = grid[cellAt(col, row)];
      if (family === EMPTY) continue;
      grid[cellAt(col, write)] = family;
      if (write !== row) grid[cellAt(col, row)] = EMPTY;
      write--;
    }
  }
};

export interface DropOutcome {
  /** False when the triad cannot fit in the column at all. */
  valid: boolean;
  cleared: number;
  /** Resolution steps, which is the chain the drop would reach. */
  chain: number;
  /** Topmost occupied stored row once the cascade settles. */
  topRow: number;
  grid: Grid;
}

/**
 * Pure preview of dropping one triad into one column, cascades included.
 * The engine and the harness bots share it so a bot never guesses at rules
 * the engine implements differently.
 */
export const simulateDrop = (
  grid: Grid,
  col: number,
  gems: readonly number[],
): DropOutcome => {
  const next = grid.slice();
  const rest = dropRow(next, col);
  if (rest < 2) return { valid: false, cleared: 0, chain: 0, topRow: 0, grid: next };
  next[cellAt(col, rest)] = gems[2];
  next[cellAt(col, rest - 1)] = gems[1];
  next[cellAt(col, rest - 2)] = gems[0];

  let cleared = 0;
  let chain = 0;
  for (;;) {
    const hit = findMatches(next);
    if (hit.length === 0) break;
    chain++;
    cleared += hit.length;
    for (const index of hit) next[index] = EMPTY;
    applyGravity(next);
  }
  return { valid: true, cleared, chain, topRow: topOccupiedRow(next), grid: next };
};

export class Engine {
  phase: Phase = "falling";
  time = 0;
  score = 0;
  levelIndex = 0;
  level: LevelDef = LEVELS[0];
  /** Completed loops of all three wells; drives the endless fall ramp. */
  loop = 0;

  grid: Grid = newGrid();
  piece: Piece | null = null;
  nextGems: number[] = [];
  /** Cells flashing their matched frame this resolution step. */
  matched: number[] = [];
  clearing: ClearingGem[] = [];
  fx: Fx[] = [];

  chain = 0;
  maxChain = 0;
  gemsCleared = 0;
  gemsThisLevel = 0;
  levelsCleared = 0;
  bestCascadeGems = 0;
  piecesSpawned = 0;
  danger = false;

  input = { dir: 0, softDrop: false, cycle: false };

  private rand: () => number;
  private levelStart = 0;
  private fall = 0;
  private moveTimer = 0;
  private prevDir = 0;
  private prevCycle = false;
  private stageTimer = 0;
  private cascadeGems = 0;
  private dangerAtLock = false;
  private gameoverSent = false;
  private events: GameEvent[] = [];
  private achieved = new Set<string>();

  constructor(seed: number = TUNE.seed) {
    this.rand = mulberry32(seed);
    this.startLevel(0);
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  /** Cells the falling triad would occupy if it dropped from here. */
  landingRow(): number {
    return this.piece ? dropRow(this.grid, this.piece.col) : -1;
  }

  fallSpeed(): number {
    const level = this.level;
    const loopBonus = Math.min(TUNE.loopFallCap, this.loop * TUNE.loopFallRamp);
    const ramped = level.fall + level.fallRamp * Math.floor(this.gemsThisLevel / level.rampEvery);
    return Math.min(level.maxFall, ramped) + loopBonus;
  }

  update(dt: number) {
    const step = Math.min(TUNE.maxDt, dt);
    this.time += step;
    this.fx = this.fx.filter((f) => this.time - f.born < TUNE.fxTtl);
    this.clearing = this.clearing.filter((c) => this.time - c.born < TUNE.clearFxSeconds);

    // Tracked every frame so a cycle key held through a banner still needs a
    // fresh release before it rotates the next triad.
    const cyclePressed = this.input.cycle && !this.prevCycle;
    this.prevCycle = this.input.cycle;

    if (this.phase === "gameover") return;

    if (this.phase === "level-clear") {
      this.stageTimer -= step;
      if (this.stageTimer <= 0) this.advanceLevel();
      return;
    }

    if (this.phase === "resolving") {
      this.stageTimer -= step;
      if (this.stageTimer <= 0) this.applyClear();
      return;
    }

    this.tickFalling(step, cyclePressed);
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
    if (this.score >= TUNE.legendScore) this.achieve("gem-legend");
  }

  private addFx(kind: FxKind, col: number, row: number) {
    this.fx.push({ kind, col, row, born: this.time });
  }

  private rollTriad(): number[] {
    const set = this.level.families;
    return [0, 1, 2].map(() => set[Math.floor(this.rand() * set.length)]);
  }

  // ---- Level flow -------------------------------------------------------

  private startLevel(index: number) {
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.grid = newGrid();
    this.piece = null;
    this.matched = [];
    this.clearing = [];
    this.fx = [];
    this.gemsThisLevel = 0;
    this.chain = 0;
    this.danger = false;
    this.levelStart = this.time;
    this.nextGems = this.rollTriad();
    this.phase = "falling";
    this.spawnPiece();
  }

  private spawnPiece() {
    this.piece = { col: SPAWN_COL, row: SPAWN_ROW, gems: this.nextGems };
    this.nextGems = this.rollTriad();
    this.piecesSpawned++;
    this.fall = 0;
    this.moveTimer = 0;
    this.prevDir = 0;
  }

  private enterLevelClear() {
    this.phase = "level-clear";
    this.stageTimer = TUNE.levelClearHold;
    this.levelsCleared++;
    const elapsed = this.time - this.levelStart;
    const speedBonus = Math.min(
      TUNE.speedBonusCap,
      Math.max(0, Math.round((TUNE.speedPar - elapsed) * TUNE.speedBonusPerSec)),
    );
    this.addScore(TUNE.levelClearBonus + speedBonus);
    this.achieve(this.level.clearSlug);
    this.addFx("level-rays", (COLS - 1) / 2, HIDDEN_ROWS + VISIBLE_ROWS / 2);
    this.emit({ type: "sfx", sound: "levelClear" });
  }

  private advanceLevel() {
    if (this.levelIndex >= LEVELS.length - 1) {
      // Endless: a cleared archive pays the loop bonus and starts the wells
      // over with faster gems. The run ends only when the spawn blocks.
      this.loop++;
      this.addScore(TUNE.loopBonus);
      this.emit({ type: "sfx", sound: "victory" });
      this.startLevel(0);
      return;
    }
    this.startLevel(this.levelIndex + 1);
  }

  // ---- Falling ----------------------------------------------------------

  private tickFalling(step: number, cyclePressed: boolean) {
    const piece = this.piece;
    if (!piece) return;

    if (cyclePressed) {
      piece.gems.push(piece.gems.shift()!);
      this.emit({ type: "sfx", sound: "cycle" });
    }

    this.stepMove(step);

    const speed = this.input.softDrop
      ? Math.max(TUNE.softDropCells, this.fallSpeed())
      : this.fallSpeed();
    this.fall += speed * step;
    while (this.fall >= 1) {
      if (piece.row + 1 < ROWS && this.grid[cellAt(piece.col, piece.row + 1)] === EMPTY) {
        piece.row++;
        this.fall -= 1;
        continue;
      }
      this.fall = 0;
      this.lockPiece();
      return;
    }
  }

  private stepMove(step: number) {
    const dir = this.input.dir;
    if (dir === 0) {
      this.prevDir = 0;
      this.moveTimer = 0;
      return;
    }
    if (dir !== this.prevDir) {
      this.prevDir = dir;
      this.moveTimer = TUNE.moveRepeat;
      this.tryMove(dir);
      return;
    }
    this.moveTimer -= step;
    if (this.moveTimer <= 0) {
      this.moveTimer += TUNE.moveRepeat;
      this.tryMove(dir);
    }
  }

  private tryMove(dir: number) {
    const piece = this.piece!;
    const col = piece.col + dir;
    if (col < 0 || col >= COLS) return;
    for (let i = 0; i < 3; i++) {
      const row = piece.row - i;
      if (row >= 0 && this.grid[cellAt(col, row)] !== EMPTY) return;
    }
    piece.col = col;
    this.emit({ type: "sfx", sound: "move" });
  }

  private lockPiece() {
    const piece = this.piece!;
    for (let i = 0; i < 3; i++) {
      const row = piece.row - i;
      if (row >= 0) this.grid[cellAt(piece.col, row)] = piece.gems[2 - i];
    }
    this.piece = null;
    this.chain = 0;
    this.cascadeGems = 0;
    this.addFx("landing-puff", piece.col, piece.row);
    this.emit({ type: "sfx", sound: "lock" });
    this.dangerAtLock = this.refreshDanger();
    this.beginResolve();
  }

  // ---- Resolution -------------------------------------------------------

  private beginResolve() {
    const hit = findMatches(this.grid);
    if (hit.length === 0) {
      this.finishResolve();
      return;
    }
    this.chain++;
    if (this.chain > this.maxChain) this.maxChain = this.chain;
    this.matched = hit;
    for (const index of hit) this.addFx("match-sparkle", cellCol(index), cellRow(index));
    if (this.chain >= 2) {
      this.achieve("cascade");
      this.addFx("cascade-arc", (COLS - 1) / 2, HIDDEN_ROWS + VISIBLE_ROWS / 2);
      this.emit({ type: "sfx", sound: this.chain === 2 ? "cascade2" : "cascade3" });
    } else {
      this.emit({ type: "sfx", sound: "match" });
    }
    this.phase = "resolving";
    this.stageTimer = TUNE.flashSeconds;
  }

  private applyClear() {
    const hit = this.matched;
    this.matched = [];
    this.addScore(
      hit.length * TUNE.pointsPerGem * chainMultiplier(this.chain) +
        Math.max(0, hit.length - 3) * TUNE.bigClearGemBonus,
    );
    this.gemsCleared += hit.length;
    this.gemsThisLevel += hit.length;
    this.cascadeGems += hit.length;
    if (this.cascadeGems > this.bestCascadeGems) this.bestCascadeGems = this.cascadeGems;
    this.achieve("first-match");

    for (const index of hit) {
      const col = cellCol(index);
      const row = cellRow(index);
      this.clearing.push({ col, row, family: this.grid[index], born: this.time });
      this.addFx("clear-burst", col, row);
      this.grid[index] = EMPTY;
    }
    applyGravity(this.grid);
    this.emit({ type: "sfx", sound: "clear" });
    this.beginResolve();
  }

  private finishResolve() {
    this.refreshDanger();
    if (
      this.dangerAtLock &&
      this.cascadeGems > 0 &&
      topOccupiedRow(this.grid) >= HIDDEN_ROWS + TUNE.dangerSafeVisRow
    ) {
      this.achieve("danger-dancer");
    }

    if (this.gemsThisLevel >= this.level.quota) {
      this.enterLevelClear();
      return;
    }
    if (this.spawnBlocked()) {
      this.phase = "gameover";
      this.emit({ type: "sfx", sound: "gameover" });
      this.sendGameover();
      return;
    }
    this.phase = "falling";
    this.spawnPiece();
  }

  private spawnBlocked(): boolean {
    for (let i = 0; i < 3; i++) {
      const row = SPAWN_ROW - i;
      if (row >= 0 && this.grid[cellAt(SPAWN_COL, row)] !== EMPTY) return true;
    }
    return false;
  }

  private refreshDanger(): boolean {
    const on = topOccupiedRow(this.grid) <= HIDDEN_ROWS + TUNE.dangerVisRow;
    if (on && !this.danger) this.emit({ type: "sfx", sound: "danger" });
    this.danger = on;
    return on;
  }

  private sendGameover() {
    if (this.gameoverSent) return;
    this.gameoverSent = true;
    this.emit({
      type: "gameover",
      score: this.score,
      stats: {
        levels_cleared: this.levelsCleared,
        loops: this.loop,
        gems_cleared: this.gemsCleared,
        max_chain: this.maxChain,
        best_cascade_gems: this.bestCascadeGems,
      },
    });
  }
}
