// Hyper Circuit ground texture. Composed once per circuit at 1 texel per
// world unit, then read back into a Uint32Array for the mode-7 sampler.
// The flat road and terrain fills are the Munch Maze level-geometry
// exception. Every detail on top is a stamped transform of generated art.

import { COURSES, trackPos, WORLD, type Track } from "./courses";
import type { HyperSprites } from "./sprites";

export interface GroundTexture {
  px: Uint32Array;
  size: number;
}

const SAND = "#D9C9A3";
const SHADE = "#C9B78E";
const ROAD = "#4A4038";
const SHOULDER = "#5C5044";
const PIT = "#7A7A46";

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clearOfRoad = (t: Track, x: number, y: number, margin: number): boolean => {
  const m2 = margin * margin;
  for (let i = 0; i < t.n; i += 4) {
    const dx = t.pts[i * 2] - x;
    const dy = t.pts[i * 2 + 1] - y;
    if (dx * dx + dy * dy < m2) return false;
  }
  return true;
};

export const buildGroundTexture = (track: Track, sprites: HyperSprites): GroundTexture => {
  const seed = Math.max(0, COURSES.findIndex((c) => c.slug === track.def.slug));
  const rand = mulberry32(seed * 7919 + 17);
  const halfW = track.def.halfWidth;

  const canvas = document.createElement("canvas");
  canvas.width = WORLD;
  canvas.height = WORLD;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;

  // 1. Terrain base plus seeded scrub. Shade patches are terrain-base
  // flat fills, scrub is stamped generated terrain crops.
  ctx.fillStyle = SAND;
  ctx.fillRect(0, 0, WORLD, WORLD);

  const terrain = sprites.terrain;
  const roadMargin = halfW + 26;
  for (let i = 0; i < 70; i++) {
    const x = 30 + rand() * (WORLD - 60);
    const y = 30 + rand() * (WORLD - 60);
    if (!clearOfRoad(track, x, y, roadMargin)) continue;
    const w = 34 + rand() * 52;
    const h = 22 + rand() * 34;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = SHADE;
    ctx.fillRect(-w * 0.7, -h * 0.7, w * 1.4, h * 1.4);
    ctx.globalAlpha = 0.85;
    const sw = Math.min(terrain.width, 40 + Math.floor(rand() * 80));
    const sh = Math.min(terrain.height, 40 + Math.floor(rand() * 80));
    const sx = Math.floor(rand() * Math.max(1, terrain.width - sw));
    const sy = Math.floor(rand() * Math.max(1, terrain.height - sh));
    ctx.drawImage(terrain, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // 2. Road ribbon: rotated flat slices walked along the centerline.
  const sliceStep = 3;
  for (let s = 0; s < track.total; s += sliceStep) {
    const p = trackPos(track, s);
    const ang = Math.atan2(p.dirY, p.dirX);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = ROAD;
    ctx.fillRect(-1.7, -halfW, 3.4, halfW * 2);
    ctx.fillStyle = SHOULDER;
    ctx.fillRect(-1.7, -halfW, 3.4, 8);
    ctx.fillRect(-1.7, halfW - 8, 3.4, 8);
    ctx.restore();
  }

  // 4a. Pit strip: olive overlay on the road's right half, painted
  // before rails and pads so they stay readable on top.
  const [pitA, pitB] = track.def.pitLane;
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = PIT;
  for (let s = pitA * track.total; s < pitB * track.total; s += sliceStep) {
    const p = trackPos(track, s);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.dirY, p.dirX));
    ctx.fillRect(-1.7, 6, 3.4, halfW - 12);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 3. Rails: generated segment stamps along both edges.
  for (let s = 0; s < track.total; s += 9) {
    const p = trackPos(track, s);
    const ang = Math.atan2(p.dirY, p.dirX);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(p.x - p.dirY * side * (halfW + 2), p.y + p.dirX * side * (halfW + 2));
      ctx.rotate(ang);
      ctx.drawImage(sprites.rail, -6, -2.5, 12, 5);
      ctx.restore();
    }
  }

  // 4b. Start line: two rows of checker stamps at s = 0.
  for (let row = 0; row < 2; row++) {
    const p = trackPos(track, row * 5);
    const ang = Math.atan2(p.dirY, p.dirX);
    for (let lat = -halfW + 6; lat <= halfW - 6; lat += 9) {
      ctx.save();
      ctx.translate(p.x - p.dirY * lat, p.y + p.dirX * lat);
      ctx.rotate(ang + Math.PI / 2);
      ctx.drawImage(sprites.checker, -4.5, -2.5, 9, 5);
      ctx.restore();
    }
  }

  // 4c. Boost pads: generated glyph stamps pointing along travel.
  for (const frac of track.def.boostPads) {
    const center = frac * track.total;
    for (let row = -1; row <= 1; row++) {
      for (let k = 0; k < 4; k++) {
        const p = trackPos(track, (center + row * 13 - k * 5 + track.total) % track.total);
        for (const side of [-1, 1]) {
          const lat = side * (4 + k * 8);
          ctx.save();
          ctx.translate(p.x - p.dirY * lat, p.y + p.dirX * lat);
          ctx.drawImage(sprites.pad, -3.5, -3.5, 7, 7);
          ctx.restore();
        }
      }
    }
  }

  const data = ctx.getImageData(0, 0, WORLD, WORLD);
  return { px: new Uint32Array(data.data.buffer), size: WORLD };
};
