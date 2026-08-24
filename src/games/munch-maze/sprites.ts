// Sprite loading for Munch Maze. All art is AI-generated on solid magenta
// (project rule: no programmatic canvas art) — we chroma-key the magenta out
// and slice sheets into frames at runtime. Track-A games are same-origin,
// so canvas readback is allowed (no data-URI trick needed here).

const ART = "/assets/games/munch-maze";

export interface MunchSprites {
  muncherOpen: HTMLCanvasElement;
  muncherClosed: HTMLCanvasElement;
  /** Indexed by ghost id: terracotta, olive, mustard, brown */
  ghosts: HTMLCanvasElement[];
  scared: HTMLCanvasElement;
  seed: HTMLCanvasElement;
  acorn: HTMLCanvasElement;
  berry: HTMLCanvasElement;
  hedge: HTMLCanvasElement;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });

/** Remove the solid magenta key, in place. */
const chromaKey = (data: ImageData) => {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (r > 150 && b > 150 && g < 120) {
      px[i + 3] = 0;
    } else if (r > 120 && b > 120 && g < r - 40 && g < b - 40) {
      // soften anti-aliased magenta fringe
      px[i + 3] = Math.min(px[i + 3], 90);
    }
  }
};

const toCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};

/**
 * Slice a keyed sheet into `count` frames. Prefers real transparent gaps
 * between frames; falls back to equal columns if detection disagrees.
 */
const sliceSheet = (img: HTMLImageElement, count: number): HTMLCanvasElement[] => {
  const sheet = toCanvas(img.width, img.height);
  const ctx = sheet.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, sheet.width, sheet.height);
  chromaKey(data);
  ctx.putImageData(data, 0, 0);

  // Column opacity histogram
  const opaque = new Array<boolean>(sheet.width).fill(false);
  for (let x = 0; x < sheet.width; x++) {
    for (let y = 0; y < sheet.height; y++) {
      if (data.data[(y * sheet.width + x) * 4 + 3] > 24) {
        opaque[x] = true;
        break;
      }
    }
  }

  // Runs of opaque columns, merging gaps smaller than ~1.5% of the sheet
  const minGap = Math.max(4, Math.floor(sheet.width * 0.015));
  const segments: Array<[number, number]> = [];
  let start = -1;
  let gap = 0;
  for (let x = 0; x <= sheet.width; x++) {
    const on = x < sheet.width && opaque[x];
    if (on) {
      if (start === -1) start = x;
      gap = 0;
    } else if (start !== -1) {
      gap++;
      if (gap >= minGap || x === sheet.width) {
        segments.push([start, x - gap + 1]);
        start = -1;
        gap = 0;
      }
    }
  }

  const ranges: Array<[number, number]> =
    segments.length === count
      ? segments
      : Array.from({ length: count }, (_, i) => [
          Math.floor((i * sheet.width) / count),
          Math.floor(((i + 1) * sheet.width) / count),
        ]);

  return ranges.map(([x0, x1]) => {
    // Trim each frame to its opaque bounding box
    const w = x1 - x0;
    const region = ctx.getImageData(x0, 0, Math.max(1, w), sheet.height);
    let minX = region.width, maxX = -1, minY = region.height, maxY = -1;
    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        if (region.data[(y * region.width + x) * 4 + 3] > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      return toCanvas(2, 2); // empty frame — keyed to nothing
    }
    const frame = toCanvas(maxX - minX + 1, maxY - minY + 1);
    frame
      .getContext("2d")!
      .putImageData(
        ctx.getImageData(x0 + minX, minY, maxX - minX + 1, maxY - minY + 1),
        0,
        0,
      );
    return frame;
  });
};

export const loadSprites = async (): Promise<MunchSprites> => {
  const [muncherImg, ghostsImg, itemsImg, hedgeImg] = await Promise.all([
    loadImage(`${ART}/muncher.png`),
    loadImage(`${ART}/ghosts.png`),
    loadImage(`${ART}/items.png`),
    loadImage(`${ART}/hedge.png`),
  ]);

  const muncher = sliceSheet(muncherImg, 2);
  const ghostFrames = sliceSheet(ghostsImg, 5);
  const items = sliceSheet(itemsImg, 3);

  // Downscale the hedge texture into a small pattern tile
  const hedge = toCanvas(96, 96);
  hedge.getContext("2d")!.drawImage(hedgeImg, 0, 0, 96, 96);

  return {
    muncherOpen: muncher[0],
    muncherClosed: muncher[1],
    ghosts: ghostFrames.slice(0, 4),
    scared: ghostFrames[4],
    seed: items[0],
    acorn: items[1],
    berry: items[2],
    hedge,
  };
};
