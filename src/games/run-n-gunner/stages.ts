// Run 'n Gunner stage data. Contra-style homage, fully original content:
// three stages assembled from handcrafted chunks, a weapons table, and six
// parameterized boss encounters (mid + end per stage). All balance knobs
// live in TUNE so a tuner never has to dig through the engine.

export const GROUND_Y = 232; // top of the ground fill, px

export const TUNE = {
  gravity: 980, // px/s^2
  runSpeed: 150, // px/s
  jumpVel: 355, // px/s upward
  fallCap: 430, // px/s terminal
  jumpCutVel: 120, // upward speed kept when jump is released early
  dropTime: 0.28, // s of platform pass-through after down+jump
  playerHp: 3, // hits per life
  lives: 3,
  iFrames: 1.5, // s after a hit
  knockback: 110, // px/s impulse away from the hit
  knockbackDecay: 6, // 1/s
  respawnDelay: 1.4, // s between losing a life and the checkpoint respawn
  stageClearHold: 2.4, // s of banner before the next stage
  // enemies, arrays indexed by stage
  runnerSpeed: [70, 85, 100], // px/s
  runnerHp: 1,
  turretHp: 3,
  turretRange: 300, // px, hold fire beyond this
  turretInterval: [2.3, 1.9, 1.6], // s between aimed shots
  lobberHp: 2,
  lobberInterval: [2.7, 2.3, 2.0], // s between grenades
  grenadeVy: 265, // px/s launch, upward
  droneHp: 1,
  droneSpeed: 85, // px/s leftward
  shotSpeed: [150, 175, 200], // px/s aimed orb speed
  trickleInterval: [3.2, 2.7, 2.3], // s between spawned runners
  trickleMax: 3, // concurrent trickle runners
  trickleBehindChance: 0.25, // spawn behind the player instead of ahead
  // scoring
  points: { runner: 100, lobber: 150, turret: 200, drone: 150 },
  bossPoints: { mid: 2000, end: 3000 },
  bossNoHitBonus: 1000, // beat a boss untouched
  stageClearBonus: 1000,
  victoryBonus: 2000,
  oneLifeMult: 2, // full clear without losing a life doubles the run
  scoreCap: 100000,
  legendScore: 40000, // gunner-legend
  wreckCount: 60, // wrecking-crew kills in one run
};

export type WeaponId = "rifle" | "fan" | "raker" | "slug";

export interface WeaponDef {
  name: string;
  cooldown: number; // s
  speed: number; // px/s
  dmg: number;
  pellets: number;
  spread: number; // rad between pellets
  pierce: boolean;
  size: number; // px radius, feeds hit tests and render scale
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: { name: "RIFLE", cooldown: 0.2, speed: 360, dmg: 1, pellets: 1, spread: 0, pierce: false, size: 4 },
  fan: { name: "FAN", cooldown: 0.34, speed: 310, dmg: 1, pellets: 3, spread: 0.24, pierce: false, size: 4 },
  raker: { name: "RAKER", cooldown: 0.1, speed: 440, dmg: 1, pellets: 1, spread: 0.04, pierce: false, size: 3.5 },
  slug: { name: "SLUG", cooldown: 0.55, speed: 270, dmg: 3, pellets: 1, spread: 0, pierce: true, size: 7 },
};

export type EnemyKind = "runner" | "turret" | "lobber" | "drone";

export interface SpawnDef {
  type: EnemyKind;
  x: number;
  y?: number; // platform top for elevated turrets, ground otherwise
}

export interface PlatformDef {
  x: number;
  y: number; // top surface
  w: number;
}

export interface ChunkDef {
  w: number;
  ground: Array<[number, number]>; // walkable spans, chunk-relative
  platforms: PlatformDef[];
  spawns: SpawnDef[];
  pickup?: { x: number; item: WeaponId };
  boss?: "mid" | "end";
}

export interface BossAttack {
  kind: "burst" | "arc" | "spray";
  every: number; // s
  count: number;
  speed: number; // px/s
}

export interface BossDef {
  name: string;
  kind: "mid" | "end";
  hp: number;
  w: number;
  h: number;
  hover: boolean;
  speed: number; // patrol px/s
  chargeEvery: number; // s, 0 = never charges
  attacks: BossAttack[];
}

const flat = (w: number, spawns: SpawnDef[] = []): ChunkDef => ({
  w,
  ground: [[0, w]],
  platforms: [],
  spawns,
});

const arena = (boss: "mid" | "end"): ChunkDef => ({
  w: 480,
  ground: [[0, 480]],
  platforms: [],
  spawns: [],
  boss,
});

export interface StageDef {
  name: string;
  chunks: ChunkDef[];
  bosses: [BossDef, BossDef]; // [mid, end]
}

export const STAGES: StageDef[] = [
  {
    name: "CANYON ROAD",
    chunks: [
      flat(260),
      flat(420, [{ type: "runner", x: 280 }, { type: "turret", x: 360 }]),
      { w: 300, ground: [[0, 300]], platforms: [], spawns: [{ type: "runner", x: 240 }], pickup: { x: 150, item: "fan" } },
      { w: 380, ground: [[0, 160], [225, 380]], platforms: [], spawns: [{ type: "lobber", x: 310 }] },
      {
        w: 420,
        ground: [[0, 420]],
        platforms: [{ x: 140, y: 176, w: 90 }, { x: 300, y: 176, w: 90 }],
        spawns: [{ type: "turret", x: 330, y: 176 }, { type: "runner", x: 210 }],
      },
      arena("mid"),
      flat(400, [{ type: "lobber", x: 150 }, { type: "turret", x: 330 }]),
      { w: 400, ground: [[0, 130], [195, 400]], platforms: [{ x: 118, y: 176, w: 90 }], spawns: [{ type: "runner", x: 340 }] },
      flat(400, [{ type: "drone", x: 120 }, { type: "turret", x: 310 }]),
      arena("end"),
    ],
    bosses: [
      {
        name: "SENTRY RIG", kind: "mid", hp: 24, w: 44, h: 40, hover: false, speed: 30, chargeEvery: 0,
        attacks: [{ kind: "burst", every: 2.6, count: 3, speed: 170 }],
      },
      {
        name: "ROAD BREAKER", kind: "end", hp: 36, w: 50, h: 44, hover: false, speed: 45, chargeEvery: 6,
        attacks: [{ kind: "burst", every: 2.5, count: 3, speed: 180 }],
      },
    ],
  },
  {
    name: "SCRAP RAMPARTS",
    chunks: [
      flat(240),
      flat(420, [{ type: "turret", x: 180 }, { type: "lobber", x: 350 }]),
      { w: 300, ground: [[0, 300]], platforms: [], spawns: [{ type: "runner", x: 250 }], pickup: { x: 150, item: "raker" } },
      { w: 400, ground: [[0, 130], [195, 400]], platforms: [{ x: 118, y: 176, w: 90 }], spawns: [{ type: "turret", x: 320 }] },
      flat(380, [{ type: "drone", x: 110 }, { type: "runner", x: 220 }, { type: "runner", x: 320 }]),
      {
        w: 420,
        ground: [[0, 420]],
        platforms: [{ x: 120, y: 176, w: 96 }, { x: 290, y: 176, w: 96 }],
        spawns: [{ type: "turret", x: 150, y: 176 }, { type: "lobber", x: 340 }],
      },
      arena("mid"),
      { w: 380, ground: [[0, 155], [222, 380]], platforms: [], spawns: [{ type: "lobber", x: 300 }] },
      flat(400, [{ type: "turret", x: 160 }, { type: "turret", x: 340 }]),
      {
        w: 420,
        ground: [[0, 420]],
        platforms: [{ x: 170, y: 176, w: 96 }],
        spawns: [{ type: "turret", x: 210, y: 176 }, { type: "runner", x: 330 }],
      },
      arena("end"),
    ],
    bosses: [
      {
        name: "MORTAR CRAB", kind: "mid", hp: 32, w: 48, h: 38, hover: false, speed: 35, chargeEvery: 0,
        attacks: [{ kind: "arc", every: 2.6, count: 2, speed: 130 }],
      },
      {
        name: "RAMPART WARDEN", kind: "end", hp: 46, w: 52, h: 46, hover: false, speed: 50, chargeEvery: 5.5,
        attacks: [
          { kind: "burst", every: 2.4, count: 3, speed: 195 },
          { kind: "spray", every: 5.5, count: 5, speed: 150 },
        ],
      },
    ],
  },
  {
    name: "DYNAMO CORE",
    chunks: [
      flat(240),
      flat(420, [{ type: "turret", x: 170 }, { type: "lobber", x: 330 }]),
      { w: 300, ground: [[0, 300]], platforms: [], spawns: [{ type: "runner", x: 240 }], pickup: { x: 150, item: "slug" } },
      {
        w: 420,
        ground: [[0, 420]],
        platforms: [{ x: 130, y: 176, w: 96 }, { x: 300, y: 176, w: 96 }],
        spawns: [{ type: "turret", x: 340, y: 176 }, { type: "lobber", x: 180 }],
      },
      { w: 400, ground: [[0, 128], [196, 400]], platforms: [{ x: 116, y: 176, w: 92 }], spawns: [{ type: "turret", x: 330 }] },
      flat(400, [{ type: "drone", x: 110 }, { type: "runner", x: 230 }, { type: "runner", x: 330 }]),
      arena("mid"),
      flat(400, [{ type: "turret", x: 150 }, { type: "lobber", x: 300 }]),
      { w: 380, ground: [[0, 150], [218, 380]], platforms: [], spawns: [{ type: "lobber", x: 300 }] },
      {
        w: 420,
        ground: [[0, 420]],
        platforms: [{ x: 150, y: 176, w: 96 }],
        spawns: [{ type: "turret", x: 190, y: 176 }, { type: "turret", x: 350 }],
      },
      arena("end"),
    ],
    bosses: [
      {
        name: "COIL HOUND", kind: "mid", hp: 40, w: 46, h: 36, hover: false, speed: 70, chargeEvery: 4.5,
        attacks: [{ kind: "spray", every: 4.2, count: 6, speed: 160 }],
      },
      {
        name: "CORE CUSTODIAN", kind: "end", hp: 60, w: 56, h: 50, hover: true, speed: 60, chargeEvery: 0,
        attacks: [
          { kind: "burst", every: 2.2, count: 3, speed: 210 },
          { kind: "spray", every: 4.8, count: 7, speed: 170 },
        ],
      },
    ],
  },
];

// ---- Stage assembly ------------------------------------------------------

export interface BossTrigger {
  x: number; // arena origin; the fight starts when the camera reaches it
  kind: "mid" | "end";
  cleared: boolean;
}

export interface FixedPickup {
  x: number;
  item: WeaponId;
  collected: boolean;
}

export interface BuiltStage {
  def: StageDef;
  length: number;
  grounds: Array<[number, number]>;
  platforms: PlatformDef[];
  spawns: SpawnDef[]; // absolute x, sorted
  pickups: FixedPickup[];
  triggers: BossTrigger[];
}

export const buildStage = (def: StageDef): BuiltStage => {
  const grounds: Array<[number, number]> = [];
  const platforms: PlatformDef[] = [];
  const spawns: SpawnDef[] = [];
  const pickups: FixedPickup[] = [];
  const triggers: BossTrigger[] = [];
  let x = 0;
  for (const c of def.chunks) {
    for (const [a, b] of c.ground) {
      const last = grounds[grounds.length - 1];
      if (last && last[1] === x + a) last[1] = x + b;
      else grounds.push([x + a, x + b]);
    }
    for (const p of c.platforms) platforms.push({ ...p, x: x + p.x });
    for (const s of c.spawns) spawns.push({ ...s, x: x + s.x });
    if (c.pickup) pickups.push({ x: x + c.pickup.x, item: c.pickup.item, collected: false });
    if (c.boss) triggers.push({ x, kind: c.boss, cleared: false });
    x += c.w;
  }
  spawns.sort((a, b) => a.x - b.x);
  return { def, length: x, grounds, platforms, spawns, pickups, triggers };
};

export const groundAt = (stage: BuiltStage, x: number): boolean =>
  stage.grounds.some(([a, b]) => x >= a && x <= b);
