// Run 'n Gunner sprite pipeline. Fixed generated cells protect draw anchors.

import type { WeaponId } from "./stages.ts";

const ASSETS = "/assets/games/run-n-gunner";

export interface GunnerSprites {
  soldierFrames: HTMLCanvasElement[];
  runnerFrames: HTMLCanvasElement[];
  turretFrames: HTMLCanvasElement[];
  lobberFrames: HTMLCanvasElement[];
  droneFrames: HTMLCanvasElement[];
  bossFrames: HTMLCanvasElement[][];
  backdrops: HTMLCanvasElement[];
  bolt: HTMLCanvasElement;
  orb: HTMLCanvasElement;
  grenade: HTMLCanvasElement;
  burst: HTMLCanvasElement;
  muzzle: HTMLCanvasElement;
  pickups: Record<WeaponId, HTMLCanvasElement>;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });

const toCanvas = (w: number, h: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  return canvas;
};

const chromaKey = (data: ImageData) => {
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r > 150 && b > 150 && g < 120) {
      pixels[i + 3] = 0;
    } else if (r > 120 && b > 120 && g < r - 40 && g < b - 40) {
      pixels[i + 3] = Math.min(pixels[i + 3], 90);
    }
  }
};

const trim = (source: HTMLCanvasElement) => {
  const ctx = source.getContext("2d")!;
  const data = ctx.getImageData(0, 0, source.width, source.height);
  let minX = source.width, maxX = -1, minY = source.height, maxY = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (data.data[(y * source.width + x) * 4 + 3] <= 24) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return toCanvas(2, 2);
  const frame = toCanvas(maxX - minX + 1, maxY - minY + 1);
  frame.getContext("2d")!.putImageData(
    ctx.getImageData(minX, minY, frame.width, frame.height),
    0,
    0,
  );
  return frame;
};

const normalizeFootAnchors = (frames: HTMLCanvasElement[]) => {
  const width = Math.max(...frames.map((frame) => frame.width));
  const height = Math.max(...frames.map((frame) => frame.height));
  return frames.map((frame) => {
    const normalized = toCanvas(width, height);
    normalized.getContext("2d")!.drawImage(frame, Math.round((width - frame.width) / 2), height - frame.height);
    return normalized;
  });
};

const sliceGrid = (img: HTMLImageElement, cols: number, rows = 1, inset = 0) => {
  if (img.width % cols !== 0 || img.height % rows !== 0) {
    throw new Error(`Sprite sheet must use an exact ${cols}x${rows} grid: ${img.src}`);
  }
  const keyed = toCanvas(img.width, img.height);
  const ctx = keyed.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, keyed.width, keyed.height);
  chromaKey(data);
  ctx.putImageData(data, 0, 0);

  const cellWidth = keyed.width / cols;
  const cellHeight = keyed.height / rows;
  const frames: HTMLCanvasElement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellWidth + inset;
      const x1 = (col + 1) * cellWidth - inset;
      const y0 = row * cellHeight + inset;
      const y1 = (row + 1) * cellHeight - inset;
      const cell = toCanvas(x1 - x0, y1 - y0);
      cell.getContext("2d")!.putImageData(ctx.getImageData(x0, y0, cell.width, cell.height), 0, 0);
      frames.push(trim(cell));
    }
  }
  return frames;
};

const triplets = (frames: HTMLCanvasElement[]) =>
  Array.from({ length: frames.length / 3 }, (_, index) =>
    normalizeFootAnchors(frames.slice(index * 3, index * 3 + 3)),
  );

export const loadSprites = async (): Promise<GunnerSprites> => {
  const [gunnerImg, enemyImg, bossImg, backdropImg, fxImg, pickupsImg] = await Promise.all([
    loadImage(`${ASSETS}/gunner-sheet.png`),
    loadImage(`${ASSETS}/enemy-sheet.png`),
    loadImage(`${ASSETS}/boss-sheet.png`),
    loadImage(`${ASSETS}/stage-backdrops.png`),
    loadImage(`${ASSETS}/fx.png`),
    loadImage(`${ASSETS}/pickups.png`),
  ]);
  const soldierFrames = normalizeFootAnchors(sliceGrid(gunnerImg, 6, 1, 4));
  const enemyFrames = triplets(sliceGrid(enemyImg, 6, 2, 4));
  const bossFrames = triplets(sliceGrid(bossImg, 6, 3, 4));
  const fx = sliceGrid(fxImg, 5);
  const pickups = sliceGrid(pickupsImg, 3);
  return {
    soldierFrames,
    runnerFrames: enemyFrames[0],
    turretFrames: enemyFrames[1],
    lobberFrames: enemyFrames[2],
    droneFrames: enemyFrames[3],
    bossFrames,
    backdrops: sliceGrid(backdropImg, 3),
    bolt: fx[0],
    orb: fx[1],
    grenade: fx[2],
    burst: fx[3],
    muzzle: fx[4],
    pickups: { rifle: pickups[0], fan: pickups[0], raker: pickups[1], slug: pickups[2] },
  };
};
