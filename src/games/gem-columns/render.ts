// Gem Columns renderer. Sprites are placed and transformed, never drawn. The
// only flat fills are level geometry: the canvas ground, the side bands and
// their hairlines, and the board ink panel. Score and chain labels are canvas
// text over authored blank frames.

import {
  COLS,
  EMPTY,
  H,
  HIDDEN_ROWS,
  ROWS,
  TUNE,
  VISIBLE_ROWS,
  W,
  cellAt,
  chainMultiplier,
  topOccupiedRow,
  type Engine,
  type Fx,
} from "./engine.ts";
import { GEM_STATE, type GemColumnsSprites } from "./sprites.ts";

const GROUND = "#241A12";
const BAND_FILL = "rgba(24,19,13,0.92)";
const HAIRLINE = "rgba(244,230,193,0.18)";
const PANEL = "rgba(20,16,12,0.93)";
const PANEL_EDGE = "rgba(244,230,193,0.16)";
const LABEL = "rgba(244,230,193,0.62)";
const VALUE = "#F4E6C1";

const BAND = 90;
const TILE = 30;
const BOARD_W = COLS * TILE;
const BOARD_H = VISIBLE_ROWS * TILE;
const BOARD_PAD = 6;

const WELL_SCALE = 1.3;
const WELL_W = 200 * WELL_SCALE;
const WELL_H = 400 * WELL_SCALE;
const WELL_Y = (H - WELL_H) / 2;

// Measured board-opening centers of each well-surrounds.png panel, in
// panel-local pixels. The board is placed on these, not on the panel center,
// because the authored openings sit off-center by up to 14 px.
const OPENING = [
  { x: 97, y: 199.5 },
  { x: 100, y: 186 },
  { x: 100.5, y: 191 },
];

const FX_SIZE: Record<Fx["kind"], number> = {
  "landing-puff": 44,
  "cascade-arc": 130,
  "clear-burst": 48,
  "match-sparkle": 30,
  "level-rays": 230,
};

const drawSprite = (
  ctx: CanvasRenderingContext2D,
  c: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  alpha = 1,
) => {
  const h = (w * c.height) / c.width;
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, x - w / 2, y - h / 2, w, h);
  ctx.globalAlpha = 1;
};

const text = (
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
) => {
  ctx.font = `600 ${size}px ui-monospace, "JetBrains Mono", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
};

export const draw = (
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  spr: GemColumnsSprites,
) => {
  const opening = OPENING[eng.level.panel];
  const wellX = W / 2 - opening.x * WELL_SCALE;
  const boardY = WELL_Y + opening.y * WELL_SCALE;
  const boardX0 = W / 2 - BOARD_W / 2;
  const boardY0 = boardY - BOARD_H / 2;
  const cx = (col: number) => boardX0 + col * TILE + TILE / 2;
  const cy = (row: number) => boardY0 + (row - HIDDEN_ROWS) * TILE + TILE / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, H);

  ctx.drawImage(spr.environments[eng.level.panel], BAND, 0, H, H);

  ctx.fillStyle = BAND_FILL;
  ctx.fillRect(0, 0, BAND, H);
  ctx.fillRect(W - BAND, 0, BAND, H);
  ctx.fillStyle = HAIRLINE;
  ctx.fillRect(BAND, 0, 1, H);
  ctx.fillRect(W - BAND - 1, 0, 1, H);

  ctx.drawImage(spr.wells[eng.level.panel], wellX, WELL_Y, WELL_W, WELL_H);

  // The ink panel deliberately overlaps the surround's inner frame wherever
  // the authored opening is narrower than six tiles; the board geometry is
  // fixed and the art dresses it.
  ctx.beginPath();
  ctx.roundRect(
    boardX0 - BOARD_PAD,
    boardY0 - BOARD_PAD,
    BOARD_W + BOARD_PAD * 2,
    BOARD_H + BOARD_PAD * 2,
    10,
  );
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.stroke();

  ctx.save();
  ctx.clip();

  const flashing = eng.matched.length > 0 ? new Set(eng.matched) : null;
  for (let row = HIDDEN_ROWS; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const index = cellAt(col, row);
      const family = eng.grid[index];
      if (family === EMPTY) continue;
      const state = flashing?.has(index)
        ? GEM_STATE.matched
        : eng.danger && row - HIDDEN_ROWS <= TUNE.dangerVisRow
          ? GEM_STATE.cracked
          : GEM_STATE.normal;
      drawSprite(ctx, spr.gems[family][state], cx(col), cy(row), TILE);
    }
  }

  for (const gem of eng.clearing) {
    const k = Math.max(0, Math.min(1, (eng.time - gem.born) / TUNE.clearFxSeconds));
    drawSprite(
      ctx,
      spr.gems[gem.family][GEM_STATE.clear],
      cx(gem.col),
      cy(gem.row),
      TILE * (1 + k * 0.5),
      1 - k,
    );
  }

  const piece = eng.piece;
  const landing = eng.landingRow();
  if (piece && landing >= 0) {
    for (let i = 0; i < 3; i++) {
      const row = landing - i;
      if (row <= piece.row || row < HIDDEN_ROWS) continue;
      drawSprite(ctx, spr.specials["landing-marker"], cx(piece.col), cy(row), TILE, 0.4);
    }
  }

  ctx.restore();

  // A fresh triad starts in the hidden rows and descends into the well
  // mouth. Clipping to the panel plus a short mouth window keeps it from
  // floating over the surround's crown art at spawn.
  if (piece) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      boardX0 - BOARD_PAD,
      boardY0 - 44,
      BOARD_W + BOARD_PAD * 2,
      BOARD_H + BOARD_PAD + 44,
    );
    ctx.clip();
    const state =
      Math.floor(eng.time * TUNE.pulseFps) % 2 === 0 ? GEM_STATE.normal : GEM_STATE.pulse;
    for (let i = 0; i < 3; i++) {
      drawSprite(ctx, spr.gems[piece.gems[2 - i]][state], cx(piece.col), cy(piece.row - i), TILE);
    }
    ctx.restore();
  }

  if (eng.danger) {
    const beat = 0.45 + 0.35 * Math.sin(eng.time * 7);
    drawSprite(ctx, spr.effects["danger-pulse"], W / 2, boardY0 + 26, 130, beat * 0.55);
    for (let col = 0; col < COLS; col++) {
      let top = ROWS;
      for (let row = HIDDEN_ROWS; row < ROWS; row++) {
        if (eng.grid[cellAt(col, row)] !== EMPTY) {
          top = row;
          break;
        }
      }
      if (top - HIDDEN_ROWS > TUNE.dangerVisRow) continue;
      drawSprite(ctx, spr.specials["danger-marker"], cx(col), boardY0 - 14, 24, beat);
    }
  }

  for (const f of eng.fx) {
    const k = Math.max(0, Math.min(1, (eng.time - f.born) / TUNE.fxTtl));
    drawSprite(
      ctx,
      spr.effects[f.kind],
      cx(f.col),
      cy(f.row),
      FX_SIZE[f.kind] * (1 + k * 0.35),
      1 - k,
    );
  }

  drawSprite(ctx, spr.ui["blank-score-plaque"], 70, 120, 150);
  text(ctx, "SCORE", 70, 62, 10, LABEL);
  // Ink digits: the plaque's blank band is cream, so the shared cream VALUE
  // color would vanish on it.
  text(ctx, eng.score.toLocaleString(), 70, 122, 18, "#241A12");
  drawSprite(ctx, spr.ui[eng.level.ornament], 70, 252, 66);

  // The authored next-triad frame holds three slots in a row, so the preview
  // lays the triad out horizontally: leftmost slot is the top gem.
  text(ctx, "NEXT", 650, 82, 10, LABEL);
  drawSprite(ctx, spr.ui["next-triad-frame"], 650, 122, 120);
  for (let i = 0; i < 3; i++) {
    drawSprite(ctx, spr.gems[eng.nextGems[i]][GEM_STATE.normal], 650 + (i - 1) * 34, 122, 26);
  }

  if (eng.chain >= 2) {
    drawSprite(ctx, spr.ui["chain-counter"], 650, 240, 54);
    text(ctx, `x${chainMultiplier(eng.chain)}`, 650, 276, 14, VALUE);
  }

  if (eng.danger) {
    const beat = 0.55 + 0.4 * Math.sin(eng.time * 7);
    drawSprite(ctx, spr.ui["danger-meter"], 650, 336, 54, beat);
    text(
      ctx,
      `${Math.max(0, topOccupiedRow(eng.grid) - HIDDEN_ROWS)} FREE`,
      650,
      372,
      11,
      VALUE,
    );
  }

  if (eng.phase === "level-clear") {
    drawSprite(ctx, spr.specials["level-seal"], W / 2, boardY, 170);
  }
  if (eng.phase === "victory") {
    drawSprite(ctx, spr.ui["complete-laurel"], W / 2, boardY, 240);
  }
};
