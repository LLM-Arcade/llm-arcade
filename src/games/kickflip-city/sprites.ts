// Kickflip City sprites. Exact-grid slicer over the magenta GIF sheets, with
// the despill chromaKey the last two cabinets use. The browser Image loader and
// the canvas key a GIF exactly as they key a PNG.
//
// The transparent motion and crowd sheets keep their full normalized cells;
// collision art and effects are trimmed to their own content.
//
// Most cells carry a narrow sliver of the previous cell's art against their
//     left inset. A trim that swallowed it would drag a neighbour into every
//     sprite, so a leading run that starts on the inset is dropped whenever real
//     content follows it.

import { BACKDROPS, type GrindKind, type ObstacleKind, type PropKind } from "./course.ts";

const ASSETS = "/assets/games/kickflip-city";

export const MOTION_STATES = [
  "coast",
  "push-plant",
  "push-extend",
  "push-recover",
  "crouch",
  "pop",
  "ollie-rise",
  "ollie-apex",
  "kickflip-start",
  "kickflip-under",
  "heelflip-under",
  "catch",
  "grab",
  "grind",
  "bail-air",
  "bail-ground",
] as const;
export type MotionState = (typeof MOTION_STATES)[number];

export type PropArtName = GrindKind | ObstacleKind | PropKind | "curb-ramp" | "stairs";

/**
 * props-obstacles.gif rows 1 and 3, in sheet order. Row 2 holds worn variants
 * of row 1. Verified against the pixels: the manifest's row order is correct
 * for all three rows.
 */
const PROP_ROW_1: PropArtName[] = [
  "rail",
  "ledge",
  "bench",
  "curb-ramp",
  "planter",
  "cone",
  "stairs",
  "crate",
];
const PROP_ROW_3: PropArtName[] = [
  "steps-sign",
  "awning",
  "vent",
  "lamp",
  "bin",
  "puddle",
  "poster-frame",
  "barrier",
];

/**
 * pickups-fx-ui.gif row 2, mapped by eye. The manifest lists six names
 * ("landing, grind, ollie, dust, streak and combo FX") for eight cells and not
 * in sheet order, so these are the drawn motifs: a star swoosh, an orange
 * burst, sparks off a rail, a board with a spin arrow, a dust cloud, a speed
 * streak, a star burst and a droplet.
 */
export const FX_NAMES = [
  "combo-swoosh",
  "impact-burst",
  "grind-sparks",
  "flip-spin",
  "dust-puff",
  "speed-streak",
  "combo-star",
  "splash-drop",
] as const;
export type FxArtName = (typeof FX_NAMES)[number];

/** pickups-fx-ui.gif row 3, matching the manifest. */
export const UI_NAMES = [
  "pause",
  "replay",
  "camera",
  "access",
  "checkpoint",
  "trophy",
  "sun",
  "cloud",
] as const;
export type UiName = (typeof UI_NAMES)[number];

/** Authored magenta inset on every other sheet. */
const CELL_INSET = 4;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkaterMotionArt {
  frames: Record<MotionState, HTMLCanvasElement>;
  /** Transparent space below the pose, as a fraction of its source cell. */
  bottomInsets: Record<MotionState, number>;
}

export interface KickflipSprites {
  /** Sixteen authored motion poses per district skater. */
  skaterMotion: SkaterMotionArt[];
  /** [group][idle, anticipate, cheer, celebrate] */
  crowd: HTMLCanvasElement[][];
  /** Clean and worn collision-backed prop sets. */
  propSets: Record<PropArtName, HTMLCanvasElement>[];
  fx: Record<FxArtName, HTMLCanvasElement>;
  ui: Record<UiName, HTMLCanvasElement>;
  /** Twelve opaque panoramas shared by the twenty-four districts. */
  districts: HTMLImageElement[];
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
    // Despill. An anti-aliased edge blends the sprite color with the key and
    // reads as a purple halo over the warm lane, a banned color here, so the
    // magenta component is removed rather than kept at partial alpha. No
    // palette color has min(r, b) above g, so authored pixels pass through.
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

/**
 * The whole sheet keyed once. Throws on a sheet the grid does not divide
 * evenly, so a bad regeneration fails loudly at load instead of drawing
 * sliced-through art.
 */
const keyedSheet = (img: HTMLImageElement, file: string, cols: number, rows: number) => {
  if (img.width % cols !== 0 || img.height % rows !== 0) {
    throw new Error(`${file} is ${img.width}x${img.height}, not divisible by ${cols}x${rows}`);
  }
  const sheet = toCanvas(img.width, img.height);
  const ctx = sheet.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, sheet.width, sheet.height);
  chromaKey(data);
  ctx.putImageData(data, 0, 0);
  const w = img.width / cols;
  const h = img.height / rows;
  const cells: Rect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) cells.push({ x: col * w, y: row * h, w, h });
  }
  return { ctx, cells, file, cols };
};

type Sheet = ReturnType<typeof keyedSheet>;

/** Opaque-pixel counts per column and per row inside one cell. */
const runsOf = (counts: number[], minPixels: number, mergeGap: number) => {
  const runs: [number, number][] = [];
  let start: number | null = null;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] >= minPixels) {
      if (start === null) start = i;
    } else if (start !== null) {
      runs.push([start, i - 1]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, counts.length - 1]);

  const merged: [number, number][] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run[0] - last[1] - 1 <= mergeGap) last[1] = run[1];
    else merged.push([run[0], run[1]]);
  }
  return merged;
};

const MIN_PIXELS = 2; // ignores single stray marks the generator left in a cell
const MERGE_GAP = 3; // px of magenta inside one object, an arm away from a torso

/** Art bounds inside one cell, in cell-local px. Throws on a blank cell. */
const bounds = (sheet: Sheet, index: number): Rect => {
  const cell = sheet.cells[index];
  const data = sheet.ctx.getImageData(cell.x, cell.y, cell.w, cell.h);
  const alphaAt = (x: number, y: number) => data.data[(y * cell.w + x) * 4 + 3] > 24;

  const columns: number[] = [];
  for (let x = 0; x < cell.w; x++) {
    let n = 0;
    for (let y = 0; y < cell.h; y++) if (alphaAt(x, y)) n++;
    columns.push(n);
  }
  let spans = runsOf(columns, MIN_PIXELS, MERGE_GAP);
  if (spans.length > 1 && spans[0][0] === CELL_INSET) spans = spans.slice(1);
  if (spans.length === 0) throw new Error(`${sheet.file} cell ${index + 1} is blank`);
  const x0 = spans[0][0];
  const x1 = spans[spans.length - 1][1];

  const rows: number[] = [];
  for (let y = 0; y < cell.h; y++) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (alphaAt(x, y)) n++;
    rows.push(n);
  }
  const vertical = runsOf(rows, MIN_PIXELS, MERGE_GAP);
  if (vertical.length === 0) throw new Error(`${sheet.file} cell ${index + 1} is blank`);
  const y0 = vertical[0][0];
  const y1 = vertical[vertical.length - 1][1];

  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

const cut = (sheet: Sheet, index: number, crop: Rect): HTMLCanvasElement => {
  const cell = sheet.cells[index];
  const out = toCanvas(crop.w, crop.h);
  out
    .getContext("2d")!
    .putImageData(sheet.ctx.getImageData(cell.x + crop.x, cell.y + crop.y, crop.w, crop.h), 0, 0);
  return out;
};

/** Each cell trimmed to its own art. */
const cutEach = (sheet: Sheet): HTMLCanvasElement[] =>
  sheet.cells.map((_, i) => cut(sheet, i, bounds(sheet, i)));

/** Cells cut on a fixed interior rect, for a sheet whose inset is not clean. */
const cutInterior = (sheet: Sheet, inset: number): HTMLCanvasElement[] =>
  sheet.cells.map((cell, i) =>
    cut(sheet, i, { x: inset, y: inset, w: cell.w - inset * 2, h: cell.h - inset * 2 }),
  );

const byName = <T extends string, Value>(names: readonly T[], values: Value[]) => {
  const out = {} as Record<T, Value>;
  names.forEach((name, i) => {
    out[name] = values[i];
  });
  return out;
};

export const loadSprites = async (): Promise<KickflipSprites> => {
  const [
    civicMotionImg,
    marketMotionImg,
    warehouseMotionImg,
    crowdMotionImg,
    propImg,
    fxImg,
    ...districts
  ] =
    await Promise.all([
      loadImage(`${ASSETS}/skater-motion-civic.png`),
      loadImage(`${ASSETS}/skater-motion-market.png`),
      loadImage(`${ASSETS}/skater-motion-warehouse.png`),
      loadImage(`${ASSETS}/crowd-motion.png`),
      loadImage(`${ASSETS}/props-obstacles.gif`),
      loadImage(`${ASSETS}/pickups-fx-ui.gif`),
      ...BACKDROPS.map((file) => loadImage(`${ASSETS}/${file}`)),
    ]);

  const skaterMotion = [civicMotionImg, marketMotionImg, warehouseMotionImg].map(
    (image, district) => {
      const sheet = keyedSheet(image, `skater-motion-${district}.png`, 4, 4);
      const bottomInsets = sheet.cells.map((cell, index) => {
        const art = bounds(sheet, index);
        return (cell.h - (art.y + art.h)) / cell.h;
      });
      return {
        frames: byName(MOTION_STATES, cutInterior(sheet, 0)),
        bottomInsets: byName(MOTION_STATES, bottomInsets),
      };
    },
  );

  const crowdFrames = cutInterior(keyedSheet(crowdMotionImg, "crowd-motion.png", 4, 4), 0);
  const crowd: HTMLCanvasElement[][] = [];
  for (let column = 0; column < 4; column++) {
    crowd.push([crowdFrames[column], crowdFrames[4 + column], crowdFrames[8 + column], crowdFrames[12 + column]]);
  }

  const propFrames = cutEach(keyedSheet(propImg, "props-obstacles.gif", 8, 3));
  const propSets = [0, 8].map((rowStart) => {
    const props = {} as Record<PropArtName, HTMLCanvasElement>;
    PROP_ROW_1.forEach((name, i) => {
      props[name] = propFrames[rowStart + i];
    });
    PROP_ROW_3.forEach((name, i) => {
      props[name] = propFrames[16 + i];
    });
    return props;
  });

  const fxFrames = cutEach(keyedSheet(fxImg, "pickups-fx-ui.gif", 8, 3));

  return {
    skaterMotion,
    crowd,
    propSets,
    fx: byName(FX_NAMES, fxFrames.slice(8, 16)),
    ui: byName(UI_NAMES, fxFrames.slice(16, 24)),
    districts,
  };
};
