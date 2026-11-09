// Flagstone puzzle bank. A nonogram (griddler) cabinet: the clues are the
// game, so there are no sprite sheets here — the only "art" is the flat ink
// playfield panel and the two cell fills, both drawn from design tokens.
// (Project rule: no programmatic sprite art. There are no sprites.)
//
// Clues are always DERIVED from the authored solution below, never typed by
// hand, so a clue can never disagree with its solution. What still has to be
// proven is that each clue set resolves to exactly one picture — that is the
// job of scripts/harness/flagstone.mjs, which solves every puzzle from clues
// alone and fails if a grid is ambiguous.

export interface Puzzle {
  id: string;
  name: string;
  /** 1-based difficulty tier; drives the clear bonus. */
  tier: number;
  w: number;
  h: number;
  /** Row-major solution. 1 = this cell must be filled. */
  solution: Uint8Array;
  rowClues: number[][];
  colClues: number[][];
}

/** Runs of filled cells in a line. An empty line is [0], as nonograms show. */
export const clueLine = (cells: ArrayLike<number>): number[] => {
  const runs: number[] = [];
  let run = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) run++;
    else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  return runs.length ? runs : [0];
};

const build = (id: string, name: string, tier: number, rows: string[]): Puzzle => {
  const h = rows.length;
  const w = rows[0].length;
  if (w === 0) throw new Error(`Flagstone: ${id} has an empty row`);
  for (const row of rows) {
    if (row.length !== w) throw new Error(`Flagstone: ${id} rows are ragged`);
  }

  const solution = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === "#") solution[y * w + x] = 1;
      else if (ch !== ".") throw new Error(`Flagstone: ${id} has a stray "${ch}"`);
    }
  }

  const rowClues: number[][] = [];
  for (let y = 0; y < h; y++) rowClues.push(clueLine(solution.subarray(y * w, y * w + w)));

  const colClues: number[][] = [];
  const column = new Uint8Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) column[y] = solution[y * w + x];
    colClues.push(clueLine(column));
  }

  return { id, name, tier, w, h, solution, rowClues, colClues };
};

/**
 * Six slabs, gentle to steep. Each one is a stocky, irregular silhouette on
 * purpose: symmetric shapes are the ones that tend to read two ways.
 */
export const PUZZLES: Puzzle[] = [
  build("boot", "Boot", 1, [
    "..........",
    "..###.....",
    "..###.....",
    "..###.....",
    "..###.....",
    "..###.....",
    "..####....",
    "..#####...",
    ".########.",
    ".#########",
    "..........",
    "..........",
  ]),
  build("gate-post", "Gate Post", 2, [
    "............",
    "..##....##..",
    "..##....##..",
    "..##....##..",
    "..########..",
    "..##....##..",
    "..##....##..",
    "..##....##..",
    "..##....####",
    "..##....##..",
    "..##....##..",
    "............",
  ]),
  build("cairn", "Cairn", 3, [
    "..............",
    "..............",
    "......####....",
    ".....######...",
    ".....######...",
    "....########..",
    "..............",
    "....#####.....",
    "...#######....",
    "...#######....",
    "..#########...",
    "..............",
    "....#######...",
    "..#########...",
  ]),
  build("kiln", "Kiln", 4, [
    "..............",
    "....###.......",
    "....###.......",
    "....###.......",
    ".....####.....",
    "....######....",
    "...########...",
    "..##########..",
    ".############.",
    ".############.",
    ".############.",
    ".############.",
    "..............",
    "..............",
  ]),
  build("well", "Well", 5, [
    "...............",
    "........#......",
    ".......###.....",
    "......#####....",
    ".....#######...",
    "....#########..",
    "...............",
    "..###########..",
    "..###########..",
    "..#########....",
    "..#########....",
    "..###########..",
    "...............",
    "...............",
    "...............",
  ]),
  build("quarry-crane", "Quarry Crane", 6, [
    "...............",
    "........####...",
    "........#..#...",
    "........#..#...",
    "........#..#...",
    "........####...",
    "........#......",
    "........#......",
    "........#......",
    "..#######......",
    "..#.....#......",
    "..#.....#......",
    "..#.....#......",
    "..#######......",
    "...............",
  ]),
];
