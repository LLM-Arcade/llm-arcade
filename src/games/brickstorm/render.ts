// Brickstorm renderer. Sprites are placed and transformed, never drawn.
// The only flat fills are static level geometry: the ink playfield panel,
// the shield barrier bar, and the panel hairline.

import { FIELD, H, TUNE, W, brickCenter, type Engine, type Fx } from "./engine.ts";
import type { BrickstormSprites } from "./sprites.ts";

const PANEL = "rgba(26,24,21,0.9)";
const PANEL_EDGE = "rgba(246,241,231,0.18)";
const SHIELD_BAR = "#E6A518";

const FX_SIZE: Record<Fx["kind"], number> = {
  impact: 26,
  spark: 22,
  clear: 46,
  debris: 40,
  ember: 18,
  trail: 20,
  dust: 24,
  groundBurst: 70,
  dustBurst: 64,
};

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

const drawBottom = (
  ctx: CanvasRenderingContext2D,
  c: HTMLCanvasElement,
  x: number,
  baseY: number,
  w: number,
) => {
  const h = (w * c.height) / c.width;
  ctx.drawImage(c, x - w / 2, baseY - h, w, h);
};

/** Damage row from remaining hp; one-hit bricks never leave the intact row. */
const damageRow = (hp: number, maxHp: number) => Math.max(0, Math.min(3, maxHp - hp));

const paddleColumn = (eng: Engine): number => {
  // Expanded wins over damaged: the collision body is wide while expand is
  // active, and the art must never read narrower than the body.
  if (eng.time < eng.expandUntil) return 3;
  if (eng.time < eng.paddleFlashUntil) return 2;
  if (eng.lives === 1) return 4;
  if (Math.abs(eng.paddle.vx) > TUNE.paddleMoveVx) return 1;
  return 0;
};

const fxSprite = (spr: BrickstormSprites, f: Fx): HTMLCanvasElement => {
  switch (f.kind) {
    case "impact": return spr.fx.impact;
    case "spark": return spr.fx.spark;
    case "clear": return spr.fx.clear;
    case "debris": return spr.debris[f.material ?? 0];
    case "ember": return spr.fx.ember;
    case "trail": return Math.floor(f.born * 20) % 2 === 0 ? spr.fx.trailA : spr.fx.trailB;
    case "dust": return spr.fx.dust;
    case "groundBurst": return spr.groundBurst;
    case "dustBurst": return spr.dustBurst;
  }
};

export const draw = (ctx: CanvasRenderingContext2D, eng: Engine, spr: BrickstormSprites) => {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(spr.boards[eng.boardIndex], 0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(FIELD.x0, FIELD.y0, FIELD.x1 - FIELD.x0, FIELD.y1 - FIELD.y0, 14);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.stroke();
  ctx.clip();

  for (const brick of eng.bricks) {
    const c = brickCenter(brick.col, brick.row);
    drawSprite(ctx, spr.bricks[brick.material][damageRow(brick.hp, brick.maxHp)], c.x, c.y, TUNE.cellW);
    if (eng.time < brick.flashUntil) {
      drawSprite(ctx, spr.fx.crack, c.x, c.y, TUNE.cellW * 0.8, 0, 0.85);
    }
  }

  const pulse = Math.floor(eng.time / 0.12) % 2 === 1;
  for (const drop of eng.drops) {
    const pair = spr.powerIcons[drop.power];
    drawSprite(ctx, pulse ? pair[1] : pair[0], drop.x, drop.y, 30);
  }

  for (const f of eng.fx) {
    const k = Math.max(0, Math.min(1, (eng.time - f.born) / TUNE.fxTtl));
    drawSprite(ctx, fxSprite(spr, f), f.x, f.y, FX_SIZE[f.kind] * (1 + k * 0.35), 0, 1 - k);
  }

  if (eng.shield) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = SHIELD_BAR;
    ctx.fillRect(FIELD.x0, TUNE.floorY - 4, FIELD.x1 - FIELD.x0, 4);
    ctx.globalAlpha = 1;
    drawSprite(ctx, spr.powerIcons.shield[pulse ? 1 : 0], (FIELD.x0 + FIELD.x1) / 2, TUNE.floorY - 20, 28, 0, 0.9);
  }

  const paddleFrame = spr.paddleRows[eng.board.paddleRow][paddleColumn(eng)];
  // Cell scale 1.0 at the base width, then tracked to the live body width so
  // the art keeps the same overhang when the paddle expands.
  const paddleW = paddleFrame.width * ((eng.paddle.halfW * 2) / TUNE.paddleW);
  drawBottom(ctx, paddleFrame, eng.paddle.x, 486, paddleW);

  for (const ball of eng.balls) {
    const p = ball.body.position;
    const v = ball.body.velocity;
    const speed = Math.hypot(v.x, v.y) * 60;
    if (ball.stuckOffset === null && speed >= TUNE.streakSpeed) {
      const angle = Math.atan2(v.y, v.x);
      const octant = ((Math.round((angle / (Math.PI * 2)) * 8) % 8) + 8) % 8;
      const streak = spr.ballSpeed[octant % 4];
      // Sized by height so the ball core stays ball-sized and only the
      // trailing streak extends past it.
      drawSprite(ctx, streak, p.x, p.y, (26 * streak.width) / streak.height, angle);
    } else {
      drawSprite(ctx, spr.ballSpin[Math.floor(ball.spin / 24) % 4], p.x, p.y, 26);
    }
  }

  if (eng.phase === "board-clear") {
    const cx = (FIELD.x0 + FIELD.x1) / 2;
    drawSprite(ctx, spr.props.badge, cx, 210, 72);
    const twinkle = 0.55 + 0.45 * Math.sin(eng.time * 9);
    drawSprite(ctx, spr.props.sparkle, cx + 52, 182, 26, 0, twinkle);
    drawSprite(ctx, spr.props.sparkle, cx - 54, 236, 20, 0, 1 - twinkle * 0.6);
  }

  ctx.restore();
};
