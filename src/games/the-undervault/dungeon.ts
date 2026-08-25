// The Undervault floor generation and field of view. Pure functions driven
// by a seeded generator, so the same run seed always lays the same stone.
// DOM free: the harness imports this directly.

export const MAP_W = 29;
export const MAP_H = 21;

export const WALL = 0;
export const FLOOR = 1;
export const STAIRS = 2;
export const DOOR = 3;

export interface Point {
  x: number;
  y: number;
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorPlan {
  tiles: Uint8Array;
  rooms: Room[];
  start: Point;
  bossRoom: Room;
  stairs: Point;
  /** The locked side vault, when the floor has one. */
  vault: Room | null;
  door: Point | null;
}

export type Rng = () => number;

/** mulberry32. One generator per run, never Math.random. */
export const makeRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const ri = (rng: Rng, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

export const pick = <T,>(rng: Rng, list: T[]): T => list[ri(rng, 0, list.length - 1)];

export const idx = (x: number, y: number) => y * MAP_W + x;

export const STEPS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

/** Walkable for anything that can open a door. Walls are the only block. */
export const walkable = (tiles: Uint8Array, x: number, y: number) =>
  inBounds(x, y) && tiles[idx(x, y)] !== WALL;

export const center = (r: Room): Point => ({
  x: Math.floor(r.x + r.w / 2),
  y: Math.floor(r.y + r.h / 2),
});

const inside = (r: Room, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

const clash = (rooms: Room[], x: number, y: number, w: number, h: number) =>
  rooms.some((r) => x < r.x + r.w + 1 && r.x < x + w + 1 && y < r.y + r.h + 1 && r.y < y + h + 1);

/** L corridor from a to b, returned in walking order so a door can sit on it. */
const corridor = (a: Point, b: Point, horizontalFirst: boolean): Point[] => {
  const path: Point[] = [];
  let { x, y } = a;
  const stepX = () => {
    while (x !== b.x) {
      x += Math.sign(b.x - x);
      path.push({ x, y });
    }
  };
  const stepY = () => {
    while (y !== b.y) {
      y += Math.sign(b.y - y);
      path.push({ x, y });
    }
  };
  path.push({ x, y });
  if (horizontalFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
  return path;
};

const attempt = (rng: Rng, wantVault: boolean): FloorPlan | null => {
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const rooms: Room[] = [];

  for (let tries = 0; tries < 120 && rooms.length < 8; tries++) {
    const w = ri(rng, 5, 7);
    const h = ri(rng, 3, 5);
    const x = ri(rng, 1, MAP_W - w - 2);
    const y = ri(rng, 1, MAP_H - h - 2);
    if (!clash(rooms, x, y, w, h)) rooms.push({ x, y, w, h });
  }
  if (rooms.length < 6) return null;

  const carve = (r: Room) => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) tiles[idx(x, y)] = FLOOR;
    }
  };
  const dig = (path: Point[]) => {
    for (const p of path) tiles[idx(p.x, p.y)] = FLOOR;
  };

  for (const r of rooms) carve(r);
  for (let i = 1; i < rooms.length; i++) {
    dig(corridor(center(rooms[i - 1]), center(rooms[i]), rng() < 0.5));
  }
  // One loop so a floor is never a strict chain and a fight can be circled.
  dig(corridor(center(rooms[0]), center(rooms[ri(rng, 2, rooms.length - 1)]), rng() < 0.5));

  const start = center(rooms[0]);
  let bossRoom = rooms[1];
  let best = -1;
  for (const r of rooms.slice(1)) {
    const c = center(r);
    const d = (c.x - start.x) ** 2 + (c.y - start.y) ** 2;
    if (d > best) {
      best = d;
      bossRoom = r;
    }
  }
  const stairs = center(bossRoom);

  let vault: Room | null = null;
  let door: Point | null = null;
  if (wantVault) {
    for (let tries = 0; tries < 60 && !vault; tries++) {
      const x = ri(rng, 2, MAP_W - 5);
      const y = ri(rng, 2, MAP_H - 5);
      if (clash(rooms, x - 1, y - 1, 5, 5)) continue;
      const candidate = { x, y, w: 3, h: 3 };
      const host = rooms.reduce((a, b) => {
        const ca = center(a);
        const cb = center(b);
        const da = (ca.x - x) ** 2 + (ca.y - y) ** 2;
        const db = (cb.x - x) ** 2 + (cb.y - y) ** 2;
        return da <= db ? a : b;
      });
      const path = corridor(center(host), center(candidate), rng() < 0.5);
      // The vault gets exactly one way in: the corridor tile that first
      // reaches its wall ring becomes the lock.
      const entry = path.find((p) => inside(candidate, p.x, p.y));
      if (!entry) continue;
      carve(candidate);
      dig(path);
      const entryIndex = path.indexOf(entry);
      const lock = path[Math.max(0, entryIndex - 1)];
      if (rooms.some((r) => inside(r, lock.x, lock.y))) continue;
      tiles[idx(lock.x, lock.y)] = DOOR;
      vault = candidate;
      door = lock;
    }
  }

  // Stamped last: the vault's corridor is dug after the boss room and would
  // otherwise pave the stair back to plain floor.
  tiles[idx(stairs.x, stairs.y)] = STAIRS;

  return { tiles, rooms, start, bossRoom, stairs, vault, door };
};

/** Cells the player can walk to, doors counted as passable. */
export const reachable = (tiles: Uint8Array, from: Point): Uint8Array => {
  const seen = new Uint8Array(MAP_W * MAP_H);
  const queue: number[] = [idx(from.x, from.y)];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const x = at % MAP_W;
    const y = (at - x) / MAP_W;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(tiles, nx, ny)) continue;
      const next = idx(nx, ny);
      if (seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
};

/**
 * The vault corridor is dug over ground the room corridors already used, so
 * its lock can land on a tile the rest of the floor depends on. A door that
 * cuts the map is picked back to plain floor.
 */
const unlockCriticalDoor = (plan: FloorPlan) => {
  if (!plan.door) return;
  const locked = Uint8Array.from(plan.tiles);
  locked[idx(plan.door.x, plan.door.y)] = WALL;
  const dry = reachable(locked, plan.start);
  const cut =
    dry[idx(plan.stairs.x, plan.stairs.y)] !== 1 ||
    plan.rooms.some((r) => dry[idx(center(r).x, center(r).y)] !== 1);
  if (!cut) return;
  plan.tiles[idx(plan.door.x, plan.door.y)] = FLOOR;
  plan.door = null;
  plan.vault = null;
};

export const generateFloor = (rng: Rng, wantVault: boolean): FloorPlan => {
  for (let tries = 0; tries < 200; tries++) {
    const plan = attempt(rng, wantVault);
    if (!plan) continue;
    const seen = reachable(plan.tiles, plan.start);
    const allRooms = plan.rooms.every((r) => seen[idx(center(r).x, center(r).y)] === 1);
    const vaultOk = !plan.vault || seen[idx(center(plan.vault).x, center(plan.vault).y)] === 1;
    if (!allRooms || !vaultOk) continue;
    unlockCriticalDoor(plan);
    return plan;
  }
  throw new Error("floor generation failed to produce a connected map");
};

/** Bresenham walk. Only walls strictly between the endpoints block sight. */
export const lineOfSight = (
  tiles: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean => {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === x1 && y === y1) break; // the far tile itself may be a lit wall
    if (tiles[idx(x, y)] === WALL) return false;
  }
  return true;
};

export const BASE_FOV = 7.5;

export const computeVisible = (
  tiles: Uint8Array,
  px: number,
  py: number,
  radius: number,
): Uint8Array => {
  const vis = new Uint8Array(MAP_W * MAP_H);
  const r = Math.ceil(radius);
  for (let y = Math.max(0, py - r); y <= Math.min(MAP_H - 1, py + r); y++) {
    for (let x = Math.max(0, px - r); x <= Math.min(MAP_W - 1, px + r); x++) {
      if ((x - px) ** 2 + (y - py) ** 2 > radius * radius) continue;
      if (lineOfSight(tiles, px, py, x, y)) vis[idx(x, y)] = 1;
    }
  }
  return vis;
};

/** Breadth first step toward a goal, doors passable. Null when boxed in. */
export const stepToward = (
  tiles: Uint8Array,
  from: Point,
  goal: Point,
  blocked: (x: number, y: number) => boolean,
): Point | null => {
  const start = idx(goal.x, goal.y);
  const dist = new Int32Array(MAP_W * MAP_H).fill(-1);
  dist[start] = 0;
  const queue: number[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const x = at % MAP_W;
    const y = (at - x) / MAP_W;
    if (x === from.x && y === from.y) break;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(tiles, nx, ny)) continue;
      const next = idx(nx, ny);
      if (dist[next] >= 0) continue;
      if (blocked(nx, ny) && !(nx === from.x && ny === from.y)) continue;
      dist[next] = dist[at] + 1;
      queue.push(next);
    }
  }
  const here = dist[idx(from.x, from.y)];
  if (here <= 0) return null;
  for (const [dx, dy] of STEPS) {
    const nx = from.x + dx;
    const ny = from.y + dy;
    if (!walkable(tiles, nx, ny)) continue;
    if (dist[idx(nx, ny)] === here - 1) return { x: nx, y: ny };
  }
  return null;
};
