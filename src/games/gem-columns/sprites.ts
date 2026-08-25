// Gem Columns sprites. Exact-grid slicer: every sheet is authored on a fixed
// magenta grid with each subject centered inside its own 100 px cell, so a
// cell is cut whole by arithmetic. No bbox trim and no family normalization,
// because the size difference between the normal and pulse rows is the
// authored animation and trimming would erase it.
// Numbers below mirror public/assets/games/gem-columns/art-manifest.json.

const ASSETS = "/assets/games/gem-columns";

/**
 * Detached fragments to wipe, in cell-local pixels over full-height or
 * full-width bands. Several authored cells carry a stray chip near a cell
 * edge (a leaf beside the next-triad frame, a chip beside the droplet
 * heart) that reads as floating debris at tile scale. Component analysis
 * located each one; authored scatter such as cracked crumble and
 * clear-state bursts is untouched.
 */
const ERASE: Record<string, { cell: number; x0: number; x1: number }[]> = {
  "gems-set-a.png": [{ cell: 6, x0: 0, x1: 9 }],
  "gems-set-b.png": [
    { cell: 1, x0: 0, x1: 16 },
    { cell: 11, x0: 0, x1: 16 },
    { cell: 16, x0: 0, x1: 16 },
    { cell: 21, x0: 0, x1: 16 },
    { cell: 3, x0: 90, x1: 99 },
    { cell: 13, x0: 90, x1: 99 },
    { cell: 18, x0: 90, x1: 99 },
    { cell: 23, x0: 85, x1: 99 },
    { cell: 24, x0: 85, x1: 99 },
  ],
  "ui-states.png": [
    { cell: 1, x0: 0, x1: 17 },
    { cell: 2, x0: 0, x1: 21 },
    { cell: 10, x0: 0, x1: 11 },
  ],
};

export const SPECIAL_NAMES = [
  "wild-medallion",
  "bomb-seed",
  "locked-gem",
  "garbage-block",
  "triad-token",
  "ghost-gem",
  "landing-marker",
  "chain-link",
  "danger-marker",
  "combo-wreath",
  "level-seal",
  "reserve-preview",
] as const;

export const EFFECT_NAMES = [
  "landing-puff",
  "cascade-arc",
  "clear-burst",
  "danger-pulse",
  "level-rays",
  "match-sparkle",
  "crack-chips",
  "lock-break",
  "bomb-ring",
  "garbage-crumble",
  "ghost-dissolve",
  "triad-merge",
] as const;

export const UI_NAMES = [
  "blank-score-plaque",
  "next-triad-frame",
  "reserve-slot",
  "pause-medallion",
  "complete-laurel",
  "danger-meter",
  "chain-counter",
  "foundry-ornament",
  "conservatory-ornament",
  "archive-ornament",
  "restart-medallion",
  "sound-medallion",
] as const;

export type SpecialName = (typeof SPECIAL_NAMES)[number];
export type EffectName = (typeof EFFECT_NAMES)[number];
export type UiName = (typeof UI_NAMES)[number];

/** Row order shared by both gem sheets. */
export const GEM_STATE = {
  normal: 0,
  pulse: 1,
  matched: 2,
  cracked: 3,
  clear: 4,
} as const;

export interface GemColumnsSprites {
  /** [family 0..9][state 0..4]; families 0..4 are sheet A, 5..9 sheet B. */
  gems: HTMLCanvasElement[][];
  specials: Record<SpecialName, HTMLCanvasElement>;
  effects: Record<EffectName, HTMLCanvasElement>;
  ui: Record<UiName, HTMLCanvasElement>;
  /** Opaque panels, one per level, keyed by LevelDef.panel. */
  wells: HTMLCanvasElement[];
  environments: HTMLCanvasElement[];
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

/**
 * Whole cells, row-major, with the magenta key removed. Throws on a sheet the
 * grid does not divide evenly and on a cell that carries no art, so a bad
 * regeneration fails loudly at load instead of drawing blank tiles.
 */
const sliceGrid = (
  img: HTMLImageElement,
  file: string,
  cols: number,
  rows: number,
): HTMLCanvasElement[] => {
  if (img.width % cols !== 0 || img.height % rows !== 0) {
    throw new Error(`${file} is ${img.width}x${img.height}, not divisible by ${cols}x${rows}`);
  }
  const sheet = toCanvas(img.width, img.height);
  const ctx = sheet.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, sheet.width, sheet.height);
  chromaKey(data);
  ctx.putImageData(data, 0, 0);

  const cellW = img.width / cols;
  const cellH = img.height / rows;
  for (const e of ERASE[file] ?? []) {
    const cx = (e.cell % cols) * cellW;
    const cy = Math.floor(e.cell / cols) * cellH;
    ctx.clearRect(cx + e.x0, cy, e.x1 - e.x0 + 1, cellH);
  }
  const frames: HTMLCanvasElement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = ctx.getImageData(col * cellW, row * cellH, cellW, cellH);
      let visible = false;
      for (let i = 3; i < cell.data.length; i += 4) {
        if (cell.data[i] > 24) {
          visible = true;
          break;
        }
      }
      if (!visible) throw new Error(`${file} cell r${row + 1}c${col + 1} is blank`);
      const out = toCanvas(cellW, cellH);
      out.getContext("2d")!.putImageData(cell, 0, 0);
      frames.push(out);
    }
  }
  return frames;
};

/** Opaque strips carry no key, so they are copied by source rect only. */
const sliceStrip = (img: HTMLImageElement, count: number): HTMLCanvasElement[] => {
  const cellW = img.width / count;
  return Array.from({ length: count }, (_, i) => {
    const out = toCanvas(cellW, img.height);
    out.getContext("2d")!.drawImage(img, i * cellW, 0, cellW, img.height, 0, 0, cellW, img.height);
    return out;
  });
};

const byName = <T extends string>(names: readonly T[], frames: HTMLCanvasElement[]) => {
  const out = {} as Record<T, HTMLCanvasElement>;
  names.forEach((name, i) => {
    out[name] = frames[i];
  });
  return out;
};

export const loadSprites = async (): Promise<GemColumnsSprites> => {
  const [setA, setB, specialsImg, effectsImg, uiImg, wellsImg, envImg] = await Promise.all([
    loadImage(`${ASSETS}/gems-set-a.png`),
    loadImage(`${ASSETS}/gems-set-b.png`),
    loadImage(`${ASSETS}/specials.png`),
    loadImage(`${ASSETS}/effects.png`),
    loadImage(`${ASSETS}/ui-states.png`),
    loadImage(`${ASSETS}/well-surrounds.png`),
    loadImage(`${ASSETS}/environment-strip.png`),
  ]);

  const framesA = sliceGrid(setA, "gems-set-a.png", 5, 5);
  const framesB = sliceGrid(setB, "gems-set-b.png", 5, 5);
  // Sheet columns are families and sheet rows are states, so a family's five
  // states are a column read, not a contiguous run.
  const gems: HTMLCanvasElement[][] = [];
  for (const sheet of [framesA, framesB]) {
    for (let col = 0; col < 5; col++) {
      gems.push([0, 1, 2, 3, 4].map((row) => sheet[row * 5 + col]));
    }
  }

  return {
    gems,
    specials: byName(SPECIAL_NAMES, sliceGrid(specialsImg, "specials.png", 4, 3)),
    effects: byName(EFFECT_NAMES, sliceGrid(effectsImg, "effects.png", 4, 3)),
    ui: byName(UI_NAMES, sliceGrid(uiImg, "ui-states.png", 4, 3)),
    wells: sliceStrip(wellsImg, 3),
    environments: sliceStrip(envImg, 3),
  };
};
