// Sky Defense renderer. Sprites are placed and transformed, never drawn. The
// only flat fills are level geometry: the region sky, the ground strip, and
// the health bar. Ammo is canvas text over the ground strip.

import {
  BATTERY_X,
  BUILDING_X,
  GROUND_Y,
  H,
  TUNE,
  W,
  threatX,
  type Burst,
  type Engine,
  type Fx,
  type Threat,
} from "./engine.ts";
import type { BuildingKind } from "./waves.ts";
import type { EffectName, PropName, SkyDefenseSprites } from "./sprites.ts";

const GROUND = "#241A12";
const CREAM = "#F4E6C1";
const LABEL = "rgba(36,26,18,0.55)";
const BAR_BACK = "rgba(36,26,18,0.22)";
/** Olive, mustard, terracotta: intact, damaged, destroyed. */
const TIER_COLOR = ["#68723C", "#C99A32", "#B45735"];

const BAND_H = 140;
const BAND_TOP = GROUND_Y - BAND_H;
const BATTERY_H = 68;
const THREAT_W = 44;
const BUILDING_W = 64;

const FX_ART: Record<Fx["kind"], { name: EffectName | PropName; size: number }> = {
  "hit-burst": { name: "small-burst", size: 40 },
  "impact-star": { name: "impact-star", size: 52 },
  debris: { name: "debris-cluster", size: 56 },
  dust: { name: "dust-weather", size: 46 },
  "shield-ring": { name: "shield-ring-large", size: 150 },
  "repair-ring": { name: "repair-ring", size: 120 },
  "repair-drone": { name: "repair-drone", size: 40 },
};

const DAMAGED_PROP: Record<BuildingKind, PropName> = {
  house: "house-damaged",
  bridge: "bridge-damaged",
  observatory: "observatory-damaged",
};

const INTACT_PROP: Record<BuildingKind, PropName> = {
  house: "house-intact",
  bridge: "bridge-intact",
  observatory: "observatory-intact",
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

/** Anchors on the art's own bottom edge, which is its ground contact. */
const drawStanding = (
  ctx: CanvasRenderingContext2D,
  c: HTMLCanvasElement,
  x: number,
  groundY: number,
  h: number,
  alpha = 1,
) => {
  const w = (h * c.width) / c.height;
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, x - w / 2, groundY - h, w, h);
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

/**
 * One panel scaled to the band height and tiled outward from a centered
 * copy. Desert's panel is wider than the canvas at that height, so the rule
 * degenerates to the center crop it needs; mountain lands three tiles and
 * river city many, and none of them can leave a gap at the edges.
 */
const drawHorizonBand = (ctx: CanvasRenderingContext2D, panel: HTMLCanvasElement) => {
  const tileW = (BAND_H * panel.width) / panel.height;
  let x = BATTERY_X - tileW / 2;
  while (x > 0) x -= tileW;
  for (; x < W; x += tileW) ctx.drawImage(panel, x, BAND_TOP, tileW, BAND_H);
};

const drawThreat = (
  ctx: CanvasRenderingContext2D,
  spr: SkyDefenseSprites,
  t: Threat,
  time: number,
) => {
  const pair = spr.threats[t.family];
  const x = threatX(t, time);
  if (t.diedAt !== null) {
    drawSprite(ctx, pair.damage, x, t.y, THREAT_W);
    return;
  }
  // The authored motion frame carries the shape; the 6 fps beat is a scale
  // pulse, offset per threat so a wave does not breathe in unison.
  const pulse = Math.floor(time * 6 + t.id) % 2 === 0 ? 1 : 1.06;
  drawSprite(ctx, pair.motion, x, t.y, THREAT_W * pulse);
};

const drawBurst = (
  ctx: CanvasRenderingContext2D,
  spr: SkyDefenseSprites,
  b: Burst,
  time: number,
) => {
  const age = time - b.born;
  const grow = Math.min(1, age / TUNE.burstGrow);
  const r = b.radius * grow;
  const fade = Math.max(0, (age - TUNE.burstGrow) / TUNE.burstFade);
  // Alpha fade rather than additive blending: the sky is cream, and a
  // lighten pass over it reads as a high-contrast strobe.
  drawSprite(
    ctx,
    r < 40 ? spr.effects["small-burst"] : spr.effects["large-burst"],
    b.x,
    b.y,
    Math.max(8, r * 2),
    0,
    1 - fade,
  );
};

export const draw = (
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  spr: SkyDefenseSprites,
  coarse = false,
) => {
  const time = eng.time;
  const tier = eng.healthTier;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = eng.region.sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  drawHorizonBand(ctx, spr.horizons[eng.region.panel][tier]);

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  eng.region.buildings.forEach((kind, i) => {
    const name = tier === 0 ? INTACT_PROP[kind] : DAMAGED_PROP[kind];
    drawStanding(ctx, spr.props[name], BUILDING_X[i], GROUND_Y, BUILDING_W);
  });

  if (tier > 0) {
    for (const bx of BUILDING_X) {
      const rise = (time * 14 + bx) % 46;
      drawStanding(
        ctx,
        spr.effects["smoke-puff"],
        bx + 14,
        GROUND_Y - BUILDING_W - rise,
        26,
        0.5 - rise / 92,
      );
    }
  }

  drawStanding(ctx, spr.aim[eng.aimIndex], BATTERY_X, GROUND_Y, BATTERY_H);
  const action =
    time - eng.hitAt < TUNE.hitFlash
      ? "hit"
      : time - eng.firedAt < TUNE.fireFlash
        ? "fire"
        : eng.reloading > 0
          ? "reload"
          : null;
  if (action) drawStanding(ctx, spr.actions[action], BATTERY_X, GROUND_Y, BATTERY_H);

  for (const t of eng.threats) drawThreat(ctx, spr, t, time);

  for (const i of eng.interceptors) {
    drawSprite(ctx, spr.effects.interceptor, i.x, i.y, 20, i.angle + Math.PI / 2);
  }

  for (const b of eng.bursts) drawBurst(ctx, spr, b, time);

  for (const f of eng.fx) {
    const k = Math.max(0, Math.min(1, (time - f.born) / TUNE.fxTtl));
    const art = FX_ART[f.kind];
    const canvas =
      f.kind === "dust" ? spr.props[art.name as PropName] : spr.effects[art.name as EffectName];
    drawSprite(ctx, canvas, f.x, f.y, art.size * (1 + k * 0.3), 0, 1 - k);
  }

  if (eng.finalWave) {
    // The chevron marks the column of whichever threat is lowest, which is
    // the one about to land.
    let lead: Threat | null = null;
    for (const t of eng.threats) {
      if (t.diedAt === null && (!lead || t.y > lead.y)) lead = t;
    }
    if (lead) {
      const beat = 0.45 + 0.35 * Math.sin(time * 6);
      drawSprite(ctx, spr.effects["warning-chevron"], threatX(lead, time), 28, 36, 0, beat);
    }
  }

  // The radar screen's sweep is painted into the art; no spin overlay needed.
  drawSprite(ctx, spr.props["radar-screen"], 58, 56, 60);

  drawSprite(
    ctx,
    spr.effects["radar-ping"],
    eng.reticle.x,
    eng.reticle.y,
    coarse ? 44 : 38,
  );

  const barW = 240;
  const barX = BATTERY_X - barW / 2;
  ctx.fillStyle = BAR_BACK;
  ctx.fillRect(barX, 20, barW, 10);
  ctx.fillStyle = TIER_COLOR[tier];
  ctx.fillRect(barX, 20, (barW * eng.health) / TUNE.maxHealth, 10);
  text(ctx, `${eng.region.name.toUpperCase()}  ${eng.health}`, BATTERY_X, 44, 11, LABEL);

  text(
    ctx,
    eng.reloading > 0 ? "RELOADING" : `${eng.ammo}/${TUNE.magazine}`,
    BATTERY_X,
    GROUND_Y + 28,
    14,
    CREAM,
  );

  if (eng.phase === "region-clear") {
    text(
      ctx,
      `${eng.region.name.toUpperCase()} HELD`,
      BATTERY_X,
      BAND_TOP - 40,
      26,
      TIER_COLOR[0],
    );
  }
  if (eng.phase === "victory") {
    drawSprite(ctx, spr.props["shield-icon"], BATTERY_X, BAND_TOP - 60, 72);
    text(ctx, "SKY HELD", BATTERY_X, BAND_TOP - 6, 28, TIER_COLOR[0]);
  }
  if (eng.phase === "gameover") {
    drawSprite(ctx, spr.props["warning-icon"], BATTERY_X, BAND_TOP - 60, 72);
    text(ctx, "SKY LOST", BATTERY_X, BAND_TOP - 6, 28, TIER_COLOR[2]);
  }
};
