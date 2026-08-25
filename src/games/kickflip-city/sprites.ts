// Kickflip City sprites. Exact-grid slicer over the magenta GIF sheets, with
// the despill chromaKey the last two cabinets use. The browser Image loader and
// the canvas key a GIF exactly as they key a PNG.
//
// Two cutting modes. A family (a skater's rolling poses, a street-life actor's
// three states) shares one crop rect so a frame swap cannot shift the art on
// its anchor. Everything else is trimmed to its own content.
//
// Two things in this pack need handling the grid alone does not describe, both
// measured off the pixels rather than read off the manifest:
//
//  1. Most cells carry a narrow sliver of the previous cell's art against their
//     left inset. A trim that swallowed it would drag a neighbour into every
//     sprite, so a leading run that starts on the inset is dropped whenever real
//     content follows it.
//  2. parallax-weather.gif has a bright one-to-three pixel frame drawn on the
//     magenta inset of every cell. It is not magenta enough for the key and not
//     art, so those cells are cut on a fixed interior rect instead of trimmed.

import type { GrindKind, ObstacleKind, PropKind } from "./course.ts";

const ASSETS = "/assets/games/kickflip-city";

export const SKATER_STATES = ["push", "coast", "ollie"] as const;
export type SkaterState = (typeof SKATER_STATES)[number];

export type PropArtName = GrindKind | ObstacleKind | PropKind | "curb-ramp" | "stairs";

/**
 * props-obstacles.gif rows 1 and 3, in sheet order. Row 2 holds worn variants
 * of row 1 that this cabinet never draws. Verified against the pixels: the
 * manifest's row order is correct for both rows.
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

/**
 * The grind cells draw the rail under the skater and put the board contact
 * about 13 px higher in the cell than the rolling poses do. The rail is erased
 * from this row down so the course's own rail is the only one on screen, and
 * the erase line becomes the pose's board contact.
 */
const GRIND_ERASE: Record<number, number> = { 3: 62, 7: 58 };

/** parallax-weather cells are cut on this inset to clear the drawn frame. */
const PARALLAX_INSET = 7;

/** Authored magenta inset on every other sheet. */
const CELL_INSET = 4;

/** Cell size of skaters.gif; the renderer scales a pose against it. */
export const SKATER_CELL = 80;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkaterArt {
  /** [facing][state], facing 0 is left and 1 is right */
  rolling: Record<SkaterState, HTMLCanvasElement>[];
  grind: HTMLCanvasElement[];
}

export interface KickflipSprites {
  /** One entry per authored skater, indexed by district. */
  skaters: SkaterArt[];
  /** [family][idle, move, reactive] */
  street: HTMLCanvasElement[][];
  props: Record<PropArtName, HTMLCanvasElement>;
  fx: Record<FxArtName, HTMLCanvasElement>;
  ui: Record<UiName, HTMLCanvasElement>;
  /** parallax-weather row 1, the six silhouette tiles */
  silhouettes: HTMLCanvasElement[];
  /** parallax-weather row 2, the six weather overlays */
  weather: HTMLCanvasElement[];
  /** One opaque district panorama per district. */
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

/** One shared crop across the listed cells, so their geometry stays locked. */
const cutFamily = (sheet: Sheet, indexes: number[]): HTMLCanvasElement[] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of indexes) {
    const b = bounds(sheet, i);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  const crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return indexes.map((i) => cut(sheet, i, crop));
};

/** Each cell trimmed to its own art. */
const cutEach = (sheet: Sheet): HTMLCanvasElement[] =>
  sheet.cells.map((_, i) => cut(sheet, i, bounds(sheet, i)));

/** Cells cut on a fixed interior rect, for a sheet whose inset is not clean. */
const cutInterior = (sheet: Sheet, inset: number): HTMLCanvasElement[] =>
  sheet.cells.map((cell, i) =>
    cut(sheet, i, { x: inset, y: inset, w: cell.w - inset * 2, h: cell.h - inset * 2 }),
  );

const byName = <T extends string>(names: readonly T[], frames: HTMLCanvasElement[]) => {
  const out = {} as Record<T, HTMLCanvasElement>;
  names.forEach((name, i) => {
    out[name] = frames[i];
  });
  return out;
};

export const loadSprites = async (): Promise<KickflipSprites> => {
  const [skaterImg, streetImg, propImg, fxImg, parallaxImg, civic, market, roofs] =
    await Promise.all([
      loadImage(`${ASSETS}/skaters.gif`),
      loadImage(`${ASSETS}/street-life.gif`),
      loadImage(`${ASSETS}/props-obstacles.gif`),
      loadImage(`${ASSETS}/pickups-fx-ui.gif`),
      loadImage(`${ASSETS}/parallax-weather.gif`),
      loadImage(`${ASSETS}/district-civic-steps.jpg`),
      loadImage(`${ASSETS}/district-market-underpass.jpg`),
      loadImage(`${ASSETS}/district-warehouse-roofs.jpg`),
    ]);

  const skaterSheet = keyedSheet(skaterImg, "skaters.gif", 3, 8);
  for (const [row, from] of Object.entries(GRIND_ERASE)) {
    const first = skaterSheet.cells[Number(row) * skaterSheet.cols];
    skaterSheet.ctx.clearRect(0, first.y + from, skaterImg.width, first.h - from);
  }

  const skaters: SkaterArt[] = [];
  for (let column = 0; column < 3; column++) {
    const at = (row: number) => row * skaterSheet.cols + column;
    // Push, coast and ollie share one crop per skater so a state or facing swap
    // holds the board still. The grind pose is its own two-cell family because
    // its board contact sits on the erased rail line, not on the wheels.
    const rolling = cutFamily(skaterSheet, [at(0), at(1), at(2), at(4), at(5), at(6)]);
    const grind = cutFamily(skaterSheet, [at(3), at(7)]);
    skaters.push({
      rolling: [
        { push: rolling[0], coast: rolling[1], ollie: rolling[2] },
        { push: rolling[3], coast: rolling[4], ollie: rolling[5] },
      ],
      grind,
    });
  }

  const streetSheet = keyedSheet(streetImg, "street-life.gif", 8, 3);
  const street: HTMLCanvasElement[][] = [];
  for (let column = 0; column < 8; column++) {
    street.push(cutFamily(streetSheet, [column, 8 + column, 16 + column]));
  }

  const propFrames = cutEach(keyedSheet(propImg, "props-obstacles.gif", 8, 3));
  const props = {} as Record<PropArtName, HTMLCanvasElement>;
  PROP_ROW_1.forEach((name, i) => {
    props[name] = propFrames[i];
  });
  PROP_ROW_3.forEach((name, i) => {
    props[name] = propFrames[16 + i];
  });

  const fxFrames = cutEach(keyedSheet(fxImg, "pickups-fx-ui.gif", 8, 3));
  const parallaxSheet = keyedSheet(parallaxImg, "parallax-weather.gif", 6, 2);
  const parallaxFrames = cutInterior(parallaxSheet, PARALLAX_INSET);

  return {
    skaters,
    street,
    props,
    fx: byName(FX_NAMES, fxFrames.slice(8, 16)),
    ui: byName(UI_NAMES, fxFrames.slice(16, 24)),
    silhouettes: parallaxFrames.slice(0, 6),
    weather: parallaxFrames.slice(6, 12),
    districts: [civic, market, roofs],
  };
};
