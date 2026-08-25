// The Undervault sprite loader. Every sheet is a magenta GIF on a fixed
// grid with a 4 px inset on each cell edge, so the pixels are recovered by
// arithmetic rather than by column histograms.
//
// The packer that built this set inserted those 4 px insets at a fixed
// pitch into art that was drawn as a continuous frieze. Colour continuity
// across each gutter proves it: on monsters.gif the columns either side of
// the cut are closer to each other than two neighbouring columns inside a
// body, so nothing was painted over, the strip was spread apart. The fix is
// to close the gutters back up ("content space") and cut subjects by their
// own measured bands.
//
// Where the manifest and the pixels disagree, the pixels win:
//   - monsters.gif ships ELEVEN families, not twelve. There is no vault
//     leech. The eleven run: bone porter, candle wraith, root brute, sewer
//     beetle, salt mummy, rust automaton, mole knight, fungal pilgrim, ash
//     harpy, oracle mask, coal salamander.
//   - portraits.gif ships SEVEN busts, not eight. The eighth declared role
//     is absent; the four player portraits and the merchant are all there.
//   - bosses.gif, icons.gif, events.gif, and ui-panels.gif match their
//     declared grids once the gutters are closed.
// art-manifest.json is left untouched on purpose. This comment is the
// correction.

import {
  EQUIPMENT_ICONS,
  EVENT_CARDS,
  PANEL_SKINS,
  RELIC_ICONS,
  SITE_ICONS,
  STATUS_ICONS,
  type EquipmentIcon,
  type EventCard,
  type PanelSkin,
  type RelicIcon,
  type SiteIcon,
  type StatusIcon,
} from "./content.ts";

const ASSETS = "/assets/games/the-undervault";

/** Content space x splits between subjects, measured off the sheets. */
const MONSTER_SPLITS = [62, 121, 188, 246, 302, 367, 432, 492, 551, 607];
const BOSS_SPLITS = [105, 215, 312, 408];
const PORTRAIT_SPLITS = [77, 151, 220, 290, 357, 433];

export const MONSTER_FAMILIES = MONSTER_SPLITS.length + 1;
export const BOSS_COUNT = BOSS_SPLITS.length + 1;
export const PORTRAIT_COUNT = PORTRAIT_SPLITS.length + 1;

export interface UndervaultSprites {
  /** [family][idle, move, hit, attack] */
  monsters: HTMLCanvasElement[][];
  /** [boss][idle, attack, hit-defeat] */
  bosses: HTMLCanvasElement[][];
  /** [person][default, variant] */
  portraits: HTMLCanvasElement[][];
  equipment: Record<EquipmentIcon, HTMLCanvasElement>;
  relics: Record<RelicIcon, HTMLCanvasElement>;
  statuses: Record<StatusIcon, HTMLCanvasElement>;
  sites: Record<SiteIcon, HTMLCanvasElement>;
  events: Record<EventCard, HTMLCanvasElement>;
  /** [skin][plain, selected] */
  panels: Record<PanelSkin, HTMLCanvasElement[]>;
  /** One per depth region, in FLOORS order. */
  depths: HTMLImageElement[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Sheet {
  ctx: CanvasRenderingContext2D;
  file: string;
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });

const toCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/**
 * Hard key on the pure magenta field, then despill. These are palettised
 * GIFs, so the halo is a dithered ring of purples rather than a smooth
 * alpha ramp. A strong magenta cast is halo and goes; a weak one is a
 * palette entry with a violet lean and only loses the lean, which also
 * keeps the banned purple out of the frame.
 */
const chromaKey = (data: ImageData) => {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (px[i + 3] === 0 || (r > 150 && b > 150 && g < 120)) {
      px[i + 3] = 0;
      continue;
    }
    const spill = Math.min(r, b) - g;
    if (spill > 60) {
      px[i + 3] = 0;
    } else if (spill > 0) {
      px[i] = r - spill;
      px[i + 2] = b - spill;
    }
  }
};

/**
 * Key the sheet, then repack it with every 4 px inset removed, so subjects
 * that the packer split across a gutter become whole again.
 */
const contentSheet = (img: HTMLImageElement, file: string, cols: number, rows: number): Sheet => {
  if (img.width % cols !== 0 || img.height % rows !== 0) {
    throw new Error(`${file} is ${img.width}x${img.height}, not divisible by ${cols}x${rows}`);
  }
  const gridW = img.width / cols;
  const gridH = img.height / rows;
  if (gridW <= 8 || gridH <= 8) throw new Error(`${file} cells are too small to unpack`);

  const keyed = toCanvas(img.width, img.height);
  const keyedCtx = keyed.getContext("2d")!;
  keyedCtx.drawImage(img, 0, 0);
  const data = keyedCtx.getImageData(0, 0, keyed.width, keyed.height);
  chromaKey(data);
  keyedCtx.putImageData(data, 0, 0);

  const cellW = gridW - 8;
  const cellH = gridH - 8;
  const packed = toCanvas(cellW * cols, cellH * rows);
  const ctx = packed.getContext("2d")!;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.drawImage(
        keyed,
        col * gridW + 4,
        row * gridH + 4,
        cellW,
        cellH,
        col * cellW,
        row * cellH,
        cellW,
        cellH,
      );
    }
  }
  return { ctx, file, cellW, cellH, cols, rows };
};

/** Opaque bounds inside a rect, in rect-local pixels. Throws when empty. */
const bounds = (sheet: Sheet, rect: Rect, label: string): Rect => {
  const data = sheet.ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  let minX = rect.w;
  let minY = rect.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      if (data.data[(y * rect.w + x) * 4 + 3] <= 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`${sheet.file} ${label} is blank`);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

const cut = (sheet: Sheet, rect: Rect): HTMLCanvasElement => {
  const out = toCanvas(rect.w, rect.h);
  out.getContext("2d")!.putImageData(sheet.ctx.getImageData(rect.x, rect.y, rect.w, rect.h), 0, 0);
  return out;
};

/**
 * One subject's frames, cropped by a single shared rect so a state swap
 * cannot jog the sprite on its cell.
 */
const cutBand = (sheet: Sheet, x0: number, x1: number, index: number): HTMLCanvasElement[] => {
  const width = x1 - x0;
  let left = width;
  let right = -1;
  let top = sheet.cellH;
  let bottom = -1;
  for (let row = 0; row < sheet.rows; row++) {
    const b = bounds(
      sheet,
      { x: x0, y: row * sheet.cellH, w: width, h: sheet.cellH },
      `band ${index + 1} row ${row + 1}`,
    );
    left = Math.min(left, b.x);
    right = Math.max(right, b.x + b.w);
    top = Math.min(top, b.y);
    bottom = Math.max(bottom, b.y + b.h);
  }
  return Array.from({ length: sheet.rows }, (_, row) =>
    cut(sheet, {
      x: x0 + left,
      y: row * sheet.cellH + top,
      w: right - left,
      h: bottom - top,
    }),
  );
};

const bands = (splits: number[], width: number): [number, number][] => {
  const edges = [0, ...splits, width];
  return edges.slice(0, -1).map((x0, i) => [x0, edges[i + 1]] as [number, number]);
};

/** Every cell trimmed to its own art. Used where the grid is honest. */
const cutCells = (sheet: Sheet): HTMLCanvasElement[] => {
  const out: HTMLCanvasElement[] = [];
  for (let row = 0; row < sheet.rows; row++) {
    for (let col = 0; col < sheet.cols; col++) {
      const cell = { x: col * sheet.cellW, y: row * sheet.cellH, w: sheet.cellW, h: sheet.cellH };
      const b = bounds(sheet, cell, `cell r${row + 1}c${col + 1}`);
      out.push(cut(sheet, { x: cell.x + b.x, y: cell.y + b.y, w: b.w, h: b.h }));
    }
  }
  return out;
};

const byName = <T extends string>(names: readonly T[], frames: HTMLCanvasElement[]) => {
  const out = {} as Record<T, HTMLCanvasElement>;
  names.forEach((name, i) => {
    out[name] = frames[i];
  });
  return out;
};

const DEPTH_FILES = [
  "depth-gatehouse.jpg",
  "depth-ossuary.jpg",
  "depth-fungal-cistern.jpg",
  "depth-buried-court.jpg",
  "depth-deep-mechanism.jpg",
];

export const loadSprites = async (): Promise<UndervaultSprites> => {
  const [monsterImg, bossImg, portraitImg, iconImg, eventImg, panelImg, ...depths] =
    await Promise.all([
      loadImage(`${ASSETS}/monsters.gif`),
      loadImage(`${ASSETS}/bosses.gif`),
      loadImage(`${ASSETS}/portraits.gif`),
      loadImage(`${ASSETS}/icons.gif`),
      loadImage(`${ASSETS}/events.gif`),
      loadImage(`${ASSETS}/ui-panels.gif`),
      ...DEPTH_FILES.map((file) => loadImage(`${ASSETS}/${file}`)),
    ]);

  const monsterSheet = contentSheet(monsterImg, "monsters.gif", 12, 4);
  const bossSheet = contentSheet(bossImg, "bosses.gif", 5, 3);
  const portraitSheet = contentSheet(portraitImg, "portraits.gif", 8, 2);
  const iconSheet = contentSheet(iconImg, "icons.gif", 8, 4);
  const eventSheet = contentSheet(eventImg, "events.gif", 3, 2);
  const panelSheet = contentSheet(panelImg, "ui-panels.gif", 5, 2);

  const monsterWidth = monsterSheet.cellW * monsterSheet.cols;
  const bossWidth = bossSheet.cellW * bossSheet.cols;
  const portraitWidth = portraitSheet.cellW * portraitSheet.cols;

  const icons = cutCells(iconSheet);
  const panelCells = cutCells(panelSheet);

  return {
    monsters: bands(MONSTER_SPLITS, monsterWidth).map(([a, b], i) => cutBand(monsterSheet, a, b, i)),
    bosses: bands(BOSS_SPLITS, bossWidth).map(([a, b], i) => cutBand(bossSheet, a, b, i)),
    portraits: bands(PORTRAIT_SPLITS, portraitWidth).map(([a, b], i) =>
      cutBand(portraitSheet, a, b, i),
    ),
    equipment: byName(EQUIPMENT_ICONS, icons.slice(0, 8)),
    relics: byName(RELIC_ICONS, icons.slice(8, 16)),
    statuses: byName(STATUS_ICONS, icons.slice(16, 24)),
    sites: byName(SITE_ICONS, icons.slice(24, 32)),
    events: byName(EVENT_CARDS, cutCells(eventSheet)),
    panels: Object.fromEntries(
      PANEL_SKINS.map((name, i) => [name, [panelCells[i], panelCells[i + PANEL_SKINS.length]]]),
    ) as Record<PanelSkin, HTMLCanvasElement[]>,
    depths,
  };
};
