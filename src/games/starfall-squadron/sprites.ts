// Starfall Squadron sprites — AI-generated flat sheets on magenta, keyed
// and sliced at runtime (same pipeline as Munch Maze; Track A is
// same-origin so canvas readback is legal). Two light sheets only:
// ships.png (fighter, drone, warrior, captor) and fx.png (bolt, orb,
// burst, star, beam).

const ART = "/assets/games/starfall-squadron";

export interface StarfallSprites {
  fighter: HTMLCanvasElement;
  drone: HTMLCanvasElement;
  warrior: HTMLCanvasElement;
  captor: HTMLCanvasElement;
  bolt: HTMLCanvasElement;
  orb: HTMLCanvasElement;
  burst: HTMLCanvasElement;
  star: HTMLCanvasElement;
  beam: HTMLCanvasElement;
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
    } else if (r > 120 && b > 120 && g < r - 40 && g < b - 40) {
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

export const loadSprites = async (): Promise<StarfallSprites> => {
  const [shipsImg, fxImg] = await Promise.all([
    loadImage(`${ART}/ships.png`),
    loadImage(`${ART}/fx.png`),
  ]);
  const ships = sliceSheet(shipsImg, 4);
  const fx = sliceSheet(fxImg, 5);
  return {
    fighter: ships[0],
    drone: ships[1],
    warrior: ships[2],
    captor: ships[3],
    bolt: fx[0],
    orb: fx[1],
    burst: fx[2],
    star: fx[3],
    beam: fx[4],
  };
};
