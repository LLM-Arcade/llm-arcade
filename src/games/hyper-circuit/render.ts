// Hyper Circuit mode-7 renderer. Per-pixel ground sampling into a reused
// ImageData, then sprite transforms only (no drawn shapes beyond the flat
// sky fills). Every per-frame buffer below is module-level and reused.

import type { Engine, Rival } from "./engine";
import type { GroundTexture } from "./track-texture";
import type { HyperSprites } from "./sprites";

export const W = 400;
export const H = 260;

const HORIZON = 96;
const GH = H - HORIZON;
const CAM_BACK = 58;
const CAM_H = 34;
const FOCAL = 268;
const NEAR = 14;
// Reference top speed for streak thresholds and hum pitch. Mirrors the
// spec's 330 u/s so the renderer never depends on TUNE's key names.
export const REF_MAX_SPEED = 330;

const SKY = "#F2E9D8";
const HAZE = "#E4D5B8";
// Little-endian packed ABGR of terrain sand #D9C9A3. Canvas ImageData
// bytes are RGBA, so a Uint32Array view reads ABGR on every browser CPU
// we target.
const SAND32 = 0xffa3c9d9;
const FOG_R = 217, FOG_G = 201, FOG_B = 163;

// Raised with the player draw width lowered: the player car read at
// twice the size of a rival sitting right ahead of it.
const RIVAL_WORLD_W = 17;
const GHOST_WORLD_W = 10;
const SPARK_WORLD_W = 9;
const CAR_CONTACT_INSET = 16 / 128;

// Precomputed per-row depth and fog (camera height and focal are fixed).
const rowDepth = new Float32Array(GH);
const rowFog = new Uint16Array(GH);
for (let r = 0; r < GH; r++) {
  const d = (CAM_H * FOCAL) / (r + 1);
  rowDepth[r] = d;
  rowFog[r] = Math.min(256, Math.max(0, Math.round(((d - 420) / 1500) * 256)));
}

let groundCanvas: HTMLCanvasElement | null = null;
let groundCtx: CanvasRenderingContext2D | null = null;
let groundImage: ImageData | null = null;
let ground32: Uint32Array | null = null;

interface SpriteSlot {
  fwd: number;
  img: HTMLCanvasElement | null;
  sx: number;
  sy: number;
  w: number;
  alpha: number;
  bank: number;
}
const slots: SpriteSlot[] = Array.from({ length: 6 }, () => ({
  fwd: 0,
  img: null,
  sx: 0,
  sy: 0,
  w: 0,
  alpha: 1,
  bank: 0,
}));

export interface Camera {
  heading: number;
  bank: number;
  initialized: boolean;
}
export const createCamera = (): Camera => ({ heading: 0, bank: 0, initialized: false });

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// Directional strips run left-to-right as five yaw angles, each with a
// grounded base and loaded-suspension pose. Keep selection visual-only.
const yawFor = (visualTurn: number) =>
  Math.max(0, Math.min(4, 2 + Math.round(visualTurn / 0.18)));

const carFrame = (cars: HTMLCanvasElement[][], car: number, yaw: number, motion: boolean) =>
  cars[car][yaw * 2 + (motion ? 1 : 0)];

const drawSprite = (
  ctx: CanvasRenderingContext2D,
  c: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  angle = 0,
  alpha = 1,
) => {
  const h = (w * c.height) / c.width;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.drawImage(c, -w / 2, -h / 2, w, h);
  ctx.restore();
};

const drawRacer = (
  ctx: CanvasRenderingContext2D,
  craft: HTMLCanvasElement,
  x: number,
  roadY: number,
  w: number,
  bank: number,
  alpha: number,
  boost: HTMLCanvasElement | null = null,
) => {
  const h = (w * craft.height) / craft.width;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, roadY);
  ctx.rotate(bank);

  if (boost) {
    const boostH = h * 0.42;
    const boostW = w * 0.44;
    ctx.globalAlpha = alpha * 0.86;
    ctx.drawImage(boost, -boostW / 2, -h * 0.06, boostW, boostH);
  }

  ctx.globalAlpha = alpha;
  // The standardized cells reserve 16px beneath the tire bbox for a key
  // gutter. Shift the canvas down by that proportional inset so roadY is the
  // actual tire contact point for every car, including the player.
  ctx.drawImage(craft, -w / 2, -h + h * CAR_CONTACT_INSET, w, h);
  ctx.restore();
};

export const draw = (
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  spr: HyperSprites,
  ground: GroundTexture,
  cam: Camera,
  dt: number,
) => {
  const p = eng.player;

  if (!cam.initialized) {
    cam.heading = p.heading;
    cam.initialized = true;
  }
  cam.heading += wrapAngle(p.heading - cam.heading) * Math.min(1, 7 * dt);
  const targetBank = eng.input.steer * 0.22;
  cam.bank += (targetBank - cam.bank) * Math.min(1, 11 * dt);

  const fwdX = Math.cos(cam.heading);
  const fwdY = Math.sin(cam.heading);
  const sideX = -fwdY;
  const sideY = fwdX;
  const camX = p.x - fwdX * CAM_BACK;
  const camY = p.y - fwdY * CAM_BACK;

  // Course art is deliberately an opaque low-horizon band. A slow crop pan
  // makes the three locations travel past without touching race state.
  const horizon = spr.horizons[eng.circuitIndex];
  if (horizon) {
    // Omit each panorama's foreground roadway: the mode-7 sampler owns the
    // playable road below this band, avoiding a doubled asphalt seam.
    const sourceH = Math.round(horizon.height * 0.48);
    const sourceW = Math.min(horizon.width, Math.round(sourceH * 2.8));
    const range = Math.max(1, horizon.width - sourceW);
    const sourceX = Math.round(
      (Math.sin(eng.time * 0.08 + eng.circuitIndex * 1.7) * 0.5 + 0.5) * range,
    );
    ctx.drawImage(horizon, sourceX, 0, sourceW, sourceH, 0, 0, W, HORIZON);
  } else {
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, W, HORIZON - 14);
    ctx.fillStyle = HAZE;
    ctx.fillRect(0, HORIZON - 14, W, 14);
  }

  // Ground: one reused full-frame ImageData pass.
  if (!groundCanvas) {
    groundCanvas = document.createElement("canvas");
    groundCanvas.width = W;
    groundCanvas.height = GH;
    groundCtx = groundCanvas.getContext("2d")!;
    groundImage = groundCtx.createImageData(W, GH);
    ground32 = new Uint32Array(groundImage.data.buffer);
  }
  const out = ground32!;
  const px = ground.px;
  const size = ground.size;
  const halfW = W / 2;

  for (let r = 0; r < GH; r++) {
    const d = rowDepth[r];
    const step = d / FOCAL;
    let wx = camX + fwdX * d - sideX * halfW * step;
    let wy = camY + fwdY * d - sideY * halfW * step;
    const dx = sideX * step;
    const dy = sideY * step;
    const fog = rowFog[r];
    const inv = 256 - fog;
    const fogR = FOG_R * fog;
    const fogG = FOG_G * fog;
    const fogB = FOG_B * fog;
    const rowOff = r * W;

    if (fog >= 256) {
      const full = 0xff000000 | (FOG_B << 16) | (FOG_G << 8) | FOG_R;
      for (let x = 0; x < W; x++) out[rowOff + x] = full;
      continue;
    }

    for (let x = 0; x < W; x++) {
      const xi = wx | 0;
      const yi = wy | 0;
      let v =
        (xi >>> 0) < size && (yi >>> 0) < size ? px[yi * size + xi] : SAND32;
      if (fog > 0) {
        const r8 = ((v & 255) * inv + fogR) >> 8;
        const g8 = (((v >>> 8) & 255) * inv + fogG) >> 8;
        const b8 = (((v >>> 16) & 255) * inv + fogB) >> 8;
        v = 0xff000000 | (b8 << 16) | (g8 << 8) | r8;
      }
      out[rowOff + x] = v;
      wx += dx;
      wy += dy;
    }
  }
  groundCtx!.putImageData(groundImage!, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(groundCanvas, 0, HORIZON);

  // Rivals and ghost, painter's order far to near.
  let count = 0;
  const rivals: Rival[] = eng.rivals;
  for (let i = 0; i < rivals.length; i++) {
    const rv = rivals[i];
    const rdx = rv.x - camX;
    const rdy = rv.y - camY;
    const fwd = rdx * fwdX + rdy * fwdY;
    if (fwd < NEAR) continue;
    const side = rdx * sideX + rdy * sideY;
    const k = FOCAL / fwd;
    const slot = slots[count++];
    slot.fwd = fwd;
    const headingDelta = wrapAngle(rv.heading - cam.heading);
    const yaw = yawFor(headingDelta);
    const motion = (Math.floor(eng.time * 8 + i) & 1) === 1;
    slot.img = carFrame(spr.roadCars, rv.spriteIdx + 1, yaw, motion);
    slot.sx = halfW + side * k;
    slot.sy = HORIZON + CAM_H * k;
    slot.w = Math.min(104, RIVAL_WORLD_W * k);
    slot.alpha = 1;
    slot.bank = Math.max(-0.06, Math.min(0.06, headingDelta * 0.12));
  }
  const g = eng.ghostPos();
  if (g) {
    const gdx = g.x - camX;
    const gdy = g.y - camY;
    const fwd = gdx * fwdX + gdy * fwdY;
    if (fwd >= NEAR) {
      const k = FOCAL / fwd;
      const slot = slots[count++];
      slot.fwd = fwd;
      slot.img = carFrame(spr.roadCars, 0, 2, false);
      slot.sx = halfW + (gdx * sideX + gdy * sideY) * k;
      slot.sy = HORIZON + CAM_H * k;
      slot.w = GHOST_WORLD_W * k;
      slot.alpha = 0.35;
      slot.bank = Math.max(-0.05, Math.min(0.05, wrapAngle(g.heading - cam.heading) * 0.1));
    }
  }
  // Insertion sort by depth, farthest first. At most 5 entries.
  for (let i = 1; i < count; i++) {
    const s = slots[i];
    let j = i - 1;
    while (j >= 0 && slots[j].fwd < s.fwd) {
      slots[j + 1] = slots[j];
      j--;
    }
    slots[j + 1] = s;
  }
  for (let i = 0; i < count; i++) {
    const s = slots[i];
    if (!s.img || s.sx < -80 || s.sx > W + 80 || s.w < 1) continue;
    drawRacer(
      ctx,
      s.img,
      s.sx,
      s.sy,
      s.w,
      s.bank,
      s.alpha,
    );
  }

  // Rail sparks: burst sprite scaling out over 0.4 s.
  for (const sp of eng.sparks) {
    const sdx = sp.x - camX;
    const sdy = sp.y - camY;
    const fwd = sdx * fwdX + sdy * fwdY;
    if (fwd < NEAR) continue;
    const k = FOCAL / fwd;
    const t = Math.min(1, sp.age / 0.4);
    drawSprite(
      ctx,
      spr.spark,
      halfW + (sdx * sideX + sdy * sideY) * k,
      HORIZON + CAM_H * k,
      SPARK_WORLD_W * k * (0.5 + t),
      t * 2,
      1 - t,
    );
  }

  // Speed streaks at the screen edges past 75% of top speed.
  const speedFrac = Math.min(1, p.speed / REF_MAX_SPEED);
  if (speedFrac > 0.75) {
    const n = Math.min(10, 2 + Math.floor((speedFrac - 0.75) * 36));
    for (let i = 0; i < n; i++) {
      const sx = i % 2 === 0 ? 10 + ((i * 23) % 46) : W - 12 - ((i * 31) % 46);
      const sy = ((eng.time * (520 + i * 70) + i * 97) % (H + 60)) - 30;
      drawSprite(ctx, spr.streak, sx, sy, 4, 0, 0.4);
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.drawImage(spr.streak, sx - 1.5, sy - 18 - speedFrac * 20, 3, 36 + speedFrac * 44);
      ctx.restore();
    }
  }

  // Player car stays tire-anchored; alternating sheets provide suspension
  // and steering movement instead of an anti-gravity hover.
  const lean = Math.max(-10, Math.min(10, p.lat * 0.15));
  const craftW = 56;
  const playerX = halfW + lean;
  const playerY = H - 42;
  const playerYaw = yawFor(eng.input.steer * 0.36);
  const playerMotion = (Math.floor(eng.time * 10) & 1) === 1;
  if (eng.isBoosting || p.shield < 25) {
    const pulse = 0.72 + Math.sin(eng.time * 9) * 0.08;
    const alpha = eng.isBoosting ? pulse * 0.24 : pulse * 0.13;
    drawSprite(ctx, spr.shield, playerX, playerY, 62, eng.time * 0.35, alpha);
  }
  drawRacer(
    ctx,
    carFrame(spr.roadCars, 0, playerYaw, playerMotion),
    playerX,
    playerY,
    craftW,
    cam.bank * 0.15,
    1,
    eng.isBoosting ? spr.boost : null,
  );
};
