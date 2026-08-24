// Canvas renderer for Munch Maze. Walls are filled with the generated
// hedge texture; every creature/item is a generated sprite — nothing here
// draws art, it only places it.

import { BERRY_TILE, BOARD_H, BOARD_W, COLS, DOOR, LAYOUT, ROWS, TILE } from "./maze";
import type { Engine, Ghost } from "./engine";
import type { MunchSprites } from "./sprites";

const GROUND = "#2A2119";
const WALL_EDGE = "#232B14";

let hedgePattern: CanvasPattern | null = null;

const drawSprite = (
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  cx: number,
  cy: number,
  size: number,
) => {
  const scale = size / Math.max(sprite.width, sprite.height);
  const w = sprite.width * scale;
  const h = sprite.height * scale;
  ctx.drawImage(sprite, cx - w / 2, cy - h / 2, w, h);
};

const drawMuncher = (ctx: CanvasRenderingContext2D, eng: Engine, s: MunchSprites) => {
  const p = eng.player;
  const open = !eng.moving || Math.floor(eng.mouthT / 0.09) % 2 === 0;
  const sprite = open ? s.muncherOpen : s.muncherClosed;

  ctx.save();
  ctx.translate(p.px, p.py);

  if (eng.phase === "dying") {
    // spin down and shrink — placement animation, not drawn art
    const t = Math.min(eng.phaseT / 1.4, 1);
    ctx.rotate(t * Math.PI * 4);
    ctx.scale(1 - t * 0.9, 1 - t * 0.9);
    ctx.globalAlpha = 1 - t * 0.85;
  } else {
    // sprite faces right: rotate for up/down, mirror for left
    if (p.dir === 1) ctx.rotate(Math.PI / 2);
    else if (p.dir === 3) ctx.rotate(-Math.PI / 2);
    else if (p.dir === 2) ctx.scale(-1, 1);
  }

  drawSprite(ctx, sprite, 0, 0, TILE * 1.55);
  ctx.restore();
};

const drawGhost = (
  ctx: CanvasRenderingContext2D,
  g: Ghost,
  eng: Engine,
  s: MunchSprites,
  now: number,
) => {
  if (g.state === "respawn") {
    const left = g.respawnAt - eng.time;
    if (left > 2.4) {
      // brief fade-out where it was eaten
      ctx.save();
      ctx.globalAlpha = Math.max(0, (left - 2.4) / 0.6) * 0.7;
      drawSprite(ctx, s.scared, g.px, g.py, TILE * 1.5);
      ctx.restore();
    }
    return;
  }

  let sprite = s.ghosts[g.id];
  if (g.state === "frightened") {
    const flashing = eng.frightT < 2 && Math.floor(now / 0.22) % 2 === 0;
    sprite = flashing ? s.ghosts[g.id] : s.scared;
  }

  ctx.save();
  const bob = Math.sin(now * 6 + g.id * 1.7) * 1.5;
  drawSprite(ctx, sprite, g.px, g.py + bob, TILE * 1.5);
  ctx.restore();
};

export const render = (
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  s: MunchSprites,
  now: number,
) => {
  if (!hedgePattern) {
    hedgePattern = ctx.createPattern(s.hedge, "repeat");
  }

  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  // Level-clear celebration: hedges pulse brighter
  const clearFlash =
    eng.phase === "clear" && Math.floor(eng.phaseT / 0.25) % 2 === 0;

  // Walls
  ctx.save();
  ctx.fillStyle = hedgePattern ?? WALL_EDGE;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (LAYOUT[y][x] !== "#") continue;
      ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    }
  }
  if (clearFlash) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#F6F1E7";
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (LAYOUT[y][x] !== "#") continue;
        ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
      }
    }
  }
  ctx.restore();

  // Ghost-house door (maze structure, like the walls)
  ctx.fillStyle = "#B9AC8F";
  ctx.fillRect(DOOR.x * TILE + 3, DOOR.y * TILE + TILE / 2 - 2, TILE - 6, 4);

  // Seeds & power acorns
  for (const idx of eng.seeds) {
    const x = (idx % COLS) * TILE + TILE / 2;
    const y = Math.floor(idx / COLS) * TILE + TILE / 2;
    drawSprite(ctx, s.seed, x, y, 8);
  }
  const pulse = 1 + Math.sin(now * 5) * 0.15;
  for (const idx of eng.powers) {
    const x = (idx % COLS) * TILE + TILE / 2;
    const y = Math.floor(idx / COLS) * TILE + TILE / 2;
    drawSprite(ctx, s.acorn, x, y, 18 * pulse);
  }

  // Bonus berry
  if (eng.berryActiveT > 0) {
    const blink = eng.berryActiveT < 2.5 && Math.floor(now / 0.25) % 2 === 0;
    if (!blink) {
      drawSprite(
        ctx,
        s.berry,
        BERRY_TILE.x * TILE + TILE / 2,
        BERRY_TILE.y * TILE + TILE / 2,
        22,
      );
    }
  }

  // Actors
  for (const g of eng.ghosts) drawGhost(ctx, g, eng, s, now);
  if (eng.phase !== "clear") drawMuncher(ctx, eng, s);
};

/** Reset cached pattern (fresh canvas context after remount). */
export const resetRenderCache = () => {
  hedgePattern = null;
};
