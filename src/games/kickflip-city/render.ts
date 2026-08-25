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

const LANE_FACE = 52; // px of solid pavement face under the surface line

const drawLane = (ctx: CanvasRenderingContext2D, course: Course) => {
  for (const s of course.segments) {
    // A solid face marks the ride surface; below it the district art shows
    // through a dim wash instead of a dead black slab.
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.lineTo(s.x1, s.y1 + LANE_FACE);
    ctx.lineTo(s.x0, s.y0 + LANE_FACE);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(36,26,18,0.55)";
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0 + LANE_FACE);
    ctx.lineTo(s.x1, s.y1 + LANE_FACE);
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
  if (eng.stance === "bailing") {
    // A crash tips the skater over and holds them down, rather than the old
    // continuous pinwheel, which read as a glitch instead of a fall.
    const p = 1 - eng.tumbleLeft / TUNE.bailTumble;
    const tip = -1.7 * Math.min(1, p * 1.9) * (eng.facing < 0 ? -1 : 1);
    return { c: poses.coast, angle: tip };
  }

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

  // District panorama, mirror-tiled: the art is not seam-matched, so every
  // other copy flips horizontally and the join always mirrors itself.
  const backdrop = spr.districts[eng.districtIndex];
  const off = scroll * BACKDROP_PARALLAX;
  const firstTile = Math.floor(off / W);
  for (let i = 0; i < 2; i++) {
    const tile = firstTile + i;
    const x = tile * W - off;
    ctx.save();
    if (((tile % 2) + 2) % 2 === 1) {
      ctx.translate(x + W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(backdrop, 0, 0, W, H);
    } else {
      ctx.drawImage(backdrop, x, 0, W, H);
    }
    ctx.restore();
  }

  // Parallax silhouettes between the panorama and the lane. Only the
  // ground-anchored kinds (olive tree, lamp posts, fence, cells 3..5) draw;
  // the roofline tiles floated in mid-air like postcards over the panorama.
  for (const p of course.parallax) {
    if (p.cell < 3) continue;
    const tile = spr.silhouettes[p.cell];
    const x = p.x - scroll * SILHOUETTE_PARALLAX;
    if (x < -160 || x > W + 160) continue;
    const w = tile.width * p.scale;
    drawStanding(ctx, tile, x, GROUND_Y - 24, w, (w * tile.height) / tile.width, 0, 0.5);
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
    // Raised, smaller, and dimmer than the play lane, so the crowd reads as
    // a back walkway rather than as obstacles in the skater's path.
    drawStanding(ctx, frame, x, GROUND_Y - 26, frame.width * 0.5, frame.height * 0.5, 0, 0.65);
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

  // HUD. A soft ink chip keeps the readouts legible over any backdrop.
  ctx.textAlign = "center";
  const lineOpen = eng.line.length > 0;
  const chipW = lineOpen ? 250 : 96;
  ctx.fillStyle = "rgba(36,26,18,0.72)";
  ctx.beginPath();
  ctx.roundRect(W / 2 - chipW / 2, 12, chipW, lineOpen ? 66 : 44, 14);
  ctx.fill();
  ctx.fillStyle = eng.clock <= 10 ? TERRA : PAPER;
  ctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(Math.ceil(eng.clock).toString().padStart(2, "0"), W / 2, 42);

  if (lineOpen) {
    const total = Math.round(eng.linePoints * eng.multiplier);
    ctx.fillStyle = MUSTARD;
    ctx.font = "600 14px ui-monospace, monospace";
    ctx.fillText(
      `${eng.line.length} LINK${eng.line.length === 1 ? "" : "S"}  x${eng.multiplier.toFixed(1)}  ${total}`,
      W / 2,
      66,
    );
  }

  if (eng.stance === "grinding") {
    const barW = 150;
    ctx.fillStyle = "rgba(246,241,231,0.22)";
    ctx.fillRect(W / 2 - barW / 2, 92, barW, 6);
    ctx.fillStyle = Math.abs(eng.balance) > 0.7 ? TERRA : MUSTARD;
    ctx.fillRect(W / 2 - 4 + (eng.balance * barW) / 2, 90, 8, 10);
  }

  if (eng.phase === "district-clear") {
    const lapped = eng.districtIndex === DISTRICTS.length - 1 && eng.lap > 0;
    ctx.fillStyle = PAPER;
    ctx.font = "800 34px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      lapped ? `LAP ${eng.lap} COMPLETE` : `${course.name.toUpperCase()} CLEARED`,
      W / 2,
      H / 2,
    );
    if (lapped) {
      ctx.font = "600 15px ui-monospace, monospace";
      ctx.fillStyle = MUSTARD;
      ctx.fillText("FASTER BOARD, TIGHTER CLOCK, NEW STREETS", W / 2, H / 2 + 30);
    }
  }
  ctx.textAlign = "left";
};
