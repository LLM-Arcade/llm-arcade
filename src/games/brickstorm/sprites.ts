// Brickstorm sprites. Exact-grid slicer: the sheets are authored on a fixed
// magenta grid, so cells are cut by arithmetic, not by gap detection.
// Numbers below mirror public/assets/games/brickstorm/art-manifest.json.

import { POWER_IDS, type PowerId } from "./engine.ts";

const ASSETS = "/assets/games/brickstorm";

interface SheetSpec {
  file: string;
  cols: number;
  rows: number;
  inset: number;
}

const SHEETS: Record<"paddles" | "ballFx" | "bricks" | "powerups", SheetSpec> = {
  paddles: { file: "paddles.png", cols: 5, rows: 3, inset: 4 },
  ballFx: { file: "ball-fx.png", cols: 8, rows: 3, inset: 4 },
  bricks: { file: "bricks.png", cols: 6, rows: 4, inset: 4 },
  powerups: { file: "powerups-props-ui.png", cols: 8, rows: 3, inset: 4 },
};

const BOARD_FILES = [
  "board-pottery-workshop.jpg",
  "board-olive-greenhouse.jpg",
  "board-terracotta-kiln.jpg",
];

export interface BrickstormSprites {
  /** [board paddle row][idle, move-compress, hit, expanded, damaged] */
  paddleRows: HTMLCanvasElement[][];
  ballSpin: HTMLCanvasElement[];
  ballSpeed: HTMLCanvasElement[];
  fx: {
    impact: HTMLCanvasElement;
    trailA: HTMLCanvasElement;
    trailB: HTMLCanvasElement;
    clear: HTMLCanvasElement;
    crack: HTMLCanvasElement;
    spark: HTMLCanvasElement;
    ember: HTMLCanvasElement;
    dust: HTMLCanvasElement;
  };
  /** [material 0..5][damage row 0..3] */
  bricks: HTMLCanvasElement[][];
  debris: HTMLCanvasElement[];
  groundBurst: HTMLCanvasElement;
  dustBurst: HTMLCanvasElement;
  powerIcons: Record<PowerId, [HTMLCanvasElement, HTMLCanvasElement]>;
  props: {
    jar: HTMLCanvasElement;
    pot: HTMLCanvasElement;
    kilnDoor: HTMLCanvasElement;
    trellis: HTMLCanvasElement;
    badge: HTMLCanvasElement;
    pause: HTMLCanvasElement;
    replay: HTMLCanvasElement;
    sparkle: HTMLCanvasElement;
  };
  boards: HTMLImageElement[];
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });

const chromaKey = (data: ImageData) => {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (r > 150 && b > 150 && g < 120) {
      px[i + 3] = 0;
      continue;
    }
    // Despill. Anti-aliased edges blend the sprite color with the magenta key
    // and read as a purple halo on the dark panel (a banned color here), so
    // remove the magenta component (the amount min(r,b) rises above g) rather
    // than keeping the tinted pixel at partial alpha. None of the palette
    // colors have min(r,b) > g, so authored pixels pass through untouched.
    const spill = Math.min(r, b) - g;
    if (spill > 0) {
      px[i] = r - spill;
      px[i + 2] = b - spill;
      if (spill > 90) px[i + 3] = Math.min(px[i + 3], 140);
    }
  }
};

const toCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

interface Cut {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Sliced {
  ctx: CanvasRenderingContext2D;
  /** row-major: cells[row][col], trimmed to visible pixels */
  cells: Cut[][];
}

const sliceGrid = (img: HTMLImageElement, spec: SheetSpec): Sliced => {
  if (img.width % spec.cols !== 0 || img.height % spec.rows !== 0) {
    throw new Error(
      `${spec.file} is ${img.width}x${img.height}, not divisible by ${spec.cols}x${spec.rows}`,
    );
  }
  const sheet = toCanvas(img.width, img.height);
  const ctx = sheet.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, sheet.width, sheet.height);
  chromaKey(data);
  ctx.putImageData(data, 0, 0);

  const cellW = img.width / spec.cols;
  const cellH = img.height / spec.rows;
  const alphaAt = (x: number, y: number) => data.data[(y * sheet.width + x) * 4 + 3];

  const cells: Cut[][] = [];
  for (let row = 0; row < spec.rows; row++) {
    const line: Cut[] = [];
    for (let col = 0; col < spec.cols; col++) {
      const x0 = col * cellW + spec.inset;
      const y0 = row * cellH + spec.inset;
      const x1 = (col + 1) * cellW - spec.inset;
      const y1 = (row + 1) * cellH - spec.inset;
      let minX = x1, maxX = x0 - 1, minY = y1, maxY = y0 - 1;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (alphaAt(x, y) <= 24) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX) throw new Error(`${spec.file} cell r${row + 1}c${col + 1} is blank`);
      line.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
    cells.push(line);
  }
  return { ctx, cells };
};

/**
 * Paint a set of cuts onto one shared canvas size so frames in the same
 * animation family do not jitter when they swap.
 */
const family = (
  ctx: CanvasRenderingContext2D,
  cuts: Cut[],
  anchor: "center" | "bottom",
): HTMLCanvasElement[] => {
  const maxW = Math.max(...cuts.map((c) => c.w));
  const maxH = Math.max(...cuts.map((c) => c.h));
  return cuts.map((c) => {
    const out = toCanvas(maxW, maxH);
    const dx = Math.round((maxW - c.w) / 2);
    const dy = anchor === "bottom" ? maxH - c.h : Math.round((maxH - c.h) / 2);
    out.getContext("2d")!.putImageData(ctx.getImageData(c.x, c.y, c.w, c.h), dx, dy);
    return out;
  });
};

export const loadSprites = async (): Promise<BrickstormSprites> => {
  const [paddlesImg, ballFxImg, bricksImg, powerupsImg, ...boards] = await Promise.all([
    loadImage(`${ASSETS}/${SHEETS.paddles.file}`),
    loadImage(`${ASSETS}/${SHEETS.ballFx.file}`),
    loadImage(`${ASSETS}/${SHEETS.bricks.file}`),
    loadImage(`${ASSETS}/${SHEETS.powerups.file}`),
    ...BOARD_FILES.map((f) => loadImage(`${ASSETS}/${f}`)),
  ]);

  const paddles = sliceGrid(paddlesImg, SHEETS.paddles);
  const ballFx = sliceGrid(ballFxImg, SHEETS.ballFx);
  const bricks = sliceGrid(bricksImg, SHEETS.bricks);
  const powerups = sliceGrid(powerupsImg, SHEETS.powerups);

  const paddleRows = paddles.cells.map((row) => family(paddles.ctx, row, "bottom"));

  // Spin and speed frames normalize separately: the streaks are much wider
  // than the rolling ball, and one shared canvas would shrink the ball core
  // whenever the streak frame swapped in.
  const ballSpin = family(ballFx.ctx, ballFx.cells[0].slice(0, 4), "center");
  const ballSpeed = family(ballFx.ctx, ballFx.cells[0].slice(4, 8), "center");
  // Effects are unrelated one-shot sprites, not a swap family; each keeps its
  // own trimmed canvas so its draw size means what FX_SIZE says.
  const single = (cut: Cut) => family(ballFx.ctx, [cut], "center")[0];
  const fxRow = ballFx.cells[1].map(single);
  const debrisRow = ballFx.cells[2].map(single);

  // Bricks share one canvas per material column so the damage swap stays put.
  const brickCols: HTMLCanvasElement[][] = [];
  for (let col = 0; col < SHEETS.bricks.cols; col++) {
    brickCols.push(family(bricks.ctx, bricks.cells.map((row) => row[col]), "center"));
  }

  const propRow = powerups.cells[2].map((cut) => family(powerups.ctx, [cut], "center")[0]);

  // POWER_IDS is authored in the same order as row 1 of powerups-props-ui.png.
  // Each icon normalizes with its own pulse variant so the 120 ms swap never
  // changes the drawn size.
  const powerIcons = {} as Record<PowerId, [HTMLCanvasElement, HTMLCanvasElement]>;
  POWER_IDS.forEach((id, i) => {
    const pair = family(powerups.ctx, [powerups.cells[0][i], powerups.cells[1][i]], "center");
    powerIcons[id] = [pair[0], pair[1]];
  });

  return {
    paddleRows,
    ballSpin,
    ballSpeed,
    fx: {
      impact: fxRow[0],
      trailA: fxRow[1],
      trailB: fxRow[2],
      clear: fxRow[3],
      crack: fxRow[4],
      spark: fxRow[5],
      ember: fxRow[6],
      dust: fxRow[7],
    },
    bricks: brickCols,
    debris: debrisRow.slice(0, 6),
    groundBurst: debrisRow[6],
    dustBurst: debrisRow[7],
    powerIcons,
    props: {
      jar: propRow[0],
      pot: propRow[1],
      kilnDoor: propRow[2],
      trellis: propRow[3],
      badge: propRow[4],
      pause: propRow[5],
      replay: propRow[6],
      sparkle: propRow[7],
    },
    boards,
  };
};
