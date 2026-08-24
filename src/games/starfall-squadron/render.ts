// Starfall Squadron canvas renderer — sprite placement and transforms only
// (rotate/scale/alpha of generated art; no drawn shapes).

import { Engine, H, PLAYER_Y, W, type Enemy } from "./engine";
import type { StarfallSprites } from "./sprites";

const BG = "#1E1710"; // warm near-black, never pure black

const spriteFor = (spr: StarfallSprites, e: Enemy) =>
  e.kind === "drone" ? spr.drone : e.kind === "warrior" ? spr.warrior : spr.captor;

const SIZE: Record<Enemy["kind"], number> = { drone: 20, warrior: 24, captor: 30 };

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

export const draw = (ctx: CanvasRenderingContext2D, eng: Engine, spr: StarfallSprites) => {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // starfield — instanced generated sparkle
  for (const s of eng.stars) {
    drawSprite(ctx, spr.star, s.x, s.y, 5 * s.scale, 0, s.alpha * 0.8);
  }

  // tractor beams under everything else
  for (const e of eng.enemies) {
    if (e.state === "beaming") {
      const top = e.y + 12;
      const height = PLAYER_Y + 16 - top;
      const pulse = 0.45 + 0.2 * Math.sin(eng.time * 18);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.drawImage(spr.beam, e.x - 34, top, 68, height);
      ctx.restore();
    }
  }

  // enemies
  for (const e of eng.enemies) {
    if (e.state === "waiting") continue;
    const bob = e.state === "formation" ? Math.sin(eng.time * 2 + e.col * 0.7) * 1.5 : 0;
    drawSprite(ctx, spriteFor(spr, e), e.x, e.y + bob, SIZE[e.kind], e.angle);
    if (e.hasCaptive) {
      drawSprite(ctx, spr.fighter, e.x, e.y + bob - SIZE[e.kind] * 0.8, 16, Math.PI, 0.95);
    }
  }

  // bullets
  for (const b of eng.bullets) {
    if (b.friendly) {
      drawSprite(ctx, spr.bolt, b.x, b.y, 5);
    } else {
      drawSprite(ctx, spr.orb, b.x, b.y, 8, 0, 0.95);
    }
  }

  // freed captive gliding down to dock
  if (eng.freedShip) {
    drawSprite(ctx, spr.fighter, eng.freedShip.x, eng.freedShip.y, 22, 0, 0.95);
  }

  // player
  const p = eng.player;
  if (p.state === "alive") {
    const blink = p.invuln > 0 ? (Math.floor(eng.time * 12) % 2 === 0 ? 0.35 : 0.9) : 1;
    if (p.dual) {
      drawSprite(ctx, spr.fighter, p.x - 11, PLAYER_Y, 24, 0, blink);
      drawSprite(ctx, spr.fighter, p.x + 11, PLAYER_Y, 24, 0, blink);
    } else {
      drawSprite(ctx, spr.fighter, p.x, PLAYER_Y, 26, 0, blink);
    }
  } else if (p.state === "captured") {
    const pos = eng.capturePos();
    if (pos) {
      drawSprite(ctx, spr.fighter, pos.x, pos.y, 24, Math.sin(eng.time * 10) * 0.4, 0.95);
    }
  }

  // explosions — burst sprite scaling out
  for (const x of eng.explosions) {
    const k = x.age / 0.45;
    drawSprite(ctx, spr.burst, x.x, x.y, 14 + k * 34, k * 2.2, 1 - k);
  }
};
