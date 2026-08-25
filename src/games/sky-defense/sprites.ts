// Sky Defense sprites. Exact-grid slicer: every magenta sheet is authored on
// a fixed integer grid, so a cell is cut whole by arithmetic. The despill
// chromaKey is the Gem Columns one, unchanged.
//
// Two cutting modes. A family (the eight aim bearings, the four action
// states, a threat's motion/damage pair, the five building frames) is cropped
// with one shared union rect, so every frame in it keeps its authored
// position relative to the others and a swap cannot jitter. Everything else
// is trimmed to its own art and drawn center-anchored.

const ASSETS = "/assets/games/sky-defense";

export const ACTION_NAMES = ["idle", "fire", "reload", "hit"] as const;

export const EFFECT_NAMES = [
  "interceptor",
  "fast-bolt",
  "small-burst",
  "large-burst",
  "impact-star",
  "debris-cluster",
  "smoke-puff",
  "smoke-column",
  "shield-ring-small",
  "shield-ring-large",
  "repair-ring",
  "warning-chevron",
  "radar-ping",
  "scan-wedge",
  "repair-drone",
  "storm-cloud",
] as const;

/**
 * The real props-ui.png cell order, mapped by eye from the sheet because its
 * manifest entry is wrong past cell 4: the sheet carries six building states
 * (three intact, three damaged), the weather cells sit one later than
 * documented, and the documented reticle/cursor cells hold radar chrome
 * instead. Cells 9 and 14 are decorative leftovers this cabinet never draws.
 */
export const PROP_NAMES = [
  "house-intact",
  "bridge-intact",
  "observatory-intact",
  "house-damaged",
  "bridge-damaged",
  "observatory-damaged",
  "dust-weather",
  "storm-weather",
  "rain-weather",
  "region-frame",
  "radar-station",
  "radar-screen",
  "shield-icon",
  "warning-icon",
  "arc-fragment",
  "repair-tools",
] as const;

export type ActionName = (typeof ACTION_NAMES)[number];
export type EffectName = (typeof EFFECT_NAMES)[number];
export type PropName = (typeof PROP_NAMES)[number];

/** The first six props-ui cells; they normalize as one bottom-center family. */
const BUILDING_CELLS = 6;

/**
 * Several props-ui cells stack a second small motif under or over the main
 * one (measured row runs with a clean gap between them). These cell-local
 * rects are erased after keying so a trim cannot drag the stray motif along.
 */
const PROP_ERASE: { cell: number; y0: number; y1: number }[] = [
  { cell: 4, y0: 34, y1: 52 },
  { cell: 5, y0: 37, y1: 52 },
  { cell: 7, y0: 39, y1: 52 },
  { cell: 11, y0: 30, y1: 52 },
  { cell: 12, y0: 0, y1: 18 },
  { cell: 13, y0: 0, y1: 19 },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Horizon source rects, hardcoded because one manifest entry is wrong.
 * desert-relay-states.png is documented as 3 columns of 120x120. Pixel
 * inspection of the sheet shows its only strong seams run horizontally at
 * y=40 and y=80, so the real layout is 3 rows of 360x40 (intact, damaged,
 * destroyed top to bottom). The other two sheets match their entries:
 * river city is 3 columns of 110x120, mountain is 3 rows of 320x60. The
 * manifest json is left alone on purpose; this comment is the correction.
 */
const HORIZON_RECTS: Rect[][] = [
  [0, 1, 2].map((i) => ({ x: 0, y: i * 40, w: 360, h: 40 })),
  [0, 1, 2].map((i) => ({ x: i * 110, y: 0, w: 110, h: 120 })),
  [0, 1, 2].map((i) => ({ x: 0, y: i * 60, w: 320, h: 60 })),
];

export interface ThreatPair {
  motion: HTMLCanvasElement;
  damage: HTMLCanvasElement;
}

export interface SkyDefenseSprites {
  /** Eight authored bearings, far-left through far-right. */
  aim: HTMLCanvasElement[];
  actions: Record<ActionName, HTMLCanvasElement>;
  /** Indexed by family, matching FAMILIES in waves.ts. */
  threats: ThreatPair[];
  effects: Record<EffectName, HTMLCanvasElement>;
  props: Record<PropName, HTMLCanvasElement>;
  /** [region][health tier] opaque horizon panels. */
  horizons: HTMLCanvasElement[][];
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
    // and read as a purple halo on the warm sky (a banned color here), so
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
  const cells: Rect[] = [];
  const w = img.width / cols;
  const h = img.height / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) cells.push({ x: col * w, y: row * h, w, h });
  }
  return { ctx, cells, file };
};

type Sheet = ReturnType<typeof keyedSheet>;

/** Art bounds inside one cell, in cell-local pixels. Throws on a blank cell. */
const bounds = (sheet: Sheet, cell: Rect, index: number): Rect => {
  const data = sheet.ctx.getImageData(cell.x, cell.y, cell.w, cell.h);
  let minX = cell.w, minY = cell.h, maxX = -1, maxY = -1;
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      if (data.data[(y * cell.w + x) * 4 + 3] <= 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`${sheet.file} cell ${index + 1} is blank`);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

const cut = (sheet: Sheet, cell: Rect, crop: Rect): HTMLCanvasElement => {
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
    const b = bounds(sheet, sheet.cells[i], i);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  const crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return indexes.map((i) => cut(sheet, sheet.cells[i], crop));
};

/** Each cell trimmed to its own art; the caller anchors on the center. */
const cutEach = (sheet: Sheet): HTMLCanvasElement[] =>
  sheet.cells.map((cell, i) => cut(sheet, cell, bounds(sheet, cell, i)));

/** Horizon panels are opaque, so they are copied by source rect with no key. */
const cutStrip = (img: HTMLImageElement, rects: Rect[]): HTMLCanvasElement[] =>
  rects.map((r) => {
    const out = toCanvas(r.w, r.h);
    out.getContext("2d")!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return out;
  });

const byName = <T extends string>(names: readonly T[], frames: HTMLCanvasElement[]) => {
  const out = {} as Record<T, HTMLCanvasElement>;
  names.forEach((name, i) => {
    out[name] = frames[i];
  });
  return out;
};

export const loadSprites = async (): Promise<SkyDefenseSprites> => {
  const [aimImg, actionImg, threatImg, effectImg, propImg, desert, river, mountain] =
    await Promise.all([
      loadImage(`${ASSETS}/battery-aim.png`),
      loadImage(`${ASSETS}/battery-actions.png`),
      loadImage(`${ASSETS}/threats.png`),
      loadImage(`${ASSETS}/effects.png`),
      loadImage(`${ASSETS}/props-ui.png`),
      loadImage(`${ASSETS}/desert-relay-states.png`),
      loadImage(`${ASSETS}/river-city-states.png`),
      loadImage(`${ASSETS}/mountain-observatory-states.png`),
    ]);

  const aimSheet = keyedSheet(aimImg, "battery-aim.png", 8, 1);
  const actionSheet = keyedSheet(actionImg, "battery-actions.png", 4, 1);
  const threatSheet = keyedSheet(threatImg, "threats.png", 4, 4);
  const propSheet = keyedSheet(propImg, "props-ui.png", 4, 4);
  for (const e of PROP_ERASE) {
    const cell = propSheet.cells[e.cell];
    propSheet.ctx.clearRect(cell.x, cell.y + e.y0, cell.w, e.y1 - e.y0);
  }

  // A threat's two cells share one crop so the 120 ms damage swap holds still.
  const threats: ThreatPair[] = [];
  for (let family = 0; family < 8; family++) {
    const [motion, damage] = cutFamily(threatSheet, [family * 2, family * 2 + 1]);
    threats.push({ motion, damage });
  }

  // All six building cells crop as one family so the intact-to-damaged swap
  // cannot shift a building on its ground anchor.
  const buildings = cutFamily(
    propSheet,
    Array.from({ length: BUILDING_CELLS }, (_, i) => i),
  );
  const props = cutEach(propSheet);
  buildings.forEach((frame, i) => {
    props[i] = frame;
  });

  return {
    aim: cutFamily(aimSheet, [0, 1, 2, 3, 4, 5, 6, 7]),
    actions: byName(ACTION_NAMES, cutFamily(actionSheet, [0, 1, 2, 3])),
    threats,
    effects: byName(EFFECT_NAMES, cutEach(keyedSheet(effectImg, "effects.png", 4, 4))),
    props: byName(PROP_NAMES, props),
    horizons: [
      cutStrip(desert, HORIZON_RECTS[0]),
      cutStrip(river, HORIZON_RECTS[1]),
      cutStrip(mountain, HORIZON_RECTS[2]),
    ],
  };
};
