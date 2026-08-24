// Hyper Circuit sprites. The directional car sheets have a fixed 5 x 2
// contract; the compact FX/stamp sheets retain the local gap-slice helper.

const ASSETS = "/assets/games/hyper-circuit";

export interface HyperSprites {
  roadCars: HTMLCanvasElement[][];
  boost: HTMLCanvasElement;
  spark: HTMLCanvasElement;
  shield: HTMLCanvasElement;
  streak: HTMLCanvasElement;
  rail: HTMLCanvasElement;
  checker: HTMLCanvasElement;
  pad: HTMLCanvasElement;
  terrain: HTMLImageElement;
  horizons: HTMLImageElement[];
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
    // Production sheets are canonicalized to literal #FF00FF before they
    // enter the renderer. Keeping the key exact prevents a broad purple key
    // from eating the car's ink, red lamps, or warm paint details.
    if (r === 255 && g === 0 && b === 255) {
      px[i + 3] = 0;
    }
  }
};

const toCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};

const sliceSheet = (img: HTMLImageElement, count: number): HTMLCanvasElement[] => {
  const sheet = toCanvas(img.width, img.height);
  const ctx = sheet.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, sheet.width, sheet.height);
  chromaKey(data);
  ctx.putImageData(data, 0, 0);

  const opaque = new Array<boolean>(sheet.width).fill(false);
  for (let x = 0; x < sheet.width; x++) {
    for (let y = 0; y < sheet.height; y++) {
      if (data.data[(y * sheet.width + x) * 4 + 3] > 24) {
        opaque[x] = true;
        break;
      }
    }
  }

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
    if (maxX < 0) return toCanvas(2, 2);
    const frame = toCanvas(maxX - minX + 1, maxY - minY + 1);
    frame
      .getContext("2d")!
      .putImageData(ctx.getImageData(x0 + minX, minY, maxX - minX + 1, maxY - minY + 1), 0, 0);
    return frame;
  });
};

// Directional vehicle sheets are authored as columns yaw 0..4 and rows
// base/loaded. The returned order is yaw * 2 + motion, so the renderer never
// depends on whitespace detection or a generator's accidental gaps.
const sliceCarGrid = (img: HTMLImageElement): HTMLCanvasElement[] => {
  if (img.width % 5 !== 0 || img.height % 2 !== 0) {
    throw new Error(`Car sheet must use an exact 5x2 grid: ${img.src}`);
  }
  const sheet = toCanvas(img.width, img.height);
  const ctx = sheet.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, sheet.width, sheet.height);
  chromaKey(data);
  ctx.putImageData(data, 0, 0);

  const frameW = Math.floor(sheet.width / 5);
  const frameH = Math.floor(sheet.height / 2);
  const frames: HTMLCanvasElement[] = [];
  for (let yaw = 0; yaw < 5; yaw++) {
    for (let motion = 0; motion < 2; motion++) {
      const frame = toCanvas(frameW, frameH);
      frame
        .getContext("2d")!
        .putImageData(ctx.getImageData(yaw * frameW, motion * frameH, frameW, frameH), 0, 0);
      frames.push(frame);
    }
  }
  return frames;
};

export const loadSprites = async (): Promise<HyperSprites> => {
  const [
    playerYaw,
    rallyYaw,
    muscleYaw,
    enduranceYaw,
    tunerYaw,
    fxImg,
    stampsImg,
    terrain,
    ...horizons
  ] = await Promise.all([
    loadImage(`${ASSETS}/player-yaw.png`),
    loadImage(`${ASSETS}/rally-yaw.png`),
    loadImage(`${ASSETS}/muscle-yaw.png`),
    loadImage(`${ASSETS}/endurance-yaw.png`),
    loadImage(`${ASSETS}/tuner-yaw.png`),
    loadImage(`${ASSETS}/fx-road.png`),
    loadImage(`${ASSETS}/stamps-road.png`),
    loadImage(`${ASSETS}/terrain-scrub.png`),
    loadImage(`${ASSETS}/alkali-flats.png`),
    loadImage(`${ASSETS}/terrace-canyon.png`),
    loadImage(`${ASSETS}/basalt-rim.png`),
  ]);
  const roadCars = [playerYaw, rallyYaw, muscleYaw, enduranceYaw, tunerYaw].map(sliceCarGrid);
  const fx = sliceSheet(fxImg, 4);
  const stamps = sliceSheet(stampsImg, 3);
  return {
    roadCars,
    boost: fx[0],
    spark: fx[1],
    shield: fx[2],
    streak: fx[3],
    rail: stamps[0],
    checker: stamps[1],
    pad: stamps[2],
    terrain,
    horizons,
  };
};
