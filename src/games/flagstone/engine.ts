// Flagstone engine — pure TypeScript, no DOM, no React. The harness imports
// this file directly, so keep every decision deterministic and every scoring
// rule here rather than in the React shell.

import { PUZZLES, type Puzzle } from "./levels.ts";

export const TUNE = {
  /** Wrong-cell fills a run survives. The next one ends it. */
  maxMistakes: 5,
  /** Hard ceiling the platform sanitizer also clamps to. */
  scoreCap: 60000,
  /** Points for the first correct fill of a cell. */
  fillBase: 10,
  /** Consecutive correct fills needed for each extra multiplier step. */
  comboStep: 8,
  /** Multiplier ceiling (x1..x5). */
  comboMax: 5,
  /** Paid the first time each row or column clue is satisfied. */
  lineBonus: 25,
  clearBase: 200,
  /** Extra clear bonus per difficulty tier. */
  clearPerTier: 100,
  /** Clear bonus for a slab finished without a wrong fill. */
  flawlessBonus: 300,
  /** Achievement thresholds. */
  legendScore: 5000,
  hotQuarryClears: 2,
  threeSlabClears: 3,
} as const;

export const EMPTY = 0;
export const FILLED = 1;
export const FLAGGED = 2;

export type Sound = "fill" | "flag" | "line" | "miss" | "clear" | "win" | "over";

export type FlagstoneEvent =
  | { type: "sfx"; sound: Sound }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, string | number> };

export type Phase = "playing" | "over";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class Engine {
  marks: Uint8Array = new Uint8Array(0);
  /** 1 once a cell has paid out, so un-filling cannot farm score again. */
  awarded: Uint8Array = new Uint8Array(0);
  rowDone: boolean[] = [];
  colDone: boolean[] = [];

  puzzleIndex = 0;
  score = 0;
  mistakes = 0;
  streak = 0;
  bestStreak = 0;
  cleared = 0;
  flawlessClears = 0;
  /** Consecutive flawless clears, for the hot-quarry achievement. */
  hotRun = 0;
  /** Seconds fed in through update(); shown as a stat, never scored. */
  elapsed = 0;
  phase: Phase = "playing";

  cursorRow = 0;
  cursorCol = 0;

  private puzzleMistakes = 0;
  private events: FlagstoneEvent[] = [];
  private unlocked = new Set<string>();

  constructor(startIndex = 0) {
    this.puzzleIndex = clamp(startIndex, 0, PUZZLES.length - 1);
    this.loadPuzzle();
  }

  get puzzle(): Puzzle {
    return PUZZLES[this.puzzleIndex];
  }

  /** Wrong fills left before the run ends. */
  get missesLeft(): number {
    return Math.max(0, TUNE.maxMistakes - this.mistakes);
  }

  /** Current scoring multiplier from the fill streak. */
  get multiplier(): number {
    return Math.min(TUNE.comboMax, 1 + Math.floor(this.streak / TUNE.comboStep));
  }

  get mistakesThisPuzzle(): number {
    return this.puzzleMistakes;
  }

  idx(row = this.cursorRow, col = this.cursorCol): number {
    return row * this.puzzle.w + col;
  }

  markAt(row: number, col: number): number {
    return this.marks[row * this.puzzle.w + col];
  }

  move(dr: number, dc: number): void {
    if (this.phase !== "playing") return;
    this.cursorRow = clamp(this.cursorRow + dr, 0, this.puzzle.h - 1);
    this.cursorCol = clamp(this.cursorCol + dc, 0, this.puzzle.w - 1);
  }

  setCursor(row: number, col: number): void {
    if (this.phase !== "playing") return;
    this.cursorRow = clamp(row, 0, this.puzzle.h - 1);
    this.cursorCol = clamp(col, 0, this.puzzle.w - 1);
  }

  /** Commit the cursor cell as a stone. A wrong cell costs a mistake. */
  fill(): void {
    if (this.phase !== "playing") return;
    const i = this.idx();
    if (this.marks[i] === FILLED) return;

    if (this.puzzle.solution[i]) {
      this.marks[i] = FILLED;
      if (!this.awarded[i]) {
        this.awarded[i] = 1;
        this.award(TUNE.fillBase * this.multiplier);
      }
      this.streak += 1;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      this.push({ type: "sfx", sound: "fill" });
      this.checkLines();
      this.checkSlab();
      return;
    }

    // Wrong cell: it never stays on the board, it just costs.
    this.puzzleMistakes += 1;
    this.mistakes += 1;
    this.streak = 0;
    this.push({ type: "sfx", sound: "miss" });
    if (this.mistakes >= TUNE.maxMistakes) this.endRun();
  }

  /** Cycle a cell between flagged and empty. Flagging never costs. */
  flag(): void {
    if (this.phase !== "playing") return;
    const i = this.idx();
    if (this.marks[i] === FILLED) return;
    this.marks[i] = this.marks[i] === FLAGGED ? EMPTY : FLAGGED;
    this.push({ type: "sfx", sound: "flag" });
  }

  /** Lift a stone back off the board. Re-placing it pays nothing again. */
  clear(): void {
    if (this.phase !== "playing") return;
    const i = this.idx();
    if (this.marks[i] === EMPTY) return;
    this.marks[i] = EMPTY;
  }

  update(dt: number): void {
    if (this.phase !== "playing") return;
    this.elapsed += Math.max(0, Math.min(dt, 0.25));
  }
  /** Hand every queued event to the shell, then clear the queue. */
  drainEvents(): FlagstoneEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---- internals ---------------------------------------------------------

  private loadPuzzle(): void {
    const p = this.puzzle;
    this.marks = new Uint8Array(p.w * p.h);
    this.awarded = new Uint8Array(p.w * p.h);
    // A line whose clue is [0] has nothing to fill, so it is satisfied the
    // moment the slab opens. Mark it done here (so it renders as finished)
    // rather than letting checkLines discover it and pay a line bonus for
    // work the player never did.
    this.rowDone = p.rowClues.map((clue) => clue.length === 1 && clue[0] === 0);
    this.colDone = p.colClues.map((clue) => clue.length === 1 && clue[0] === 0);
    this.puzzleMistakes = 0;
    this.cursorRow = 0;
    this.cursorCol = 0;
  }

  private award(points: number): void {
    this.score = Math.min(TUNE.scoreCap, this.score + points);
    if (this.score >= TUNE.legendScore) this.unlock("quarry-legend");
  }

  private push(event: FlagstoneEvent): void {
    this.events.push(event);
  }

  private unlock(slug: string): void {
    if (this.unlocked.has(slug)) return;
    this.unlocked.add(slug);
    this.push({ type: "achievement", slug });
  }

  private checkLines(): void {
    const p = this.puzzle;

    for (let y = 0; y < p.h; y++) {
      if (this.rowDone[y]) continue;
      let done = true;
      for (let x = 0; x < p.w; x++) {
        if (p.solution[y * p.w + x] && this.marks[y * p.w + x] !== FILLED) {
          done = false;
          break;
        }
      }
      if (done) {
        this.rowDone[y] = true;
        this.linePaid();
      }
    }

    for (let x = 0; x < p.w; x++) {
      if (this.colDone[x]) continue;
      let done = true;
      for (let y = 0; y < p.h; y++) {
        if (p.solution[y * p.w + x] && this.marks[y * p.w + x] !== FILLED) {
          done = false;
          break;
        }
      }
      if (done) {
        this.colDone[x] = true;
        this.linePaid();
      }
    }
  }

  private linePaid(): void {
    this.award(TUNE.lineBonus);
    this.push({ type: "sfx", sound: "line" });
    this.unlock("first-line");
  }

  private checkSlab(): void {
    const p = this.puzzle;
    for (let i = 0; i < p.solution.length; i++) {
      if (p.solution[i] && this.marks[i] !== FILLED) return;
    }

    this.cleared += 1;
    let bonus = TUNE.clearBase + TUNE.clearPerTier * p.tier;
    if (this.puzzleMistakes === 0) {
      bonus += TUNE.flawlessBonus;
      this.flawlessClears += 1;
      this.hotRun += 1;
    } else {
      this.hotRun = 0;
    }
    this.award(bonus);

    this.push({ type: "sfx", sound: "clear" });
    this.unlock("first-slab");
    if (this.puzzleMistakes === 0) this.unlock("clean-cut");
    if (this.hotRun >= TUNE.hotQuarryClears) this.unlock("hot-quarry");
    if (this.cleared >= TUNE.threeSlabClears) this.unlock("three-slabs");

    if (this.puzzleIndex + 1 >= PUZZLES.length) {
      this.push({ type: "sfx", sound: "win" });
      this.endRun();
      return;
    }
    this.puzzleIndex += 1;
    this.loadPuzzle();
  }

  private endRun(): void {
    if (this.phase === "over") return;
    this.phase = "over";
    this.push({ type: "sfx", sound: "over" });
    this.push({
      type: "gameover",
      score: this.score,
      stats: {
        slabs: this.cleared,
        misses: this.mistakes,
        flawless: this.flawlessClears,
        streak: this.bestStreak,
        seconds: Math.round(this.elapsed),
      },
    });
  }
}
