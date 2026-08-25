// Run 'n Gunner renderer. Camera-translated sprite placement and
// transforms only; the flat ground, platform, and backdrop fills are level
// geometry (the Munch Maze exception), everything alive is a sprite.

import { GROUND_Y } from "./stages.ts";
import { Engine, H, W, type Enemy } from "./engine.ts";
import type { GunnerSprites } from "./sprites.ts";

const SKY = "#241A12"; // warm near-black, never pure black
const RIDGE = "#2E2216";
const GROUND = "#3A2A1C";
const GROUND_EDGE = "#57422C";
const PLATFORM = "#4A3624";
const PLATFORM_EDGE = "#6B5136";

const ENEMY_DRAW: Record<Enemy["kind"], { size: number }> = {
  runner: { size: 18 },
  turret: { size: 22 },
  lobber: { size: 20 },
  drone: { size: 16 },
};

const drawSprite = (
  ctx: CanvasRenderingContext2D,
  c: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  angle = 0,
  alpha = 1,
  flipX = false,
) => {
  const h = (w * c.height) / c.width;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(c, -w / 2, -h / 2, w, h);
  ctx.restore();
};

const drawGroundSprite = (
  ctx: CanvasRenderingContext2D,
  c: HTMLCanvasElement,
  x: number,
  feetY: number,
  w: number,
  angle = 0,
  alpha = 1,
  flipX = false,
) => {
  const h = (w * c.height) / c.width;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, feetY);
  if (angle) ctx.rotate(angle);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(c, -w / 2, -h, w, h);
  ctx.restore();
};

const animationFrame = (frames: HTMLCanvasElement[], time: number, fps: number, phase = 0) =>
  frames[Math.floor(time * fps + phase) % frames.length];

export const draw = (ctx: CanvasRenderingContext2D, eng: Engine, spr: GunnerSprites) => {
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, W, H);

  // distant ridge band, parallax at a third of camera speed
  ctx.fillStyle = RIDGE;
  const par = (eng.scrollX * 0.33) % 240;
  for (let i = -1; i < 4; i++) {
    const bx = i * 240 - par;
    ctx.fillRect(bx, 150, 150, GROUND_Y - 150);
  }

  ctx.save();
  ctx.translate(-Math.round(eng.scrollX), 0);

  // ground spans and pits
  ctx.fillStyle = GROUND;
  for (const [a, b] of eng.stage.grounds) {
    ctx.fillRect(a, GROUND_Y, b - a, H - GROUND_Y);
  }
  ctx.fillStyle = GROUND_EDGE;
  for (const [a, b] of eng.stage.grounds) {
    ctx.fillRect(a, GROUND_Y, b - a, 3);
  }

  // platforms
  for (const pl of eng.stage.platforms) {
    ctx.fillStyle = PLATFORM;
    ctx.fillRect(pl.x, pl.y, pl.w, 8);
    ctx.fillStyle = PLATFORM_EDGE;
    ctx.fillRect(pl.x, pl.y, pl.w, 2);
  }

  // weapon crates, bobbing
  const bob = Math.sin(eng.time * 3) * 2;
  for (const fp of eng.stage.pickups) {
    if (fp.collected) continue;
    drawSprite(ctx, spr.pickups[fp.item], fp.x, GROUND_Y - 10 + bob, 16, Math.sin(eng.time * 2.5) * 0.06);
  }
  for (const pk of eng.pickups) {
    drawSprite(
      ctx,
      spr.pickups[pk.item],
      pk.x,
      pk.y - 10 + (pk.y >= GROUND_Y ? bob : 0),
      16,
      Math.sin(eng.time * 2.5 + pk.x * 0.02) * 0.06,
    );
  }

  // enemies
  for (const e of eng.enemies) {
    const d = ENEMY_DRAW[e.kind];
    switch (e.kind) {
      case "runner":
        drawGroundSprite(
          ctx,
          animationFrame(spr.runnerFrames, eng.time, 8, e.x * 0.025),
          e.x + Math.sin(eng.time * 8 + e.x * 0.03) * 0.7,
          e.y,
          d.size,
          Math.sin(eng.time * 8 + e.x * 0.03) * 0.045,
          1,
          eng.player.x < e.x,
        );
        break;
      case "turret":
        drawGroundSprite(
          ctx,
          animationFrame(spr.turretFrames, eng.time, 3, e.x * 0.015),
          e.x,
          e.y,
          d.size,
          0,
          1,
          eng.player.x < e.x,
        );
        break;
      case "lobber":
        drawGroundSprite(
          ctx,
          animationFrame(spr.lobberFrames, eng.time, 3.5, e.x * 0.02),
          e.x,
          e.y,
          d.size,
          Math.sin(eng.time * 3.5 + e.x * 0.02) * 0.035,
          1,
          eng.player.x < e.x,
        );
        break;
      case "drone":
        drawSprite(
          ctx,
          animationFrame(spr.droneFrames, eng.time, 6, e.x * 0.02),
          e.x,
          e.y,
          d.size,
          Math.sin(eng.time * 5 + e.x * 0.02) * 0.08,
          0.95,
          eng.player.x > e.x,
        );
        break;
    }
  }

  // boss
  const b = eng.boss;
  if (b) {
    const flick = b.flash > 0 ? 0.55 : 1;
    const tilt = b.charging > 0 ? b.dir * 0.18 : Math.sin(eng.time * 2.2) * 0.05;
    const bossFrame = animationFrame(spr.bossFrames, eng.time, b.charging > 0 ? 7 : 2.5);
    if (b.def.hover) {
      drawSprite(ctx, bossFrame, b.x, b.y, b.def.w, tilt, flick, b.dir < 0);
    } else {
      drawGroundSprite(ctx, bossFrame, b.x, b.y + b.def.h / 2, b.def.w, tilt, flick, b.dir < 0);
    }
  }

  // shots
  for (const s of eng.playerShots) {
    drawSprite(ctx, spr.bolt, s.x, s.y, s.size * 1.2, Math.atan2(s.vy, s.vx));
  }
  for (const s of eng.enemyShots) {
    if (s.grav) {
      drawSprite(ctx, spr.grenade, s.x, s.y, 11, eng.time * 9, 0.95);
    } else {
      drawSprite(ctx, spr.orb, s.x, s.y, 9 + Math.sin(eng.time * 12 + s.x * 0.02) * 0.8, 0, 0.95);
    }
  }

  // player
  const p = eng.player;
  if (eng.phase === "playing") {
    const blink = p.iFrames > 0 ? (Math.floor(eng.time * 12) % 2 === 0 ? 0.35 : 0.9) : 1;
    const moving = p.grounded && eng.input.dir !== 0;
    const lean = p.grounded ? (moving ? Math.sin(eng.time * 10) * 0.035 : 0) : 0.1 * p.facing;
    const frame = p.grounded
      ? spr.soldierFrames[moving ? Math.floor(eng.time * 10) % 2 : 0]
      : spr.soldierFrames[2];
    const up = eng.input.up;
    const recoil = eng.muzzle > 0 && !up ? -p.facing * 1.2 : 0;
    drawGroundSprite(ctx, frame, p.x + recoil, p.y, 20, lean, blink, p.facing < 0);
    if (eng.muzzle > 0) {
      const bodyH = (20 * frame.height) / frame.width;
      const mx = up ? p.x : p.x + p.facing * 15;
      const my = up ? p.y - bodyH - 5 : p.y - bodyH * 0.55;
      drawSprite(ctx, spr.muzzle, mx, my, 10, eng.time * 20, blink);
    }
  }

  // explosions, burst scaling out
  for (const x of eng.explosions) {
    const k = x.age / 0.45;
    drawSprite(ctx, spr.burst, x.x, x.y, 12 + k * 30, k * 2, 1 - k);
  }

  ctx.restore();
};
