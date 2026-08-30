// Kickflip City renderer. Camera-translated sprite placement and transforms
// only. The one thing drawn rather than placed is the ink band under the lane,
// which is level geometry, plus its hairline edge and the HUD text.

import { DISTRICTS, GROUND_Y, type Course } from "./course.ts";
import { Engine, H, TUNE, W, type FxKind } from "./engine.ts";
import { type FxArtName, type KickflipSprites, type MotionState } from "./sprites.ts";

const INK = "#241A12"; // warm near-black under the lane, never pure black
const PAPER = "#F6F1E7";
const MUSTARD = "#D8A43A";
const TERRA = "#B7532F";

const BACKDROP_PARALLAX = 0.25;
const CROWD_PARALLAX = 0.82;
const MOTION_DRAW_SIZE = 112;

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
  mirror = false,
  bottomInset = 0,
) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, baseY);
  if (mirror) ctx.scale(-1, 1);
  if (angle) ctx.rotate(angle);
  ctx.drawImage(c, -w / 2, -h + bottomInset, w, h);
  ctx.restore();
};

const LANE_FACE = 28;

const drawLane = (ctx: CanvasRenderingContext2D, course: Course) => {
  for (const s of course.segments) {
    // The course owns every pixel below its top edge. Keeping the lane opaque
    // prevents background architecture from reading as playable geometry.
    ctx.fillStyle = course.palette.lane;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.lineTo(s.x1, s.y1 + LANE_FACE);
    ctx.lineTo(s.x0, s.y0 + LANE_FACE);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = course.palette.foundation;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0 + LANE_FACE);
    ctx.lineTo(s.x1, s.y1 + LANE_FACE);
    ctx.lineTo(s.x1, H + 40);
    ctx.lineTo(s.x0, H + 40);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = course.palette.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0 + 1.5);
    ctx.lineTo(s.x1, s.y1 + 1.5);
    ctx.stroke();
  }
};

export const skaterPose = (eng: Engine) => {
  const mirror = eng.facing < 0;
  let state: MotionState = "coast";
  let angle = 0;
  let xOffset = 0;
  let yOffset = 0;

  if (eng.stance === "bailing") {
    const progress = 1 - eng.tumbleLeft / TUNE.bailTumble;
    const airborne = progress < 0.56;
    state = airborne ? "bail-air" : "bail-ground";
    xOffset = eng.facing * Math.min(22, progress * 34);
    yOffset = airborne ? -Math.sin((progress / 0.56) * Math.PI) * 18 : 0;
    angle = airborne ? eng.facing * Math.sin(progress * Math.PI) * 0.16 : 0;
  } else if (eng.stance === "grinding") {
    state = "grind";
    angle = eng.balance * 0.08;
  } else if (eng.stance === "airborne") {
    const trick = eng.trick;
    if (trick?.kind === "grab") {
      state = "grab";
      angle = eng.facing * TUNE.grabTilt * 0.35;
    } else if (trick) {
      const progress = Math.min(1, trick.elapsed / TUNE.flipTime);
      const under: MotionState = trick.kind === "kickflip" ? "kickflip-under" : "heelflip-under";
      state = progress < 0.28 ? "kickflip-start" : progress < 0.74 ? under : "catch";
      angle = Math.sin(progress * Math.PI * 2) * 0.07 * (trick.kind === "kickflip" ? 1 : -1);
    } else if (eng.vy < -420) {
      state = "pop";
    } else if (eng.vy < -120) {
      state = "ollie-rise";
    } else if (eng.vy < 220) {
      state = "ollie-apex";
    } else {
      state = "catch";
    }
  } else if (eng.input.crouch || eng.crouchTime > 0) {
    state = "crouch";
  } else if (eng.input.dir > 0) {
    const phase = eng.pushTime / TUNE.pushCycle;
    state = phase < 0.2 ? "push-plant" : phase < 0.52 ? "push-extend" : phase < 0.78 ? "push-recover" : "coast";
  }

  return { state, angle, mirror, xOffset, yOffset };
};

const skaterFrame = (eng: Engine, spr: KickflipSprites) => {
  const art = spr.skaterMotion[eng.districtIndex % spr.skaterMotion.length];
  const pose = skaterPose(eng);
  return {
    c: art.frames[pose.state],
    bottomInset: art.bottomInsets[pose.state] * MOTION_DRAW_SIZE,
    ...pose,
  };
};

export const draw = (ctx: CanvasRenderingContext2D, eng: Engine, spr: KickflipSprites) => {
  const course = eng.course;
  const scroll = eng.scrollX;
  const props = spr.propSets[course.propVariant];

  // District panorama, mirror-tiled: the art is not seam-matched, so every
  // other copy flips horizontally and the join always mirrors itself.
  const backdrop = spr.districts[course.backdropIndex];
  const off = scroll * BACKDROP_PARALLAX + course.backdropPhase * W;
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

  // Authored audience groups react to presentation state from the engine. The
  // lane draws over their feet, keeping the audience unmistakably behind the
  // collision surface instead of mixed into it.
  for (const audience of course.crowd) {
    const frames = spr.crowd[audience.family];
    const x = audience.x - scroll * CROWD_PARALLAX;
    if (x < -150 || x > W + 150) continue;
    const reaction = eng.crowdReaction;
    const frameIndex =
      reaction >= 2 && Math.floor(eng.time * 7 + audience.phase) % 2 === 0
        ? Math.max(1, reaction - 1)
        : reaction;
    const frame = frames[frameIndex];
    const size = 110 * audience.scale;
    drawStanding(ctx, frame, x, GROUND_Y, size, size, 0, 0.74);
  }

  ctx.save();
  ctx.translate(-Math.round(scroll), 0);

  drawLane(ctx, course);

  // Ramp and stair art sits on the segment it belongs to, stretched to the
  // slope's own box. Both are authored facing the way the lane runs: the curb
  // ramp rises to the right, the stair set descends to the right.
  for (const s of course.segments) {
    if (s.kind === "flat") continue;
    const art = props[s.kind === "ramp" ? "curb-ramp" : "stairs"];
    const top = Math.min(s.y0, s.y1);
    drawStanding(ctx, art, (s.x0 + s.x1) / 2, Math.max(s.y0, s.y1), s.x1 - s.x0, Math.max(s.y0, s.y1) - top);
  }

  for (const g of course.grindables) {
    // Rails and ledges alike are drawn down to the lane, so the art's legs
    // land on the pavement whatever height the grind line sits at.
    drawStanding(ctx, props[g.kind], (g.x0 + g.x1) / 2, GROUND_Y, g.x1 - g.x0, GROUND_Y - g.y);
  }

  for (const o of course.obstacles) {
    drawStanding(ctx, props[o.kind], o.x, o.baseY, o.w, o.h);
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

  const presentation = skaterFrame(eng, spr);
  if (eng.stance === "rolling" && Math.abs(eng.vx) > TUNE.pushSpeed * 0.7) {
    const streakX = eng.x - eng.facing * 48;
    const pulse = 0.65 + Math.sin(eng.time * 15) * 0.15;
    drawSprite(ctx, spr.fx["speed-streak"], streakX, eng.feetY - 28, 28, 0, pulse);
  }
  if (eng.stance === "airborne" && eng.trick && eng.trick.kind !== "grab") {
    const progress = Math.min(1, eng.trick.elapsed / TUNE.flipTime);
    drawSprite(
      ctx,
      spr.fx["flip-spin"],
      eng.x,
      eng.feetY - 23,
      34 + Math.sin(progress * Math.PI) * 8,
      (progress - 0.5) * 0.35,
      Math.sin(progress * Math.PI) * 0.72,
    );
  }
  drawStanding(
    ctx,
    presentation.c,
    eng.x + presentation.xOffset,
    eng.feetY + presentation.yOffset,
    MOTION_DRAW_SIZE,
    MOTION_DRAW_SIZE,
    presentation.angle,
    1,
    presentation.mirror,
    presentation.bottomInset,
  );

  for (const f of eng.fx) {
    const age = (eng.time - f.born) / 0.45;
    const art = spr.fx[FX_ART[f.kind]];
    drawSprite(ctx, art, f.x, f.y, FX_SIZE[f.kind] * (0.7 + age * 0.7), 0, 1 - age);
  }

  ctx.restore();

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
