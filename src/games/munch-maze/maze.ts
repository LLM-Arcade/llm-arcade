// Munch Maze — maze layout & grid helpers.
// Original 19×21 layout (IP hygiene: not the classic maze).
// Legend: # wall · . seed · o power acorn · (space) open · = ghost door ·
//         G house interior · T tunnel mouth (wraps) · P player start

export const COLS = 19;
export const ROWS = 21;
export const TILE = 24;
export const BOARD_W = COLS * TILE; // 456
export const BOARD_H = ROWS * TILE; // 504

export const LAYOUT = [
  "###################",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.         .####",
  "####.# ##=## #.####",
  "T....# #GGG# #....T",
  "####.# ##### #.####",
  "####.         .####",
  "####.#.#####.#.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....P.....#.o#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.................#",
  "###################",
] as const;

export const PLAYER_START = { x: 9, y: 15 };
export const HOUSE_EXIT = { x: 9, y: 7 };
export const HOUSE_CENTER = { x: 9, y: 9 };
export const DOOR = { x: 9, y: 8 };
export const BERRY_TILE = { x: 9, y: 11 };
export const TUNNEL_ROW = 9;

/** Scatter corners per ghost id (terracotta, olive, mustard, brown). */
export const SCATTER_TARGETS = [
  { x: 17, y: 1 },
  { x: 1, y: 1 },
  { x: 17, y: 19 },
  { x: 1, y: 19 },
];

export const GHOST_HOUSE_SPOTS = [
  { x: 9, y: 7 }, // terracotta starts outside, on the prowl
  { x: 9, y: 9 },
  { x: 8, y: 9 },
  { x: 10, y: 9 },
];

export const cellAt = (x: number, y: number): string => {
  if (y < 0 || y >= ROWS) return "#";
  // Horizontal wrap for the tunnel row
  const wx = ((x % COLS) + COLS) % COLS;
  return LAYOUT[y][wx];
};

/** Can an actor enter this tile? Ghosts may pass the door only while exiting. */
export const isOpen = (x: number, y: number, opts?: { ghostExiting?: boolean }): boolean => {
  const c = cellAt(x, y);
  if (c === "#") return false;
  if (c === "=" || c === "G") return !!opts?.ghostExiting;
  return true;
};

/** Initial seed sets, as tile indices y * COLS + x. */
export const buildSeeds = () => {
  const seeds = new Set<number>();
  const powers = new Set<number>();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = LAYOUT[y][x];
      if (c === ".") seeds.add(y * COLS + x);
      if (c === "o") powers.add(y * COLS + x);
    }
  }
  return { seeds, powers };
};

export const TOTAL_SEEDS = buildSeeds().seeds.size + buildSeeds().powers.size;
