// The Undervault renderer. Sprites are placed and transformed, never drawn.
// The only flat fills are level structure and HUD bars: the ink field, the
// depth plate behind the grid, the health and boss meters. Floor geometry
// is real typography, the house style for this shelf, and every actor,
// item, card, and panel on screen is a shipped sprite.

import { FLOORS, PALETTE, STATUSES, relicById, type PanelSkin } from "./content.ts";
import { DOOR, MAP_H, MAP_W, STAIRS, WALL, idx } from "./dungeon.ts";
import type { Engine, Monster } from "./engine.ts";
import type { UndervaultSprites } from "./sprites.ts";

export const W = 960;
export const H = 540;

export const TILE = 32;
export const VIEW_COLS = 21;
export const VIEW_ROWS = 13;

const GRID_W = VIEW_COLS * TILE;
const GRID_H = VIEW_ROWS * TILE;
const FIELD_W = 704;
const GRID_X = Math.round((FIELD_W - GRID_W) / 2);
const GRID_Y = 22;
const PLATE_H = 396;
const PLATE_Y = GRID_Y + Math.round((GRID_H - PLATE_H) / 2);

const LOG_X = GRID_X;
const LOG_Y = 458;
const LOG_LINE = 17;

const BAND_X = FIELD_W + 8;
const BAND_W = 240;
const PANEL_H = 141;
const PANEL_Y = [14, 165, 316];

const CARD_W = 520;
const CARD_H = 283;
const CARD_X = Math.round((W - CARD_W) / 2);
const CARD_Y = 62;

const TONE_COLOR: Record<string, string> = {
  info: "rgba(244,230,193,0.72)",
  good: PALETTE.olive,
  bad: PALETTE.terra,
  gold: PALETTE.mustard,
};

const mono = (size: number, weight = 500) =>
  `${weight} ${size}px ui-monospace, "JetBrains Mono", monospace`;

const text = (
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
  weight = 500,
) => {
  ctx.font = mono(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
};

/** Fits a sprite inside a box, keeping its authored proportions. */
const place = (
  ctx: CanvasRenderingContext2D,
  art: HTMLCanvasElement,
  cx: number,
  bottom: number,
  maxH: number,
  maxW: number,
  alpha = 1,
) => {
  const scale = Math.min(maxH / art.height, maxW / art.width);
  const w = art.width * scale;
  const h = art.height * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(art, cx - w / 2, bottom - h, w, h);
  ctx.globalAlpha = 1;
};

const centred = (
  ctx: CanvasRenderingContext2D,
  art: HTMLCanvasElement,
  cx: number,
  cy: number,
  box: number,
  alpha = 1,
) => {
  const scale = Math.min(box / art.width, box / art.height);
  const w = art.width * scale;
  const h = art.height * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(art, cx - w / 2, cy - h / 2, w, h);
  ctx.globalAlpha = 1;
};

const bar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
) => {
  ctx.fillStyle = "rgba(26,20,13,0.55)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, h);
};

const camera = (eng: Engine) => ({
  x: Math.max(0, Math.min(MAP_W - VIEW_COLS, eng.px - (VIEW_COLS >> 1))),
  y: Math.max(0, Math.min(MAP_H - VIEW_ROWS, eng.py - (VIEW_ROWS >> 1))),
});

const monsterFrame = (m: Monster, time: number): number => {
  switch (m.art) {
    case "move":
      return 1;
    case "hit":
      return 2;
    case "attack":
      return 3;
    default:
      return m.awake && Math.floor(time * 2) % 2 === 1 ? 1 : 0;
  }
};

const hpColor = (ratio: number) =>
  ratio > 0.5 ? PALETTE.olive : ratio > 0.25 ? PALETTE.mustard : PALETTE.terra;

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  spr: UndervaultSprites,
  time: number,
  fallenFade: number,
) => {
  const cam = camera(eng);
  const cellX = (mx: number) => GRID_X + (mx - cam.x) * TILE;
  const cellY = (my: number) => GRID_Y + (my - cam.y) * TILE;
  const onScreen = (mx: number, my: number) =>
    mx >= cam.x && my >= cam.y && mx < cam.x + VIEW_COLS && my < cam.y + VIEW_ROWS;

  ctx.font = mono(21, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let vy = 0; vy < VIEW_ROWS; vy++) {
    for (let vx = 0; vx < VIEW_COLS; vx++) {
      const mx = cam.x + vx;
      const my = cam.y + vy;
      const at = idx(mx, my);
      if (eng.seen[at] !== 1) continue;
      const lit = eng.visible[at] === 1;
      const tile = eng.tiles[at];
      const glyph = tile === WALL ? "#" : tile === STAIRS ? ">" : tile === DOOR ? "+" : "·";
      ctx.fillStyle = !lit
        ? PALETTE.dim
        : tile === WALL
          ? PALETTE.wall
          : tile === STAIRS
            ? PALETTE.stairs
            : tile === DOOR
              ? PALETTE.mustard
              : PALETTE.floor;
      ctx.fillText(glyph, cellX(mx) + TILE / 2, cellY(my) + TILE / 2 + 1);
    }
  }

  for (const trap of eng.traps) {
    if (!trap.known || eng.visible[idx(trap.x, trap.y)] !== 1) continue;
    if (!onScreen(trap.x, trap.y)) continue;
    centred(
      ctx,
      trap.kind === "spike" ? spr.sites.spikes : spr.sites.snare,
      cellX(trap.x) + TILE / 2,
      cellY(trap.y) + TILE / 2,
      20,
      0.85,
    );
  }

  for (const item of eng.items) {
    if (eng.seen[idx(item.x, item.y)] !== 1) continue;
    if (!onScreen(item.x, item.y)) continue;
    const art =
      item.kind === "gold"
        ? spr.equipment.satchel
        : item.kind === "tonic"
          ? spr.statuses.heal
          : item.kind === "key"
            ? spr.equipment.key
            : item.kind === "relic"
              ? spr.relics[relicById(item.relic!).icon]
              : spr.equipment[item.gear!.icon];
    centred(
      ctx,
      art,
      cellX(item.x) + TILE / 2,
      cellY(item.y) + TILE / 2,
      20,
      eng.visible[idx(item.x, item.y)] === 1 ? 1 : 0.4,
    );
  }

  if (eng.fallenBoss && onScreen(eng.fallenBoss.x, eng.fallenBoss.y) && fallenFade > 0) {
    place(
      ctx,
      spr.bosses[eng.fallenBoss.art][2],
      cellX(eng.fallenBoss.x) + TILE / 2,
      cellY(eng.fallenBoss.y) + TILE,
      TILE * 2,
      TILE * 2,
      fallenFade,
    );
  }

  for (const m of eng.monsters) {
    if (eng.visible[idx(m.x, m.y)] !== 1 || !onScreen(m.x, m.y)) continue;
    place(
      ctx,
      spr.monsters[m.def.family][monsterFrame(m, time)],
      cellX(m.x) + TILE / 2,
      cellY(m.y) + TILE - 1,
      TILE,
      TILE,
    );
  }

  const boss = eng.boss;
  if (boss && eng.visible[idx(boss.x, boss.y)] === 1 && onScreen(boss.x, boss.y)) {
    const frame = boss.art === "attack" ? 1 : boss.art === "hit" ? 2 : 0;
    place(
      ctx,
      spr.bosses[boss.def.art][frame],
      cellX(boss.x) + TILE / 2,
      cellY(boss.y) + TILE - 1,
      TILE * 2,
      TILE * 1.6,
    );
    if (eng.lineWarning) {
      const pulse = 0.35 + 0.3 * Math.sin(time * 5);
      ctx.fillStyle = `rgba(192,96,58,${pulse.toFixed(3)})`;
      ctx.fillRect(GRID_X, cellY(boss.y), GRID_W, TILE);
      ctx.fillRect(cellX(boss.x), GRID_Y, TILE, GRID_H);
    }
  }

  if (onScreen(eng.px, eng.py)) {
    const cx = cellX(eng.px) + TILE / 2;
    const cy = cellY(eng.py) + TILE / 2;
    centred(ctx, spr.sites.sundisc, cx, cy, TILE, 0.9);
    centred(ctx, spr.portraits[eng.portraitArt][0], cx, cy, 26);
  }
};

const drawPanel =(
  ctx: CanvasRenderingContext2D,
  spr: UndervaultSprites,
  skin: PanelSkin,
  slot: number,
  selected: boolean,
) => {
  ctx.drawImage(spr.panels[skin][selected ? 1 : 0], BAND_X, PANEL_Y[slot], BAND_W, PANEL_H);
};

const drawCharacter = (
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  spr: UndervaultSprites,
  time: number,
) => {
  drawPanel(ctx, spr, "character", 0, eng.hp / eng.maxHp <= 0.25);
  const top = PANEL_Y[0];
  centred(ctx, spr.portraits[eng.portraitArt][0], BAND_X + 44, top + 66, 56);

  const x = BAND_X + 82;
  text(ctx, `HP ${eng.hp}/${eng.maxHp}`, x, top + 44, 12, PALETTE.cream);
  bar(ctx, x, top + 54, 128, 7, eng.hp / eng.maxHp, hpColor(eng.hp / eng.maxHp));
  text(ctx, `ATK ${eng.attack}`, x, top + 76, 12, PALETTE.label);
  text(ctx, `DEF ${eng.defense}`, x + 74, top + 76, 12, PALETTE.label);

  const pulse = 0.55 + 0.45 * Math.sin(time * 4);
  eng.statuses.forEach((status, i) => {
    const def = STATUSES[status.id];
    centred(ctx, spr.statuses[def.icon], x + 12 + i * 26, top + 100, 22, pulse);
    text(ctx, String(status.turns), x + 12 + i * 26, top + 114, 10, PALETTE.label, "center");
  });
};

const drawInventory = (ctx: CanvasRenderingContext2D, eng: Engine, spr: UndervaultSprites) => {
  drawPanel(ctx, spr, "inventory", 1, false);
  const top = PANEL_Y[1];
  const left = BAND_X + 26;

  centred(ctx, spr.equipment[eng.weapon?.icon ?? "sword"], left, top + 42, 22, eng.weapon ? 1 : 0.3);
  text(ctx, eng.weapon?.name ?? "Bare hands", left + 18, top + 42, 11, PALETTE.cream);
  centred(ctx, spr.equipment[eng.armor?.icon ?? "boots"], left, top + 66, 22, eng.armor ? 1 : 0.3);
  text(ctx, eng.armor?.name ?? "Travel clothes", left + 18, top + 66, 11, PALETTE.cream);

  centred(ctx, spr.statuses.heal, left, top + 92, 22, eng.tonics > 0 ? 1 : 0.3);
  text(ctx, `x${eng.tonics}`, left + 18, top + 92, 11, PALETTE.cream);
  centred(ctx, spr.equipment.key, left + 62, top + 92, 22, eng.keys > 0 ? 1 : 0.3);
  text(ctx, `x${eng.keys}`, left + 80, top + 92, 11, PALETTE.cream);
  text(ctx, `${eng.gold}g`, left + 128, top + 92, 12, PALETTE.mustard);

  eng.relics.forEach((relic, i) => {
    centred(ctx, spr.relics[relic.icon], left + 6 + i * 24, top + 118, 22);
  });
  if (eng.relics.length === 0) {
    text(ctx, "No relics yet", left, top + 118, 11, PALETTE.label);
  }
};

const drawCombat = (ctx: CanvasRenderingContext2D, eng: Engine, spr: UndervaultSprites) => {
  const boss = eng.boss;
  drawPanel(ctx, spr, "combat", 2, boss !== null && boss.awake);
  const top = PANEL_Y[2];
  const left = BAND_X + 26;
  const floor = FLOORS[Math.min(FLOORS.length - 1, eng.depth - 1)];

  text(ctx, floor.name.toUpperCase(), left, top + 44, 12, PALETTE.cream);
  text(ctx, `DEPTH ${eng.depth}/${FLOORS.length}`, left, top + 62, 11, PALETTE.label);

  if (boss) {
    centred(ctx, spr.bosses[boss.def.art][0], left + 14, top + 100, 42, boss.awake ? 1 : 0.35);
    if (boss.awake) {
      text(ctx, boss.def.name, left + 40, top + 88, 10, PALETTE.terra);
      bar(ctx, left + 40, top + 98, 130, 7, boss.hp / boss.maxHp, PALETTE.terra);
      const tell = boss.shielded
        ? "PLATE SHUT"
        : boss.winding
          ? "WINDING UP"
          : eng.lineWarning
            ? "BORE WHITE"
            : "";
      if (tell) text(ctx, tell, left + 40, top + 114, 10, PALETTE.mustard);
    } else {
      text(ctx, "Its keeper still sits.", left + 40, top + 100, 10, PALETTE.label);
    }
  } else {
    text(ctx, "The stair is open.", left, top + 100, 11, PALETTE.olive);
  }
};

const drawLog = (ctx: CanvasRenderingContext2D, eng: Engine) => {
  const latest = eng.msgs.slice(-3);
  latest.forEach((msg, i) => {
    const age = latest.length - 1 - i;
    ctx.globalAlpha = age === 0 ? 1 : age === 1 ? 0.62 : 0.34;
    text(ctx, msg.text, LOG_X, LOG_Y + i * LOG_LINE, 13, TONE_COLOR[msg.tone]);
    ctx.globalAlpha = 1;
  });
};

const wrap = (ctx: CanvasRenderingContext2D, value: string, size: number, maxW: number) => {
  ctx.font = mono(size, 500);
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const drawCard = (ctx: CanvasRenderingContext2D, eng: Engine, spr: UndervaultSprites) => {
  const card = eng.card;
  if (!card) return;
  ctx.fillStyle = "rgba(18,14,9,0.82)";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(spr.events[card.kind], CARD_X, CARD_Y, CARD_W, CARD_H);

  text(ctx, card.title, W / 2, CARD_Y + CARD_H + 30, 20, PALETTE.cream, "center", 700);
  wrap(ctx, card.body, 13, CARD_W - 40).forEach((line, i) => {
    text(ctx, line, W / 2, CARD_Y + CARD_H + 56 + i * 18, 13, PALETTE.label, "center");
  });
};

const drawChoosing = (
  ctx: CanvasRenderingContext2D,
  spr: UndervaultSprites,
  portraits: { name: string; perk: string; art: number }[],
) => {
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(spr.events.descent, CARD_X, 24, CARD_W, CARD_H * 0.62);
  text(ctx, "WHO GOES DOWN", W / 2, 40, 22, PALETTE.cream, "center", 700);

  portraits.forEach((p, i) => {
    const cx = 168 + i * 208;
    centred(ctx, spr.portraits[p.art][0], cx, 330, 128);
    text(ctx, p.name, cx, 412, 15, PALETTE.cream, "center", 700);
    wrap(ctx, p.perk, 12, 180).forEach((line, l) => {
      text(ctx, line, cx, 436 + l * 16, 12, PALETTE.label, "center");
    });
  });
};

export interface View {
  time: number;
  /** Seconds since the fallen boss appeared, or null when none has. */
  fallen: number | null;
  portraits: { name: string; perk: string; art: number }[];
}

export const draw = (
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  spr: UndervaultSprites,
  view: View,
) => {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(0, 0, W, H);

  if (eng.phase === "choosing") {
    drawChoosing(ctx, spr, view.portraits);
    return;
  }

  ctx.fillStyle = PALETTE.board;
  ctx.fillRect(0, GRID_Y - 8, FIELD_W, GRID_H + 16);
  const plate = spr.depths[Math.min(spr.depths.length - 1, eng.depth - 1)];
  ctx.globalAlpha = 0.35;
  ctx.drawImage(plate, 0, PLATE_Y, FIELD_W, PLATE_H);
  ctx.globalAlpha = 1;

  const fallenFade = view.fallen === null ? 0 : Math.max(0, 1 - view.fallen / 1.4);
  drawGrid(ctx, eng, spr, view.time, fallenFade);

  drawCharacter(ctx, eng, spr, view.time);
  drawInventory(ctx, eng, spr);
  drawCombat(ctx, eng, spr);

  text(ctx, `SCORE ${eng.score.toLocaleString()}`, BAND_X + 26, 480, 14, PALETTE.cream);
  text(ctx, `TURN ${eng.turn}   KILLS ${eng.kills}`, BAND_X + 26, 502, 11, PALETTE.label);

  drawLog(ctx, eng);

  if (eng.card) drawCard(ctx, eng, spr);
};
