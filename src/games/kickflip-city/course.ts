// Kickflip City course data. Three districts, each assembled from handcrafted
// chunks in a seeded order, plus the lookups the engine, the renderer and the
// harness bots all read. DOM-free so the node harness builds the same courses
// the browser does.
//
// The lane is a polyline of ground segments, not a single flat line. A flat
// segment is a run of pavement, an angled one is a curb ramp or a stair set,
// and a gap between segments is a roof pit. Obstacle and grindable art is
// placed onto this geometry by the renderer, never the other way round.

export const GROUND_Y = 430; // px, lane surface on the flat

export type SegmentKind = "flat" | "ramp" | "stairs";

/** One run of rideable surface, left to right. y is absolute canvas px. */
export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: SegmentKind;
}

export type GrindKind = "rail" | "ledge" | "bench";
export type ObstacleKind = "cone" | "planter" | "crate" | "bin" | "barrier";
export type PropKind = "steps-sign" | "awning" | "vent" | "lamp" | "puddle" | "poster-frame";

/**
 * A grindable's top line. A rail collides as a thin bar so a stair set can run
 * underneath it; a ledge and a bench collide as a solid block down to the lane,
 * which is what their art draws.
 */
export interface Grindable {
  x0: number;
  x1: number;
  y: number;
  kind: GrindKind;
  solid: boolean;
}

export interface Obstacle {
  kind: ObstacleKind;
  /** center x, px */
  x: number;
  /** surface the obstacle stands on, px */
  baseY: number;
  w: number;
  h: number;
}

export interface PropPlacement {
  kind: PropKind;
  x: number;
  baseY: number;
  w: number;
  h: number;
}

export interface ParallaxPlacement {
  cell: number;
  x: number;
  y: number;
  scale: number;
}

export interface StreetActor {
  family: number;
  x: number;
  /** px per second, negative drifts against the skater */
  speed: number;
  phase: number;
}

export interface Course {
  name: string;
  index: number;
  segments: Segment[];
  grindables: Grindable[];
  obstacles: Obstacle[];
  props: PropPlacement[];
  parallax: ParallaxPlacement[];
  street: StreetActor[];
  startX: number;
  finishX: number;
  length: number;
}

/** Collision box of an obstacle kind, sized close to its authored art aspect. */
const OBSTACLE_SHAPE: Record<ObstacleKind, { w: number; h: number }> = {
  cone: { w: 30, h: 18 },
  planter: { w: 44, h: 20 },
  crate: { w: 45, h: 18 },
  bin: { w: 33, h: 20 },
  barrier: { w: 52, h: 19 },
};

/** Drawn size of a decorative prop, close to its authored art aspect. */
const PROP_SHAPE: Record<PropKind, { w: number; h: number }> = {
  "steps-sign": { w: 68, h: 26 },
  awning: { w: 56, h: 34 },
  vent: { w: 40, h: 25 },
  lamp: { w: 26, h: 37 },
  puddle: { w: 74, h: 12 },
  "poster-frame": { w: 50, h: 37 },
};

interface ChunkSegment {
  x0: number;
  x1: number;
  /** px above the lane at the left end */
  up0?: number;
  /** px above the lane at the right end, defaults to up0 */
  up1?: number;
  kind?: SegmentKind;
}

interface ChunkGrind {
  kind: GrindKind;
  x0: number;
  x1: number;
  /** px above the lane the grind line sits at */
  up: number;
}

interface ChunkHazard {
  kind: ObstacleKind;
  x: number;
  /** px above the lane the obstacle stands on */
  up?: number;
}

interface ChunkProp {
  kind: PropKind;
  x: number;
  up?: number;
}

interface Chunk {
  name: string;
  len: number;
  /** omitted means one flat run of pavement across the whole chunk */
  segments?: ChunkSegment[];
  grinds?: ChunkGrind[];
  hazards?: ChunkHazard[];
  props?: ChunkProp[];
}

// ---- district chunk pools -------------------------------------------------

// A grindable is only rideable from above, so every chunk that carries one
// leaves at least 260 px of clear pavement in front of it. That is the runway
// an ollie needs to arrive on the top line instead of into the side.
const GRIND_RUNWAY = 260; // px

const CIVIC_CHUNKS: Chunk[] = [
  {
    name: "flat-rail",
    len: 540,
    grinds: [{ kind: "rail", x0: 300, x1: 500, up: 30 }],
    props: [{ kind: "poster-frame", x: 60 }],
  },
  {
    name: "curb-kicker",
    len: 340,
    segments: [
      { x0: 0, x1: 100 },
      { x0: 100, x1: 184, up0: 0, up1: 28, kind: "ramp" },
      { x0: 184, x1: 216, up0: 28 },
      { x0: 216, x1: 340 },
    ],
    hazards: [{ kind: "planter", x: 285 }],
  },
  {
    name: "bench-plaza",
    len: 460,
    grinds: [{ kind: "bench", x0: 285, x1: 420, up: 30 }],
    props: [
      { kind: "awning", x: 60 },
      { kind: "lamp", x: 200 },
    ],
  },
  {
    name: "stair-set",
    len: 440,
    segments: [
      { x0: 0, x1: 64 },
      { x0: 64, x1: 170, up0: 0, up1: 40, kind: "ramp" },
      { x0: 170, x1: 254, up0: 40 },
      { x0: 254, x1: 360, up0: 40, up1: 0, kind: "stairs" },
      { x0: 360, x1: 440 },
    ],
    props: [{ kind: "steps-sign", x: 30 }],
  },
  {
    name: "cone-run",
    len: 490,
    hazards: [
      { kind: "cone", x: 110 },
      { kind: "cone", x: 270 },
      { kind: "planter", x: 430 },
    ],
    props: [{ kind: "puddle", x: 30 }],
  },
];

const MARKET_CHUNKS: Chunk[] = [
  {
    name: "ledge-line",
    len: 630,
    grinds: [{ kind: "ledge", x0: 295, x1: 595, up: 34 }],
    props: [{ kind: "vent", x: 45 }],
  },
  {
    name: "bin-alley",
    len: 400,
    hazards: [
      { kind: "bin", x: 105 },
      { kind: "bin", x: 265 },
    ],
    props: [
      { kind: "puddle", x: 45 },
      { kind: "poster-frame", x: 350 },
    ],
  },
  {
    name: "market-kicker",
    len: 380,
    segments: [
      { x0: 0, x1: 110 },
      { x0: 110, x1: 212, up0: 0, up1: 34, kind: "ramp" },
      { x0: 212, x1: 248, up0: 34 },
      { x0: 248, x1: 380 },
    ],
    hazards: [{ kind: "barrier", x: 316 }],
    props: [{ kind: "awning", x: 55 }],
  },
  {
    name: "rail-run",
    len: 540,
    grinds: [{ kind: "rail", x0: 300, x1: 500, up: 34 }],
    props: [{ kind: "lamp", x: 110 }],
  },
  {
    name: "crate-stack",
    len: 400,
    hazards: [
      { kind: "crate", x: 110 },
      { kind: "crate", x: 280 },
    ],
    props: [{ kind: "vent", x: 360 }],
  },
];

const ROOF_CHUNKS: Chunk[] = [
  {
    name: "roof-gap",
    len: 380,
    segments: [
      { x0: 0, x1: 150 },
      { x0: 234, x1: 380 },
    ],
    props: [{ kind: "vent", x: 60 }],
  },
  {
    name: "roof-rail",
    len: 530,
    segments: [
      { x0: 0, x1: 178 },
      { x0: 250, x1: 530 },
    ],
    grinds: [{ kind: "rail", x0: 300, x1: 500, up: 30 }],
    props: [{ kind: "lamp", x: 80 }],
  },
  {
    name: "vent-run",
    len: 400,
    hazards: [
      { kind: "bin", x: 120 },
      { kind: "barrier", x: 290 },
    ],
    props: [{ kind: "vent", x: 55 }],
  },
  {
    name: "roof-kicker",
    len: 400,
    segments: [
      { x0: 0, x1: 108 },
      { x0: 108, x1: 204, up0: 0, up1: 32, kind: "ramp" },
      { x0: 204, x1: 244, up0: 32 },
      { x0: 300, x1: 400 },
    ],
    props: [{ kind: "poster-frame", x: 50 }],
  },
  {
    name: "long-ledge",
    len: 660,
    grinds: [{ kind: "ledge", x0: 300, x1: 620, up: 34 }],
    props: [
      { kind: "awning", x: 45 },
      { kind: "poster-frame", x: 150 },
    ],
  },
];

export interface DistrictDef {
  name: string;
  /** slug the engine fires when this district is cleared, null for the first */
  clearSlug: string | null;
  backdrop: string;
  /** parallax-weather row 1 cells drawn as silhouettes behind the lane */
  silhouettes: number[];
  /** parallax-weather row 2 cell drawn as the weather overlay */
  weatherCell: number;
  /** street-life columns this district draws from */
  streetFamilies: number[];
  chunks: Chunk[];
}

export const DISTRICTS: DistrictDef[] = [
  {
    name: "Civic Steps",
    clearSlug: null,
    backdrop: "district-civic-steps.jpg",
    silhouettes: [0, 3, 4],
    weatherCell: 0,
    streetFamilies: [2, 5, 6, 7],
    chunks: CIVIC_CHUNKS,
  },
  {
    name: "Market Underpass",
    clearSlug: "market-run",
    backdrop: "district-market-underpass.jpg",
    silhouettes: [1, 4, 5],
    weatherCell: 4,
    streetFamilies: [0, 1, 3, 5],
    chunks: MARKET_CHUNKS,
  },
  {
    name: "Warehouse Roofs",
    clearSlug: "roofline",
    backdrop: "district-warehouse-roofs.jpg",
    silhouettes: [2, 5, 4],
    weatherCell: 3,
    streetFamilies: [0, 4, 7],
    chunks: ROOF_CHUNKS,
  },
];

const LEAD_IN = 260; // px of clear pavement before the first chunk
const RUN_OUT = 320; // px of clear pavement after the last chunk
const TARGET_LENGTH = 2400; // px, the length each district aims for
const FINISH_INSET = 70; // px the finish line sits before the course end

const flat = (x0: number, x1: number, up = 0): Segment => ({
  x0,
  y0: GROUND_Y - up,
  x1,
  y1: GROUND_Y - up,
  kind: "flat",
});

/**
 * Lays one chunk down at `base` and appends its geometry to the course.
 * Chunk coordinates are chunk-local px and heights are px above the lane.
 */
const placeChunk = (chunk: Chunk, base: number, out: Course) => {
  if (chunk.segments) {
    for (const s of chunk.segments) {
      const up0 = s.up0 ?? 0;
      const up1 = s.up1 ?? up0;
      out.segments.push({
        x0: base + s.x0,
        y0: GROUND_Y - up0,
        x1: base + s.x1,
        y1: GROUND_Y - up1,
        kind: s.kind ?? "flat",
      });
    }
  } else {
    out.segments.push(flat(base, base + chunk.len));
  }

  for (const g of chunk.grinds ?? []) {
    out.grindables.push({
      x0: base + g.x0,
      x1: base + g.x1,
      y: GROUND_Y - g.up,
      kind: g.kind,
      solid: g.kind !== "rail",
    });
  }

  for (const h of chunk.hazards ?? []) {
    const shape = OBSTACLE_SHAPE[h.kind];
    out.obstacles.push({
      kind: h.kind,
      x: base + h.x,
      baseY: GROUND_Y - (h.up ?? 0),
      w: shape.w,
      h: shape.h,
    });
  }

  for (const p of chunk.props ?? []) {
    const shape = PROP_SHAPE[p.kind];
    out.props.push({
      kind: p.kind,
      x: base + p.x,
      baseY: GROUND_Y - (p.up ?? 0),
      w: shape.w,
      h: shape.h,
    });
  }
};

/**
 * Fails the build when a chunk order leaves a grindable without its runway.
 * The rule is easy to break by hand and impossible to see in a chunk table, so
 * it is checked here rather than written down as a warning.
 */
/**
 * Every hazard pair needs a landing gap wide enough to touch down between them
 * and still have room to set the next ollie up. Like the runway rule this is
 * invisible in a chunk table, so the build proves it instead of trusting the
 * numbers.
 */
const HAZARD_GAP = 110; // px of clear pavement between two obstacle boxes

const assertHazardGaps = (course: Course) => {
  const boxes = course.obstacles.map(obstacleBox).sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < boxes.length; i++) {
    const gap = boxes[i].x0 - boxes[i - 1].x1;
    if (gap > 0 && gap < HAZARD_GAP) {
      throw new Error(`${course.name}: only ${Math.round(gap)} px between hazards at ${Math.round(boxes[i - 1].x1)}`);
    }
  }
};

const assertRunway = (course: Course) => {
  for (const g of course.grindables) {
    const from = g.x0 - GRIND_RUNWAY;
    const clash =
      course.obstacles.some((o) => o.x + o.w / 2 > from && o.x - o.w / 2 < g.x0) ||
      course.grindables.some((other) => other !== g && other.x1 > from && other.x0 < g.x0);
    if (clash) throw new Error(`${course.name}: grindable at ${g.x0} has no clear runway`);
  }
};

export const buildCourse = (index: number, rand: () => number): Course => {
  const def = DISTRICTS[index];
  const course: Course = {
    name: def.name,
    index,
    segments: [],
    grindables: [],
    obstacles: [],
    props: [],
    parallax: [],
    street: [],
    startX: 120,
    finishX: 0,
    length: 0,
  };

  course.segments.push(flat(0, LEAD_IN));

  let x = LEAD_IN;
  let previous = -1;
  while (x < TARGET_LENGTH - RUN_OUT) {
    let pick = Math.floor(rand() * def.chunks.length);
    if (pick === previous) pick = (pick + 1) % def.chunks.length;
    previous = pick;
    const chunk = def.chunks[pick];
    placeChunk(chunk, x, course);
    x += chunk.len;
  }

  course.segments.push(flat(x, x + RUN_OUT));
  course.length = x + RUN_OUT;
  course.finishX = course.length - FINISH_INSET;

  // Silhouettes drift at half the lane speed, so their layout only has to span
  // half the course to cover it end to end.
  for (let i = 0; i < 14; i++) {
    const cell = def.silhouettes[Math.floor(rand() * def.silhouettes.length)];
    course.parallax.push({
      cell,
      x: 60 + i * 150 + Math.floor(rand() * 60),
      y: GROUND_Y - 34 - Math.floor(rand() * 46),
      scale: 0.9 + rand() * 0.5,
    });
  }

  const actors = 10;
  for (let i = 0; i < actors; i++) {
    const family = def.streetFamilies[Math.floor(rand() * def.streetFamilies.length)];
    const moving = rand() < 0.7;
    course.street.push({
      family,
      x: 140 + (i * course.length) / actors + Math.floor(rand() * 90),
      speed: moving ? -22 - Math.floor(rand() * 34) : 0,
      phase: rand() * 4,
    });
  }

  assertRunway(course);
  assertHazardGaps(course);
  return course;
};

/** Lane height at x, or null over a pit or past either end of the course. */
export const surfaceYAt = (course: Course, x: number): number | null => {
  let best: number | null = null;
  for (const s of course.segments) {
    if (x < s.x0 || x > s.x1) continue;
    const t = s.x1 === s.x0 ? 0 : (x - s.x0) / (s.x1 - s.x0);
    const y = s.y0 + (s.y1 - s.y0) * t;
    if (best === null || y < best) best = y;
  }
  return best;
};

/** Rise over run of the lane under x, positive downhill to the right. */
export const slopeAt = (course: Course, x: number): number => {
  let best: Segment | null = null;
  for (const s of course.segments) {
    if (x < s.x0 || x > s.x1) continue;
    if (!best || s.y0 < best.y0) best = s;
  }
  if (!best || best.x1 === best.x0) return 0;
  return (best.y1 - best.y0) / (best.x1 - best.x0);
};

/** The collision box a grindable presents, top line plus the depth below it. */
export const grindBox = (g: Grindable, barHeight: number) => ({
  x0: g.x0,
  x1: g.x1,
  top: g.y,
  bottom: g.solid ? GROUND_Y : g.y + barHeight,
});

/** The collision box an obstacle presents. */
export const obstacleBox = (o: Obstacle) => ({
  x0: o.x - o.w / 2,
  x1: o.x + o.w / 2,
  top: o.baseY - o.h,
  bottom: o.baseY,
});
