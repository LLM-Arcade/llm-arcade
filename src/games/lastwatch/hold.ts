// The Lastwatch hold as data: convex rectangular rooms joined by door
// segments, plus stations, spawn gates, and structures. Pathfinding is A*
// over the room graph; inside a room every straight line is walkable, which
// keeps navigation deterministic with no waypoint tuning.
//
// Coordinates: x grows east, y grows north. The treeline is +y, the
// undercroft is -y. Units are meters.

import type { DistrictId, DoorId, RoomId, StationId, StructureId } from "./types.ts";

export interface Room {
  id: RoomId;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // Elevation in meters at the south (y0) and north (y1) edges; stairs ramp.
  elevS: number;
  elevN: number;
}

export interface Door {
  id: DoorId;
  a: RoomId;
  b: RoomId;
  // Door segment: axis is "x" when the door lies on a horizontal wall
  // (crossing changes y), "y" when on a vertical wall (crossing changes x).
  axis: "x" | "y";
  at: number; // the wall's fixed coordinate
  lo: number; // span start along the wall
  hi: number; // span end
  barricade: StructureId | null;
  // Doors start closed when a schedule or purchase opens them later.
  openAtWave: number | null; // null = never by schedule
  openedByDistrict: DistrictId | null; // opens when the district is bought
  startOpen: boolean;
}

export interface Station {
  id: StationId;
  room: RoomId;
  x: number;
  y: number;
  index: number; // distinguishes the two undercroft caches
}

export interface SpawnGate {
  id: string;
  room: RoomId;
  x: number;
  y: number;
  activeAtWave: number; // first wave this gate feeds
  needsDistrict: DistrictId | null; // only live once that district is open
}

export const ROOMS: Record<RoomId, Room> = {
  treeline: { id: "treeline", x0: -6, y0: 46, x1: 6, y1: 54, elevS: 0, elevN: 0 },
  causeway: { id: "causeway", x0: -4, y0: 26, x1: 4, y1: 46, elevS: 0, elevN: 0 },
  gateyard: { id: "gateyard", x0: -18, y0: 0, x1: 18, y1: 26, elevS: 0, elevN: 0 },
  stairW: { id: "stairW", x0: -21, y0: 18, x1: -18, y1: 24.5, elevS: 0, elevN: 4 },
  stairE: { id: "stairE", x0: 18, y0: 18, x1: 21, y1: 24.5, elevS: 0, elevN: 4 },
  rampart: { id: "rampart", x0: -21, y0: 24.5, x1: 21, y1: 27, elevS: 4, elevN: 4 },
  outsideW: { id: "outsideW", x0: -32, y0: -12, x1: -18, y1: 15, elevS: 0, elevN: 0 },
  outsideE: { id: "outsideE", x0: 18, y0: 0, x1: 32, y1: 6, elevS: 0, elevN: 0 },
  outsideS: { id: "outsideS", x0: -10, y0: -38, x1: 10, y1: -30, elevS: 0, elevN: 0 },
  armory: { id: "armory", x0: -18, y0: -14, x1: -4, y1: 0, elevS: 0, elevN: 0 },
  wellcourt: { id: "wellcourt", x0: 4, y0: -14, x1: 18, y1: 0, elevS: 0, elevN: 0 },
  hall: { id: "hall", x0: -15, y0: -30, x1: 15, y1: -14, elevS: 0, elevN: 0 },
  undercroft: { id: "undercroft", x0: -12, y0: -44, x1: 12, y1: -30, elevS: -4, elevN: -4 },
};

export const DOORS: Door[] = [
  {
    id: "causeway-mouth",
    a: "treeline",
    b: "causeway",
    axis: "x",
    at: 46,
    lo: -4,
    hi: 4,
    barricade: null,
    openAtWave: 1,
    openedByDistrict: null,
    startOpen: true,
  },
  {
    id: "arch",
    a: "causeway",
    b: "gateyard",
    axis: "x",
    at: 26,
    lo: -2,
    hi: 2,
    barricade: "bar-arch",
    openAtWave: 1,
    openedByDistrict: null,
    startOpen: true,
  },
  {
    id: "sap",
    a: "outsideW",
    b: "gateyard",
    axis: "y",
    at: -18,
    lo: 8,
    hi: 13,
    barricade: "bar-sap",
    openAtWave: 4,
    openedByDistrict: null,
    startOpen: false,
  },
  {
    id: "postern",
    a: "outsideE",
    b: "gateyard",
    axis: "y",
    at: 18,
    lo: 2,
    hi: 4,
    barricade: "bar-postern",
    openAtWave: 7,
    openedByDistrict: null,
    startOpen: false,
  },
  {
    id: "stairw-lo",
    a: "gateyard",
    b: "stairW",
    axis: "y",
    at: -18,
    lo: 19,
    hi: 23,
    barricade: null,
    openAtWave: 1,
    openedByDistrict: null,
    startOpen: true,
  },
  {
    id: "stairw-hi",
    a: "stairW",
    b: "rampart",
    axis: "x",
    at: 24.5,
    lo: -21,
    hi: -18,
    barricade: null,
    openAtWave: 1,
    openedByDistrict: null,
    startOpen: true,
  },
  {
    id: "staire-lo",
    a: "gateyard",
    b: "stairE",
    axis: "y",
    at: 18,
    lo: 19,
    hi: 23,
    barricade: null,
    openAtWave: 1,
    openedByDistrict: null,
    startOpen: true,
  },
  {
    id: "staire-hi",
    a: "stairE",
    b: "rampart",
    axis: "x",
    at: 24.5,
    lo: 18,
    hi: 21,
    barricade: null,
    openAtWave: 1,
    openedByDistrict: null,
    startOpen: true,
  },
  {
    id: "armory-rubble",
    a: "gateyard",
    b: "armory",
    axis: "x",
    at: 0,
    lo: -12,
    hi: -9,
    barricade: null,
    openAtWave: null,
    openedByDistrict: "armory",
    startOpen: false,
  },
  {
    id: "well-rubble",
    a: "gateyard",
    b: "wellcourt",
    axis: "x",
    at: 0,
    lo: 9,
    hi: 12,
    barricade: null,
    openAtWave: null,
    openedByDistrict: "wellcourt",
    startOpen: false,
  },
  {
    id: "armory-breach",
    a: "outsideW",
    b: "armory",
    axis: "y",
    at: -18,
    lo: -10,
    hi: -6,
    barricade: "bar-armory-breach",
    openAtWave: null,
    openedByDistrict: "armory",
    startOpen: false,
  },
  {
    id: "hall-door-w",
    a: "armory",
    b: "hall",
    axis: "x",
    at: -14,
    lo: -11,
    hi: -8,
    barricade: null,
    openAtWave: null,
    openedByDistrict: "hall",
    startOpen: false,
  },
  {
    id: "hall-door-e",
    a: "wellcourt",
    b: "hall",
    axis: "x",
    at: -14,
    lo: 8,
    hi: 11,
    barricade: null,
    openAtWave: null,
    openedByDistrict: "hall",
    startOpen: false,
  },
  {
    id: "hall-windows",
    a: "outsideS",
    b: "hall",
    axis: "x",
    at: -30,
    lo: -6,
    hi: 6,
    barricade: "bar-hall-windows",
    openAtWave: null,
    openedByDistrict: "hall",
    startOpen: false,
  },
  {
    id: "undercroft-stair",
    a: "hall",
    b: "undercroft",
    axis: "x",
    at: -30,
    lo: 9,
    hi: 12,
    barricade: null,
    openAtWave: null,
    openedByDistrict: "undercroft",
    startOpen: false,
  },
];

export const STATIONS: Station[] = [
  { id: "ledger", room: "gateyard", x: 1.5, y: 4, index: 0 },
  { id: "racks", room: "armory", x: -11, y: -7, index: 0 },
  { id: "whetstone", room: "armory", x: -6, y: -12, index: 0 },
  { id: "well", room: "wellcourt", x: 14, y: -7, index: 0 },
  { id: "herb-bed", room: "wellcourt", x: 8, y: -12, index: 0 },
  { id: "hearth", room: "hall", x: 0, y: -22, index: 0 },
  { id: "armor-stand", room: "undercroft", x: -8, y: -40, index: 0 },
  { id: "cache", room: "undercroft", x: 6, y: -40, index: 0 },
  { id: "cache", room: "undercroft", x: -3, y: -42, index: 1 },
];

export const SPAWN_GATES: SpawnGate[] = [
  { id: "treeline", room: "treeline", x: 0, y: 50, activeAtWave: 1, needsDistrict: null },
  { id: "sap-hill", room: "outsideW", x: -28, y: 10, activeAtWave: 4, needsDistrict: null },
  { id: "gully", room: "outsideE", x: 28, y: 3, activeAtWave: 7, needsDistrict: null },
  { id: "well-deep", room: "wellcourt", x: 14, y: -7, activeAtWave: 12, needsDistrict: "wellcourt" },
  { id: "south-scrub", room: "outsideS", x: 0, y: -35, activeAtWave: 1, needsDistrict: "hall" },
  { id: "west-scrub", room: "outsideW", x: -28, y: -8, activeAtWave: 1, needsDistrict: "armory" },
];

export const WATCHFIRE_POS = { x: 0, y: 6 };
export const DISTRICT_ROOMS: Record<DistrictId, RoomId> = {
  armory: "armory",
  wellcourt: "wellcourt",
  hall: "hall",
  undercroft: "undercroft",
};

// Rubble walls the player channels at to open a district. Positioned at the
// district's first door from held ground.
export const DISTRICT_RUBBLE: Record<DistrictId, { x: number; y: number }> = {
  armory: { x: -10.5, y: 0 },
  wellcourt: { x: 10.5, y: 0 },
  hall: { x: -9.5, y: -14 },
  undercroft: { x: 10.5, y: -30 },
};

export function elevAt(room: Room, y: number): number {
  if (room.elevS === room.elevN) return room.elevS;
  const t = (y - room.y0) / (room.y1 - room.y0);
  return room.elevS + (room.elevN - room.elevS) * Math.max(0, Math.min(1, t));
}

export function roomContains(room: Room, x: number, y: number): boolean {
  return x >= room.x0 && x <= room.x1 && y >= room.y0 && y <= room.y1;
}

export function doorMid(d: Door): { x: number; y: number } {
  const m = (d.lo + d.hi) / 2;
  return d.axis === "x" ? { x: m, y: d.at } : { x: d.at, y: m };
}

export function doorsOf(room: RoomId): Door[] {
  return DOORS.filter((d) => d.a === room || d.b === room);
}

export function otherSide(d: Door, room: RoomId): RoomId {
  return d.a === room ? d.b : d.a;
}

// A* over the room graph. isPassable decides per door (open state, team,
// barricade policy); cost lets the horde prefer unbarricaded routes.
export function findPath(
  from: RoomId,
  to: RoomId,
  isPassable: (d: Door) => boolean,
  doorCost: (d: Door) => number,
): Door[] | null {
  if (from === to) return [];
  const dist = new Map<RoomId, number>();
  const prev = new Map<RoomId, { room: RoomId; door: Door }>();
  dist.set(from, 0);
  const open: RoomId[] = [from];
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if ((dist.get(open[i]) ?? Infinity) < (dist.get(open[bi]) ?? Infinity)) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === to) break;
    const d0 = dist.get(cur) ?? Infinity;
    for (const d of doorsOf(cur)) {
      if (!isPassable(d)) continue;
      const next = otherSide(d, cur);
      const mid = doorMid(d);
      const curMid =
        prev.get(cur)?.door != null ? doorMid(prev.get(cur)!.door) : { x: 0, y: 0 };
      const step =
        Math.hypot(mid.x - curMid.x, mid.y - curMid.y) + doorCost(d);
      const nd = d0 + Math.max(1, step);
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, { room: cur, door: d });
        if (!open.includes(next)) open.push(next);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: Door[] = [];
  let cur: RoomId = to;
  while (cur !== from) {
    const p = prev.get(cur)!;
    path.unshift(p.door);
    cur = p.room;
  }
  return path;
}

// Line of sight between two positions in named rooms. Same room always
// sees. Adjacent rooms see through an open door when the straight segment
// crosses the door span. The rampart overlooks the approach and the yard.
export function hasLos(
  roomA: RoomId,
  ax: number,
  ay: number,
  roomB: RoomId,
  bx: number,
  by: number,
  isOpen: (d: Door) => boolean,
): boolean {
  if (roomA === roomB) return true;
  const overlook: [RoomId, RoomId][] = [
    ["rampart", "causeway"],
    ["rampart", "gateyard"],
    ["rampart", "treeline"],
  ];
  for (const [p, q] of overlook) {
    if ((roomA === p && roomB === q) || (roomA === q && roomB === p)) return true;
  }
  for (const d of doorsOf(roomA)) {
    if (otherSide(d, roomA) !== roomB || !isOpen(d)) continue;
    if (d.axis === "x") {
      if (Math.abs(by - ay) < 1e-6) continue;
      const t = (d.at - ay) / (by - ay);
      if (t < 0 || t > 1) continue;
      const x = ax + (bx - ax) * t;
      if (x >= d.lo - 0.3 && x <= d.hi + 0.3) return true;
    } else {
      if (Math.abs(bx - ax) < 1e-6) continue;
      const t = (d.at - ax) / (bx - ax);
      if (t < 0 || t > 1) continue;
      const y = ay + (by - ay) * t;
      if (y >= d.lo - 0.3 && y <= d.hi + 0.3) return true;
    }
  }
  return false;
}
