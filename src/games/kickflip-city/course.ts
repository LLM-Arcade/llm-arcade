// Kickflip City course data. Twenty-four districts across twelve environments,
// each assembled from handcrafted chunks in a seeded order. DOM-free so the
// node harness builds the same courses the browser does.
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

export interface CrowdPlacement {
  family: number;
  x: number;
  phase: number;
  scale: number;
}

export interface CoursePalette {
  lane: string;
  foundation: string;
  edge: string;
}

export interface Course {
  name: string;
  index: number;
  segments: Segment[];
  grindables: Grindable[];
  obstacles: Obstacle[];
  crowd: CrowdPlacement[];
  startX: number;
  finishX: number;
  length: number;
  backdropIndex: number;
  backdropPhase: number;
  propVariant: 0 | 1;
  palette: CoursePalette;
}

/** Collision box of an obstacle kind, sized close to its authored art aspect. */
const OBSTACLE_SHAPE: Record<ObstacleKind, { w: number; h: number }> = {
  cone: { w: 30, h: 18 },
  planter: { w: 44, h: 20 },
  crate: { w: 45, h: 18 },
  bin: { w: 33, h: 20 },
  barrier: { w: 52, h: 19 },
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

interface Chunk {
  name: string;
  len: number;
  /** omitted means one flat run of pavement across the whole chunk */
  segments?: ChunkSegment[];
  grinds?: ChunkGrind[];
  hazards?: ChunkHazard[];
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
  },
  {
    name: "cone-run",
    len: 490,
    hazards: [
      { kind: "cone", x: 110 },
      { kind: "cone", x: 270 },
      { kind: "planter", x: 430 },
    ],
  },
];

const MARKET_CHUNKS: Chunk[] = [
  {
    name: "ledge-line",
    len: 630,
    grinds: [{ kind: "ledge", x0: 295, x1: 595, up: 34 }],
  },
  {
    name: "bin-alley",
    len: 400,
    hazards: [
      { kind: "bin", x: 105 },
      { kind: "bin", x: 265 },
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
  },
  {
    name: "rail-run",
    len: 540,
    grinds: [{ kind: "rail", x0: 300, x1: 500, up: 34 }],
  },
  {
    name: "crate-stack",
    len: 400,
    hazards: [
      { kind: "crate", x: 110 },
      { kind: "crate", x: 280 },
    ],
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
  },
  {
    name: "roof-rail",
    len: 530,
    segments: [
      { x0: 0, x1: 178 },
      { x0: 250, x1: 530 },
    ],
    grinds: [{ kind: "rail", x0: 300, x1: 500, up: 30 }],
  },
  {
    name: "vent-run",
    len: 400,
    hazards: [
      { kind: "bin", x: 120 },
      { kind: "barrier", x: 290 },
    ],
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
  },
  {
    name: "long-ledge",
    len: 660,
    grinds: [{ kind: "ledge", x0: 300, x1: 620, up: 34 }],
  },
];

const HARBOR_CHUNKS: Chunk[] = [
  {
    name: "quay-rail",
    len: 590,
    grinds: [{ kind: "rail", x0: 310, x1: 550, up: 30 }],
  },
  {
    name: "seawall-kicker",
    len: 430,
    segments: [
      { x0: 0, x1: 118 },
      { x0: 118, x1: 218, up0: 0, up1: 30, kind: "ramp" },
      { x0: 218, x1: 268, up0: 30 },
      { x0: 268, x1: 430 },
    ],
    hazards: [{ kind: "barrier", x: 365 }],
  },
  {
    name: "pier-gap",
    len: 450,
    segments: [
      { x0: 0, x1: 178 },
      { x0: 258, x1: 450 },
    ],
  },
  {
    name: "dock-bench",
    len: 520,
    grinds: [{ kind: "bench", x0: 300, x1: 478, up: 30 }],
  },
  {
    name: "freight-weave",
    len: 560,
    hazards: [
      { kind: "barrier", x: 105 },
      { kind: "crate", x: 292 },
      { kind: "barrier", x: 488 },
    ],
  },
];

const ALLEY_CHUNKS: Chunk[] = [
  {
    name: "service-ledge",
    len: 590,
    grinds: [{ kind: "ledge", x0: 300, x1: 550, up: 32 }],
  },
  {
    name: "bin-crate-line",
    len: 470,
    hazards: [
      { kind: "bin", x: 108 },
      { kind: "crate", x: 310 },
    ],
  },
  {
    name: "loading-bank",
    len: 430,
    segments: [
      { x0: 0, x1: 112 },
      { x0: 112, x1: 218, up0: 0, up1: 34, kind: "ramp" },
      { x0: 218, x1: 270, up0: 34 },
      { x0: 270, x1: 430 },
    ],
  },
  {
    name: "courtyard-gap",
    len: 440,
    segments: [
      { x0: 0, x1: 180 },
      { x0: 252, x1: 440 },
    ],
  },
  {
    name: "midnight-rail",
    len: 550,
    grinds: [{ kind: "rail", x0: 300, x1: 512, up: 34 }],
  },
];

const CANAL_CHUNKS: Chunk[] = [
  {
    name: "lock-ledge",
    len: 620,
    grinds: [{ kind: "ledge", x0: 300, x1: 580, up: 32 }],
  },
  {
    name: "planter-pair",
    len: 470,
    hazards: [
      { kind: "planter", x: 108 },
      { kind: "planter", x: 318 },
    ],
  },
  {
    name: "bridge-bank",
    len: 440,
    segments: [
      { x0: 0, x1: 110 },
      { x0: 110, x1: 220, up0: 0, up1: 38, kind: "ramp" },
      { x0: 220, x1: 282, up0: 38 },
      { x0: 282, x1: 440 },
    ],
  },
  {
    name: "canal-stairs",
    len: 500,
    segments: [
      { x0: 0, x1: 80 },
      { x0: 80, x1: 190, up0: 0, up1: 42, kind: "ramp" },
      { x0: 190, x1: 286, up0: 42 },
      { x0: 286, x1: 398, up0: 42, up1: 0, kind: "stairs" },
      { x0: 398, x1: 500 },
    ],
  },
  {
    name: "promenade-rail",
    len: 560,
    grinds: [{ kind: "rail", x0: 310, x1: 522, up: 30 }],
  },
];

const METRO_CHUNKS: Chunk[] = [
  {
    name: "platform-rail",
    len: 600,
    grinds: [{ kind: "rail", x0: 310, x1: 560, up: 34 }],
  },
  {
    name: "gate-line",
    len: 480,
    hazards: [
      { kind: "barrier", x: 112 },
      { kind: "bin", x: 318 },
    ],
  },
  {
    name: "concourse-stairs",
    len: 510,
    segments: [
      { x0: 0, x1: 78 },
      { x0: 78, x1: 188, up0: 0, up1: 44, kind: "ramp" },
      { x0: 188, x1: 286, up0: 44 },
      { x0: 286, x1: 404, up0: 44, up1: 0, kind: "stairs" },
      { x0: 404, x1: 510 },
    ],
  },
  {
    name: "track-gap",
    len: 450,
    segments: [
      { x0: 0, x1: 176 },
      { x0: 258, x1: 450 },
    ],
  },
  {
    name: "platform-ledge",
    len: 650,
    grinds: [{ kind: "ledge", x0: 300, x1: 610, up: 34 }],
  },
];

const DESERT_CHUNKS: Chunk[] = [
  {
    name: "drainage-gap",
    len: 440,
    segments: [
      { x0: 0, x1: 182 },
      { x0: 252, x1: 440 },
    ],
  },
  {
    name: "motel-ledge",
    len: 600,
    grinds: [{ kind: "ledge", x0: 300, x1: 560, up: 30 }],
  },
  {
    name: "sunset-bank",
    len: 430,
    segments: [
      { x0: 0, x1: 116 },
      { x0: 116, x1: 226, up0: 0, up1: 36, kind: "ramp" },
      { x0: 226, x1: 282, up0: 36 },
      { x0: 282, x1: 430 },
    ],
  },
  {
    name: "parking-weave",
    len: 520,
    hazards: [
      { kind: "cone", x: 104 },
      { kind: "barrier", x: 294 },
      { kind: "cone", x: 466 },
    ],
  },
  {
    name: "motel-rail",
    len: 570,
    grinds: [{ kind: "rail", x0: 310, x1: 532, up: 32 }],
  },
];

const ARCADE_CHUNKS: Chunk[] = [
  {
    name: "gallery-bench",
    len: 540,
    grinds: [{ kind: "bench", x0: 300, x1: 500, up: 30 }],
  },
  {
    name: "planter-slalom",
    len: 560,
    hazards: [
      { kind: "planter", x: 104 },
      { kind: "bin", x: 292 },
      { kind: "planter", x: 490 },
    ],
  },
  {
    name: "arcade-stairs",
    len: 490,
    segments: [
      { x0: 0, x1: 74 },
      { x0: 74, x1: 178, up0: 0, up1: 38, kind: "ramp" },
      { x0: 178, x1: 274, up0: 38 },
      { x0: 274, x1: 380, up0: 38, up1: 0, kind: "stairs" },
      { x0: 380, x1: 490 },
    ],
  },
  {
    name: "covered-rail",
    len: 570,
    grinds: [{ kind: "rail", x0: 310, x1: 532, up: 32 }],
  },
  {
    name: "rain-gap",
    len: 450,
    segments: [
      { x0: 0, x1: 180 },
      { x0: 258, x1: 450 },
    ],
  },
];

const HILL_CHUNKS: Chunk[] = [
  {
    name: "terrace-rail",
    len: 590,
    grinds: [{ kind: "rail", x0: 310, x1: 552, up: 34 }],
  },
  {
    name: "hill-bank",
    len: 470,
    segments: [
      { x0: 0, x1: 110 },
      { x0: 110, x1: 238, up0: 0, up1: 46, kind: "ramp" },
      { x0: 238, x1: 312, up0: 46 },
      { x0: 312, x1: 470, up0: 46, up1: 0, kind: "stairs" },
    ],
  },
  {
    name: "observatory-gap",
    len: 460,
    segments: [
      { x0: 0, x1: 190 },
      { x0: 274, x1: 460 },
    ],
  },
  {
    name: "cypress-weave",
    len: 500,
    hazards: [
      { kind: "planter", x: 106 },
      { kind: "barrier", x: 316 },
    ],
  },
  {
    name: "skyline-ledge",
    len: 660,
    grinds: [{ kind: "ledge", x0: 300, x1: 620, up: 36 }],
  },
];

const FOUNDRY_CHUNKS: Chunk[] = [
  {
    name: "pipe-rail",
    len: 610,
    grinds: [{ kind: "rail", x0: 310, x1: 572, up: 34 }],
  },
  {
    name: "freight-stack",
    len: 500,
    hazards: [
      { kind: "crate", x: 108 },
      { kind: "barrier", x: 316 },
    ],
  },
  {
    name: "furnace-bank",
    len: 440,
    segments: [
      { x0: 0, x1: 112 },
      { x0: 112, x1: 220, up0: 0, up1: 38, kind: "ramp" },
      { x0: 220, x1: 280, up0: 38 },
      { x0: 280, x1: 440 },
    ],
  },
  {
    name: "loading-gap",
    len: 460,
    segments: [
      { x0: 0, x1: 188 },
      { x0: 270, x1: 460 },
    ],
  },
  {
    name: "factory-ledge",
    len: 660,
    grinds: [{ kind: "ledge", x0: 300, x1: 620, up: 34 }],
  },
];

const FESTIVAL_CHUNKS: Chunk[] = [
  {
    name: "grandstand-rail",
    len: 600,
    grinds: [{ kind: "rail", x0: 310, x1: 562, up: 32 }],
  },
  {
    name: "cone-final",
    len: 550,
    hazards: [
      { kind: "cone", x: 104 },
      { kind: "barrier", x: 292 },
      { kind: "cone", x: 484 },
    ],
  },
  {
    name: "podium-ledge",
    len: 610,
    grinds: [{ kind: "ledge", x0: 300, x1: 570, up: 34 }],
  },
  {
    name: "victory-stairs",
    len: 510,
    segments: [
      { x0: 0, x1: 80 },
      { x0: 80, x1: 192, up0: 0, up1: 44, kind: "ramp" },
      { x0: 192, x1: 292, up0: 44 },
      { x0: 292, x1: 410, up0: 44, up1: 0, kind: "stairs" },
      { x0: 410, x1: 510 },
    ],
  },
  {
    name: "afterparty-gap",
    len: 450,
    segments: [
      { x0: 0, x1: 180 },
      { x0: 258, x1: 450 },
    ],
  },
];

export interface DistrictDef {
  name: string;
  /** slug the engine fires when this district is cleared, null for the first */
  clearSlug: string | null;
  backdropIndex: number;
  backdropPhase: number;
  chunks: Chunk[];
  chunkOffset: number;
  targetLength: number;
  crowdCount: number;
  propVariant: 0 | 1;
  palette: CoursePalette;
}

export const BACKDROPS = [
  "district-civic-steps.jpg",
  "district-market-underpass.jpg",
  "district-warehouse-roofs.jpg",
  "district-harbor-boardwalk.jpg",
  "district-neon-alley.jpg",
  "district-canal-promenade.jpg",
  "district-metro-concourse.jpg",
  "district-desert-motel.jpg",
  "district-rain-arcade.jpg",
  "district-observatory-hill.jpg",
  "district-foundry-yard.jpg",
  "district-festival-boulevard.jpg",
] as const;

const PALETTES: CoursePalette[] = [
  { lane: "#3A3027", foundation: "#241A12", edge: "#8A6A3A" },
  { lane: "#403128", foundation: "#241A12", edge: "#9A7040" },
  { lane: "#34312D", foundation: "#211D19", edge: "#8C7147" },
  { lane: "#344047", foundation: "#1D2427", edge: "#8E7650" },
  { lane: "#30283A", foundation: "#19151F", edge: "#A06A49" },
  { lane: "#3A3B32", foundation: "#202018", edge: "#8F7A4D" },
  { lane: "#353331", foundation: "#1E1C1A", edge: "#A06F45" },
  { lane: "#49352B", foundation: "#281D18", edge: "#AD7748" },
  { lane: "#343A37", foundation: "#1B211F", edge: "#8C7450" },
  { lane: "#2E3340", foundation: "#181C25", edge: "#9A7951" },
  { lane: "#3C302A", foundation: "#211915", edge: "#A15F37" },
  { lane: "#433229", foundation: "#261B16", edge: "#B07C45" },
];

interface RouteDef {
  name: string;
  clearSlug?: string;
  chunkOffset: number;
  targetLength: number;
  crowdCount: number;
}

interface EnvironmentDef {
  chunks: Chunk[];
  routes: [RouteDef, RouteDef];
}

const ENVIRONMENTS: EnvironmentDef[] = [
  {
    chunks: CIVIC_CHUNKS,
    routes: [
      { name: "Civic Steps", chunkOffset: 0, targetLength: 3400, crowdCount: 6 },
      { name: "Monument Line", chunkOffset: 2, targetLength: 3900, crowdCount: 7 },
    ],
  },
  {
    chunks: MARKET_CHUNKS,
    routes: [
      { name: "Market Underpass", clearSlug: "market-run", chunkOffset: 0, targetLength: 3600, crowdCount: 7 },
      { name: "Lantern Arcade", chunkOffset: 2, targetLength: 4100, crowdCount: 8 },
    ],
  },
  {
    chunks: ROOF_CHUNKS,
    routes: [
      { name: "Warehouse Roofs", clearSlug: "roofline", chunkOffset: 0, targetLength: 3800, crowdCount: 5 },
      { name: "Ventline Transfer", chunkOffset: 3, targetLength: 4300, crowdCount: 5 },
    ],
  },
  {
    chunks: HARBOR_CHUNKS,
    routes: [
      { name: "Harbor Boardwalk", chunkOffset: 0, targetLength: 3800, crowdCount: 7 },
      { name: "Dry Dock Dash", chunkOffset: 2, targetLength: 4300, crowdCount: 6 },
    ],
  },
  {
    chunks: ALLEY_CHUNKS,
    routes: [
      { name: "Neon Alley", chunkOffset: 0, targetLength: 3600, crowdCount: 6 },
      { name: "Midnight Service", chunkOffset: 3, targetLength: 4200, crowdCount: 5 },
    ],
  },
  {
    chunks: CANAL_CHUNKS,
    routes: [
      { name: "Canal Promenade", chunkOffset: 0, targetLength: 3700, crowdCount: 7 },
      { name: "Bridgewater Run", chunkOffset: 2, targetLength: 4300, crowdCount: 8 },
    ],
  },
  {
    chunks: METRO_CHUNKS,
    routes: [
      { name: "Metro Concourse", chunkOffset: 0, targetLength: 3900, crowdCount: 7 },
      { name: "Last Train Line", chunkOffset: 3, targetLength: 4500, crowdCount: 6 },
    ],
  },
  {
    chunks: DESERT_CHUNKS,
    routes: [
      { name: "Desert Motel", chunkOffset: 0, targetLength: 3700, crowdCount: 5 },
      { name: "Sunset Drainage", chunkOffset: 2, targetLength: 4300, crowdCount: 6 },
    ],
  },
  {
    chunks: ARCADE_CHUNKS,
    routes: [
      { name: "Rain Arcade", chunkOffset: 0, targetLength: 3800, crowdCount: 8 },
      { name: "Storm Gallery", chunkOffset: 3, targetLength: 4400, crowdCount: 7 },
    ],
  },
  {
    chunks: HILL_CHUNKS,
    routes: [
      { name: "Observatory Hill", chunkOffset: 0, targetLength: 4000, crowdCount: 5 },
      { name: "Skyline Descent", chunkOffset: 2, targetLength: 4600, crowdCount: 6 },
    ],
  },
  {
    chunks: FOUNDRY_CHUNKS,
    routes: [
      { name: "Foundry Yard", chunkOffset: 0, targetLength: 4000, crowdCount: 5 },
      { name: "Furnace Line", chunkOffset: 3, targetLength: 4600, crowdCount: 6 },
    ],
  },
  {
    chunks: FESTIVAL_CHUNKS,
    routes: [
      { name: "Festival Boulevard", chunkOffset: 0, targetLength: 4100, crowdCount: 9 },
      { name: "Afterparty Route", chunkOffset: 2, targetLength: 4700, crowdCount: 10 },
    ],
  },
];

const districtFrom = (
  environment: EnvironmentDef,
  backdropIndex: number,
  route: RouteDef,
  variant: 0 | 1,
): DistrictDef => ({
  ...route,
  clearSlug: route.clearSlug ?? null,
  backdropIndex,
  backdropPhase: variant * 0.5,
  chunks: environment.chunks,
  propVariant: variant,
  palette: PALETTES[backdropIndex],
});

export const DISTRICTS: DistrictDef[] = ENVIRONMENTS.flatMap((environment, backdropIndex) => [
  districtFrom(environment, backdropIndex, environment.routes[0], 0),
  districtFrom(environment, backdropIndex, environment.routes[1], 1),
]);

const LEAD_IN = 260; // px of clear pavement before the first chunk
const RUN_OUT = 320; // px of clear pavement after the last chunk
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
};

/**
 * Fails the build when a chunk order leaves a grindable without its runway.
 * The rule is easy to break by hand and impossible to see in a chunk table, so
 * it is checked here rather than written down as a warning.
 *
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
    crowd: [],
    startX: 120,
    finishX: 0,
    length: 0,
    backdropIndex: def.backdropIndex,
    backdropPhase: def.backdropPhase,
    propVariant: def.propVariant,
    palette: def.palette,
  };

  course.segments.push(flat(0, LEAD_IN));

  let x = LEAD_IN;
  let previous = -1;
  while (x < def.targetLength - RUN_OUT) {
    let pick = (Math.floor(rand() * def.chunks.length) + def.chunkOffset) % def.chunks.length;
    if (pick === previous) pick = (pick + 1) % def.chunks.length;
    previous = pick;
    const chunk = def.chunks[pick];
    placeChunk(chunk, x, course);
    x += chunk.len;
  }

  course.segments.push(flat(x, x + RUN_OUT));
  course.length = x + RUN_OUT;
  course.finishX = course.length - FINISH_INSET;

  // Preserve the exact old scenery draws so cleaning up presentation cannot
  // reshuffle later districts in the shared seeded layout stream.
  for (let i = 0; i < 14; i++) {
    rand();
    rand();
    rand();
    rand();
  }
  for (let i = 0; i < 10; i++) {
    rand();
    const moving = rand() < 0.7;
    rand();
    if (moving) rand();
    rand();
  }

  const audienceGroups = def.crowdCount;
  const audienceStart = 460;
  const audienceSpan = Math.max(0, course.finishX - audienceStart - 220);
  for (let i = 0; i < audienceGroups; i++) {
    course.crowd.push({
      family: (i + index) % 4,
      x: audienceStart + ((i + 0.5) * audienceSpan) / audienceGroups + ((i * 37 + index * 53) % 80),
      phase: (i * 0.73 + index * 0.41) % 4,
      scale: 0.72 + ((i * 17 + index * 11) % 18) / 100,
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
