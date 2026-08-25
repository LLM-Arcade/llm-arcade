// Brickstorm board data. DOM-free so the node harness can import it.
// Material indices are the bricks.png column order and never move.

export const LAYOUT_COLS = 8;
export const LAYOUT_ROWS = 6;

export interface MaterialDef {
  /** layout character */
  char: string;
  name: string;
  /** hit points; also picks the damage row shown as it falls */
  hp: number;
}

/** Index equals the bricks.png column. */
export const MATERIALS: MaterialDef[] = [
  { char: "t", name: "pottery tile", hp: 1 },
  { char: "g", name: "olive glass", hp: 1 },
  { char: "f", name: "kiln firebrick", hp: 3 },
  { char: "p", name: "cream plaster", hp: 2 },
  { char: "m", name: "mustard mosaic", hp: 2 },
  { char: "b", name: "charcoal basalt", hp: 4 },
];

export interface BoardDef {
  id: string;
  name: string;
  envFile: string;
  /** paddles.png row for this board */
  paddleRow: number;
  /** LAYOUT_ROWS strings of LAYOUT_COLS chars; "." is empty */
  rows: string[];
}

export const BOARDS: BoardDef[] = [
  {
    id: "pottery-workshop",
    name: "POTTERY WORKSHOP",
    envFile: "board-pottery-workshop.jpg",
    paddleRow: 0,
    rows: [
      "..pffp..",
      "ttpffptt",
      "ttpffptt",
      "tttppttt",
      ".tttttt.",
      "..tttt..",
    ],
  },
  {
    id: "olive-greenhouse",
    name: "OLIVE GREENHOUSE",
    envFile: "board-olive-greenhouse.jpg",
    paddleRow: 1,
    rows: [
      "gm.mm.mg",
      "mggppggm",
      ".gmppmg.",
      "mggppggm",
      "gm.mm.mg",
      "..pmmp..",
    ],
  },
  {
    id: "terracotta-kiln",
    name: "TERRACOTTA KILN",
    envFile: "board-terracotta-kiln.jpg",
    paddleRow: 2,
    rows: [
      "bffbbffb",
      "fbffffbf",
      "ffbmmbff",
      ".fbmmbf.",
      "..ffff..",
      "..bbbb..",
    ],
  },
];

const CHAR_TO_MATERIAL = new Map(MATERIALS.map((m, i) => [m.char, i]));

/** Material index for a layout character, or null for an empty cell. */
export const materialAt = (char: string): number | null => {
  const idx = CHAR_TO_MATERIAL.get(char);
  return idx === undefined ? null : idx;
};

export interface BrickSlot {
  col: number;
  row: number;
  material: number;
  hp: number;
}

/** Flatten a board layout into placement order: top row first, left to right. */
export const brickSlots = (board: BoardDef): BrickSlot[] => {
  const slots: BrickSlot[] = [];
  for (let row = 0; row < LAYOUT_ROWS; row++) {
    const line = board.rows[row];
    if (line.length !== LAYOUT_COLS) {
      throw new Error(`${board.id} row ${row} is ${line.length} chars, expected ${LAYOUT_COLS}`);
    }
    for (let col = 0; col < LAYOUT_COLS; col++) {
      const material = materialAt(line[col]);
      if (material === null) continue;
      slots.push({ col, row, material, hp: MATERIALS[material].hp });
    }
  }
  return slots;
};
