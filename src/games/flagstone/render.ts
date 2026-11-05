// Flagstone renderer. No sprites: a nonogram's picture IS the puzzle, so the
// only flat fills here are the paper surround, the ink playfield panel, stone
// cells, flag marks, and hairlines — the same "flat geometry only" rule the
// other cabinets follow.

import { FLAGGED, FILLED, type Engine } from "./engine.ts";

export const W = 900;
export const H = 620;

const PAPER = "#F6F1E7";
const INK = "#2B241D";
const STONE = "#C4491F";
const STONE_LIP = "#A93A16";
const FLAG = "#E6A518";
const HAIR = "rgba(246,241,231,0.13)";
const MAJOR = "rgba(246,241,231,0.32)";
const CLUE = "rgba(246,241,231,0.68)";
const CLUE_DONE = "#9AA86A";
const CURSOR = "#F6F1E7";

const PAD = 26;
const CLUE_UNIT = 19;

export interface Layout {
  cell: number;
  originX: number;
  originY: number;
  gutterL: number;
  gutterT: number;
  boardW: number;
  boardH: number;
}

/** Board metrics for the current puzzle. Pure so the shell can reuse it. */
export const layout = (eng: Engine): Layout => {
  const p = eng.puzzle;
  let maxRowClues = 1;
  for (const clue of p.rowClues) maxRowClues = Math.max(maxRowClues, clue.length);
  let maxColClues = 1;
  for (const clue of p.colClues) maxColClues = Math.max(maxColClues, clue.length);

  const gutterL = maxRowClues * CLUE_UNIT + 12;
  const gutterT = maxColClues * CLUE_UNIT + 12;
  const availW = W - PAD * 2 - gutterL;
  const availH = H - PAD * 2 - gutterT;
  const cell = Math.max(12, Math.floor(Math.min(availW / p.w, availH / p.h)));
  const boardW = cell * p.w;
  const boardH = cell * p.h;

  // Centre the whole panel: a small slab otherwise sits in the top-left of a
  // wide paper sheet, which reads as a layout bug rather than a board.
  const panelW = gutterL + boardW + 10;
  const panelH = gutterT + boardH + 10;

  return {
    cell,
    gutterL,
    gutterT,
    boardW,
    boardH,
    originX: Math.round((W - panelW) / 2) + gutterL,
    originY: Math.round((H - panelH) / 2) + gutterT,
  };
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

export const render = (ctx: CanvasRenderingContext2D, eng: Engine) => {
  const p = eng.puzzle;
  const L = layout(eng);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Ink panel behind the clues and grid.
  const panelX = L.originX - L.gutterL;
  const panelY = L.originY - L.gutterT;
  const panelW = L.gutterL + L.boardW + 10;
  const panelH = L.gutterT + L.boardH + 10;
  ctx.fillStyle = INK;
  roundRect(ctx, panelX, panelY, panelW, panelH, 22);
  ctx.fill();

  const clueFont = Math.max(10, Math.min(CLUE_UNIT - 4, 15));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Column clues: stacked upward from the top of the grid.
  for (let x = 0; x < p.w; x++) {
    const clue = p.colClues[x];
    ctx.fillStyle = eng.colDone[x] ? CLUE_DONE : CLUE;
    ctx.font = `600 ${clueFont}px "JetBrains Mono", ui-monospace, monospace`;
    for (let i = 0; i < clue.length; i++) {
      const row = clue.length - 1 - i;
      const cx = L.originX + x * L.cell + L.cell / 2;
      const cy = L.originY - (row + 1) * CLUE_UNIT + CLUE_UNIT / 2;
      ctx.fillText(String(clue[i]), cx, cy);
    }
  }

  // Row clues: right-aligned against the left of the grid.
  ctx.textAlign = "right";
  for (let y = 0; y < p.h; y++) {
    const clue = p.rowClues[y];
    ctx.fillStyle = eng.rowDone[y] ? CLUE_DONE : CLUE;
    ctx.font = `600 ${clueFont}px "JetBrains Mono", ui-monospace, monospace`;
    const cy = L.originY + y * L.cell + L.cell / 2;
    for (let i = 0; i < clue.length; i++) {
      const col = clue.length - 1 - i;
      ctx.fillText(String(clue[i]), L.originX - 8 - col * CLUE_UNIT, cy);
    }
  }

  // Grid hairlines, with every fifth line heavier.
  for (let x = 0; x <= p.w; x++) {
    ctx.strokeStyle = x % 5 === 0 ? MAJOR : HAIR;
    ctx.lineWidth = x % 5 === 0 ? 1.4 : 1;
    const px = L.originX + x * L.cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, L.originY);
    ctx.lineTo(px, L.originY + L.boardH);
    ctx.stroke();
  }
  for (let y = 0; y <= p.h; y++) {
    ctx.strokeStyle = y % 5 === 0 ? MAJOR : HAIR;
    ctx.lineWidth = y % 5 === 0 ? 1.4 : 1;
    const py = L.originY + y * L.cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(L.originX, py);
    ctx.lineTo(L.originX + L.boardW, py);
    ctx.stroke();
  }

  // Stones and flags.
  const inset = Math.max(1, Math.round(L.cell * 0.08));
  const lip = Math.max(2, Math.round(L.cell * 0.14));
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const mark = eng.markAt(y, x);
      if (mark === 0) continue;
      const cx = L.originX + x * L.cell;
      const cy = L.originY + y * L.cell;

      if (mark === FILLED) {
        ctx.fillStyle = STONE;
        roundRect(ctx, cx + inset, cy + inset, L.cell - inset * 2, L.cell - inset * 2, 4);
        ctx.fill();
        // A darker lip along the bottom so stones read as set, not painted.
        ctx.fillStyle = STONE_LIP;
        roundRect(ctx, cx + inset, cy + L.cell - inset - lip, L.cell - inset * 2, lip, 3);
        ctx.fill();
      } else if (mark === FLAGGED) {
        ctx.strokeStyle = FLAG;
        ctx.lineWidth = Math.max(1.5, L.cell * 0.07);
        roundRect(
          ctx,
          cx + inset + 1,
          cy + inset + 1,
          L.cell - inset * 2 - 2,
          L.cell - inset * 2 - 2,
          4,
        );
        ctx.stroke();
        ctx.fillStyle = FLAG;
        ctx.beginPath();
        ctx.arc(cx + L.cell / 2, cy + L.cell / 2, Math.max(2, L.cell * 0.11), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Cursor ring last so it sits above everything.
  if (eng.phase === "playing") {
    const cx = L.originX + eng.cursorCol * L.cell;
    const cy = L.originY + eng.cursorRow * L.cell;
    ctx.strokeStyle = CURSOR;
    ctx.lineWidth = 2.5;
    roundRect(ctx, cx + 1, cy + 1, L.cell - 2, L.cell - 2, 4);
    ctx.stroke();
  }
};
