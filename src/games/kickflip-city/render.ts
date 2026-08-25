// Kickflip City renderer. Camera-translated sprite placement and transforms
// only. The one thing drawn rather than placed is the ink band under the lane,
// which is level geometry, plus its hairline edge and the HUD text.

import { DISTRICTS, GROUND_Y, type Course } from "./course.ts";
import { Engine, H, TUNE, W, type FxKind } from "./engine.ts";
import { SKATER_CELL, type FxArtName, type KickflipSprites, type SkaterState } from "./sprites.ts";

const INK = "#241A12"; // warm near-black under the lane, never pure black
const INK_EDGE = "#57422C";
const PAPER = "#F6F1E7";
const MUSTARD = "#D8A43A";
const TERRA = "#B7532F";

const BACKDROP_PARALLAX = 0.25;
const SILHOUETTE_PARALLAX = 0.5;
const STREET_PARALLAX = 0.75;

const FX_ART: Record<FxKind, FxArtName> = {
  "landing-puff": "dust-puff",
  "grind-sparks": "grind-sparks",
  "ollie-streak": "speed-streak",
  "combo-flash": "combo-star",
  dust: "impact-burst",
};

const FX_SIZE: Record<FxKind, number> = {
  "landing-puff": 26,
  "grind-sparks": 20,
  "ollie-streak": 22,
  "combo-flash": 34,
  dust: 30,
};

/** Draws a sprite centered on a point, with an optional roll. */
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

/** Draws a sprite standing on a surface, bottom-center anchored. */
const drawStanding = (
  ctx: CanvasRenderingContext2D,
  c: HTMLCanvasElement,
  x: number,
  baseY: number,
  w: number,
  h: number,
  angle = 0,
  alpha = 1,
) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, baseY);
  if (angle) ctx.rotate(angle);
  ctx.drawImage(c, -w / 2, -h, w, h);
  ctx.restore();
};

const drawLane = (ctx: CanvasRenderingContext2D, course: Course) => {
  for (const s of course.segments) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.lineTo(s.x1, H + 40);
    ctx.lineTo(s.x0, H + 40);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = INK_EDGE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0 + 1.5);
    ctx.lineTo(s.x1, s.y1 + 1.5);
    ctx.stroke();
  }
};

const skaterFrame = (eng: Engine, spr: KickflipSprites) => {
  const art = spr.skaters[Math.min(eng.districtIndex, spr.skaters.length - 1)];
  const facing = eng.facing < 0 ? 0 : 1;
  if (eng.stance === "grinding") return { c: art.grind[facing], angle: 0 };

  const poses = art.rolling[facing];
  if (eng.stance === "airborne") return { c: poses.ollie, angle: eng.trickTilt() };
  if (eng.stance === "bailing") return { c: poses.coast, angle: eng.time * 7 };

  // Pushing alternates the two authored rolling poses at a rate that rises with
  // speed; coasting holds the coast pose.
  if (eng.input.dir > 0 && Math.abs(eng.vx) < TUNE.pushSpeed - 6) {
    const hz = 2 + Math.abs(eng.vx) / 60;
    const state: SkaterState = Math.floor(eng.time * hz) % 2 === 0 ? "push" : "coast";
    return { c: poses[state], angle: 0 };
  }
  return { c: poses.coast, angle: 0 };
};

export const draw = (ctx: CanvasRenderingContext2D, eng: Engine, spr: KickflipSprites) => {
  const course = eng.course;
  const def = DISTRICTS[eng.districtIndex];
  const scroll = eng.scrollX;

  // District panorama, drawn at 1.5x and tiled so a long course never runs off
  // the end of it.
  const backdrop = spr.districts[eng.districtIndex];
  let bx = -((scroll * BACKDROP_PARALLAX) % W);
  if (bx > 0) bx -= W;
  ctx.drawImage(backdrop, bx, 0, W, H);
  ctx.drawImage(backdrop, bx + W, 0, W, H);

  // Parallax silhouettes between the panorama and the lane.
  for (const p of course.parallax) {
    const tile = spr.silhouettes[p.cell];
    const x = p.x - scroll * SILHOUETTE_PARALLAX;
    if (x < -160 || x > W + 160) continue;
    drawSprite(ctx, tile, x, p.y, tile.width * p.scale, 0, 0.55);
  }

  // Back-lane street life, never in the play lane.
  for (const actor of course.street) {
    const frames = spr.street[actor.family];
    const x = actor.x + actor.speed * eng.time - scroll * STREET_PARALLAX;
    if (x < -90 || x > W + 90) continue;
    const moving = actor.speed !== 0;
    const frame = moving
      ? frames[Math.floor(eng.time / 0.12 + actor.phase) % 2 === 0 ? 1 : 0]
      : frames[Math.floor(eng.time / 0.18 + actor.phase) % 2 === 0 ? 0 : 2];
    drawStanding(ctx, frame, x, GROUND_Y - 2, frame.width * 0.62, frame.height * 0.62, 0, 0.8);
  }

  ctx.save();
  ctx.translate(-Math.round(scroll), 0);

  drawLane(ctx, course);

  // Ramp and stair art sits on the segment it belongs to, stretched to the
  // slope's own box. Both are authored facing the way the lane runs: the curb
  // ramp rises to the right, the stair set descends to the right.
  for (const s of course.segments) {
    if (s.kind === "flat") continue;
    const art = spr.props[s.kind === "ramp" ? "curb-ramp" : "stairs"];
    const top = Math.min(s.y0, s.y1);
    drawStanding(ctx, art, (s.x0 + s.x1) / 2, Math.max(s.y0, s.y1), s.x1 - s.x0, Math.max(s.y0, s.y1) - top);
  }

  for (const p of course.props) {
    drawStanding(ctx, spr.props[p.kind], p.x, p.baseY, p.w, p.h);
  }

  for (const g of course.grindables) {
    // Rails and ledges alike are drawn down to the lane, so the art's legs
    // land on the pavement whatever height the grind line sits at.
    drawStanding(ctx, spr.props[g.kind], (g.x0 + g.x1) / 2, GROUND_Y, g.x1 - g.x0, GROUND_Y - g.y);
  }

  for (const o of course.obstacles) {
    drawStanding(ctx, spr.props[o.kind], o.x, o.baseY, o.w, o.h);
  }

  // Checkpoint and finish markers, pulsing on the spot.
  const pulse = 1 + Math.sin(eng.time * 3) * 0.08;
  drawSprite(ctx, spr.ui.checkpoint, course.startX, GROUND_Y - 46, 26 * pulse, 0, 0.85);
  ctx.strokeStyle = MUSTARD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(course.finishX, GROUND_Y);
  ctx.lineTo(course.finishX, GROUND_Y - 96);
  ctx.stroke();
  drawSprite(ctx, spr.ui.trophy, course.finishX, GROUND_Y - 112, 30 * pulse);

  const { c: frame, angle } = skaterFrame(eng, spr);
  const scale = TUNE.drawH / SKATER_CELL;
  drawStanding(ctx, frame, eng.x, eng.feetY, frame.width * scale, frame.height * scale, angle);

  for (const f of eng.fx) {
    const age = (eng.time - f.born) / 0.45;
    const art = spr.fx[FX_ART[f.kind]];
    drawSprite(ctx, art, f.x, f.y, FX_SIZE[f.kind] * (0.7 + age * 0.7), 0, 1 - age);
  }

  ctx.restore();

  // Weather overlay: one tile drifting slowly across the whole frame.
  const sky = spr.weather[def.weatherCell];
  const drift = (eng.time * 14) % (sky.width * 1.6);
  ctx.globalAlpha = 0.16;
  for (let i = -1; i < Math.ceil(W / (sky.width * 1.6)) + 1; i++) {
    ctx.drawImage(sky, i * sky.width * 1.6 - drift, 8, sky.width * 1.6, sky.height * 1.6);
  }
  ctx.globalAlpha = 1;

  // HUD.
  ctx.textAlign = "center";
  ctx.fillStyle = eng.clock <= 10 ? TERRA : PAPER;
  ctx.font = "700 30px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(Math.ceil(eng.clock).toString().padStart(2, "0"), W / 2, 44);

  if (eng.line.length > 0) {
    const total = Math.round(eng.linePoints * eng.multiplier);
    ctx.fillStyle = MUSTARD;
    ctx.font = "600 15px ui-monospace, monospace";
    ctx.fillText(
      `${eng.line.length} LINK${eng.line.length === 1 ? "" : "S"}  x${eng.multiplier.toFixed(1)}  ${total}`,
      W / 2,
      68,
    );
  }

  if (eng.stance === "grinding") {
    const barW = 150;
    ctx.fillStyle = "rgba(246,241,231,0.22)";
    ctx.fillRect(W / 2 - barW / 2, 82, barW, 6);
    ctx.fillStyle = Math.abs(eng.balance) > 0.7 ? TERRA : MUSTARD;
    ctx.fillRect(W / 2 - 4 + (eng.balance * barW) / 2, 80, 8, 10);
  }

  if (eng.phase === "district-clear" || eng.phase === "victory") {
    ctx.fillStyle = PAPER;
    ctx.font = "800 34px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      eng.phase === "victory" ? "CITY CLEARED" : `${course.name.toUpperCase()} CLEARED`,
      W / 2,
      H / 2,
    );
  }
  ctx.textAlign = "left";
};
