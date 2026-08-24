// Rune & Ruin — floor generation + field of view. Pure functions, no state.
// Rooms are scattered, connected with L-corridors, plus one loop corridor
// so floors aren't strictly linear.

export const MAP_W = 40;
export const MAP_H = 22;

export const WALL = 0;
export const FLOOR = 1;
export const STAIRS = 2;

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FloorPlan {
  tiles: Uint8Array; // MAP_W * MAP_H
  rooms: Room[];
  start: Point;
  stairs: Point;
}

export const idx = (x: number, y: number) => y * MAP_W + x;

const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

const center = (r: Room): Point => ({
  x: Math.floor(r.x + r.w / 2),
  y: Math.floor(r.y + r.h / 2),
});

const attempt = (): FloorPlan => {
  const tiles = new Uint8Array(MAP_W * MAP_H); // all WALL
  const rooms: Room[] = [];

  for (let tries = 0; tries < 90 && rooms.length < 9; tries++) {
    const w = ri(4, 8);
    const h = ri(3, 5);
    const x = ri(1, MAP_W - w - 2);
    const y = ri(1, MAP_H - h - 2);
    const clash = rooms.some(
      (r) => x < r.x + r.w + 1 && r.x < x + w + 1 && y < r.y + r.h + 1 && r.y < y + h + 1,
    );
    if (!clash) rooms.push({ x, y, w, h });
  }

  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) tiles[idx(x, y)] = FLOOR;
    }
  }

  const digH = (x0: number, x1: number, y: number) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles[idx(x, y)] = FLOOR;
  };
  const digV = (y0: number, y1: number, x: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) tiles[idx(x, y)] = FLOOR;
  };
  const dig = (a: Point, b: Point) => {
    if (Math.random() < 0.5) {
      digH(a.x, b.x, a.y);
      digV(a.y, b.y, b.x);
    } else {
      digV(a.y, b.y, a.x);
      digH(a.x, b.x, b.y);
    }
  };

  for (let i = 1; i < rooms.length; i++) dig(center(rooms[i - 1]), center(rooms[i]));
  if (rooms.length > 3) dig(center(rooms[0]), center(rooms[ri(2, rooms.length - 1)]));

  const start = center(rooms[0]);
  let stairsRoom = rooms[rooms.length - 1];
  let bestD = -1;
  for (const r of rooms.slice(1)) {
    const c = center(r);
    const d = (c.x - start.x) ** 2 + (c.y - start.y) ** 2;
    if (d > bestD) {
      bestD = d;
      stairsRoom = r;
    }
  }
  const stairs = center(stairsRoom);
  tiles[idx(stairs.x, stairs.y)] = STAIRS;

  return { tiles, rooms, start, stairs };
};

export const generateFloor = (): FloorPlan => {
  // Room placement is stochastic; retry the rare cramped layout.
  for (;;) {
    const plan = attempt();
    if (plan.rooms.length >= 5) return plan;
  }
};

/** Bresenham walk — blocked only by walls strictly between the endpoints. */
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
    if (x === x1 && y === y1) break; // the target tile itself may be a wall (lit walls)
    if (tiles[idx(x, y)] === WALL) return false;
  }
  return true;
};

export const FOV_RADIUS = 7.5;

export const computeVisible = (tiles: Uint8Array, px: number, py: number): Uint8Array => {
  const vis = new Uint8Array(MAP_W * MAP_H);
  const r = Math.ceil(FOV_RADIUS);
  for (let y = Math.max(0, py - r); y <= Math.min(MAP_H - 1, py + r); y++) {
    for (let x = Math.max(0, px - r); x <= Math.min(MAP_W - 1, px + r); x++) {
      const d2 = (x - px) ** 2 + (y - py) ** 2;
      if (d2 > FOV_RADIUS * FOV_RADIUS) continue;
      if (lineOfSight(tiles, px, py, x, y)) vis[idx(x, y)] = 1;
    }
  }
  return vis;
};
