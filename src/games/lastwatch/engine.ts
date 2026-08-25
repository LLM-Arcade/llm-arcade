// Lastwatch engine: the whole game as a DOM-free deterministic sim.
// Fixed 60 Hz tick, seeded mulberry32, event queue drained by the shell.
// The render layer (phase 3) and the node harness drive this identically.

import { mulberry32, pick, type Rng } from "./rng.ts";
import {
  DIFFICULTY,
  DT,
  emptyInput,
  type ArmorId,
  type ArrowType,
  type BarkPool,
  type ClassId,
  type CommandId,
  type Difficulty,
  type DifficultyMods,
  type DistrictId,
  type DoorId,
  type GameEvent,
  type GloamType,
  type InputState,
  type IntelTier,
  type Phase,
  type RoomId,
  type SfxName,
  type StationId,
  type StructureId,
  type WeaponInstance,
} from "./types.ts";
import {
  DISTRICT_ROOMS,
  DISTRICT_RUBBLE,
  DOORS,
  ROOMS,
  SPAWN_GATES,
  STATIONS,
  WATCHFIRE_POS,
  doorMid,
  doorsOf,
  elevAt,
  findPath,
  hasLos,
  otherSide,
  roomContains,
  type Door,
} from "./hold.ts";
import { CLASSES, KIT, UPGRADES, upgradeEffects } from "./kits.ts";
import {
  ARMORS,
  ARROWS,
  BARRICADE_HP,
  CONSUMABLE_FX,
  DROPS,
  ECON,
  PRICES,
  QUALITY_MULT,
  SCORE,
  STARTING_WEAPON,
  VALOR,
  WEAPONS,
  type WeaponDef,
} from "./arsenal.ts";
import { BEHAVIOR as B, GLOAM, dmgScale, hpScale, speedScale } from "./gloam.ts";
import {
  POINT_COST,
  WAVE,
  bandFor,
  bossForWave,
  milestoneName,
  trickleInterval,
  waveBudget,
} from "./waves.ts";
import { BARKS } from "./banter.ts";
import { partnerThink, type PartnerBrain } from "./partner.ts";

export interface EngineConfig {
  difficulty: Difficulty;
  playerClass: ClassId;
  partnerClass: ClassId;
}

export type CharState = "up" | "downed" | "gone";

export interface Character {
  idx: 0 | 1;
  cls: ClassId;
  room: RoomId;
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  radius: number;
  hp: number;
  maxHp: number;
  state: CharState;
  bleedout: number;
  immunity: number;
  guard: number;
  mana: number;
  manaDelay: number;
  arrows: number;
  arrowType: ArrowType;
  weapon: WeaponInstance;
  armor: ArmorId | null;
  bandages: number;
  trapCharges: number;
  tiers: Record<string, number>;
  poulticeWaves: number;
  mealWaves: number;
  whetstoneWaves: number;
  attackCd: number;
  charge: number; // s primary has been held (heavy/bow charge)
  charging: boolean;
  beamT: number; // s primary has been held for beam detection
  blockHeld: boolean;
  skillCd: number;
  daggerCd: number;
  tauntT: number;
  staggered: number;
  reviveT: number;
  bandageT: number;
  openT: number;
  openTarget: DistrictId | null;
  secondWind: boolean;
  lastAttackAt: number;
  lastDamagedAt: number;
  slowT: number;
  kills: number;
  headshots: number;
  damageDealt: number;
  damageBlocked: number;
  healedGiven: number;
}

export type GloamState =
  | "advance"
  | "fight"
  | "chew" // attacking a structure
  | "perch"
  | "pounce"
  | "standoff" // lobber/hexer/shepherd holding range
  | "flee"
  | "steal"
  | "dig"
  | "telegraph"
  | "charge" // cracktusk
  | "stunned"
  | "scatter";

export interface GloamUnit {
  id: number;
  type: GloamType;
  tier: IntelTier;
  room: RoomId;
  x: number;
  y: number;
  yaw: number;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  structDmg: number;
  attackCycle: number;
  attackReach: number;
  state: GloamState;
  stateT: number;
  attackCd: number;
  path: Door[] | null;
  pathIdx: number;
  goal: { room: RoomId; x: number; y: number } | null;
  targetChar: number; // -1 none
  targetStruct: StructureId | null;
  packId: number;
  packRole: "front" | "flank" | null;
  shieldHp: number;
  tetherUnit: number; // hexer: unit id it shields/speeds, -1 none
  hexSpeed: boolean; // unit currently under a speed tether
  slowT: number;
  slowMult: number;
  burnDps: number;
  burnT: number;
  stunned: number;
  staggered: number;
  carryValor: number;
  carryGoods: boolean;
  specialCd: number;
  dodgeCd: number;
  engaged: number; // s since it attacked or took damage (large = idle)
  spawnGate: string;
  escort: boolean;
}

export interface Hazard {
  kind: "puddle" | "burnfield" | "caltrops";
  room: RoomId;
  x: number;
  y: number;
  radius: number;
  dps: number;
  slow: number; // movement multiplier applied to gloam, 1 = none
  barbDps: number;
  ttl: number;
  hurts: "watch" | "gloam";
}

export interface Drop {
  kind: "arrows" | "satchel" | "goods" | "weapon-cache";
  room: RoomId;
  x: number;
  y: number;
  arrows: number;
  valor: number;
  bandages: number;
  ttl: number;
}

export interface Tracer {
  t: number; // engine time fired
  x0: number;
  y0: number;
  h0: number;
  x1: number;
  y1: number;
  h1: number;
  beam: boolean;
}

export interface PendingImpact {
  t: number; // engine time it lands
  t0: number; // engine time it launched
  fromX: number;
  fromY: number;
  room: RoomId;
  x: number;
  y: number;
  dmg: number;
  radius: number;
  splashFrac: number;
  hurts: "watch" | "gloam";
  isGlob: boolean;
  by: -1 | 0 | 1; // character index that owns the damage credit
}

export interface SapperHole {
  room: RoomId;
  x: number;
  y: number;
  ttl: number;
}

export interface CacheState {
  arrows: number;
  bandages: number;
}

interface WaveCtl {
  queue: GloamType[];
  spawnT: number;
  interval: number;
  hornT: number; // countdown from horn to first spawn
}

const CHAR_RADIUS = 0.4;
const RANGED_MAX = 40; // m, bow reach
const BOLT_SPEED = 18; // m/s
const BOLT_RANGE = 24; // m
const AIM_ASSIST_COS = Math.cos((15 * Math.PI) / 180);

export class Engine {
  readonly cfg: EngineConfig;
  readonly mods: DifficultyMods;
  readonly seed: number;
  rng: Rng;
  time = 0;
  tick = 0;
  phase: Phase = "intermission";
  wave = 0;
  waveName: string | null = null;
  quietT = 0;
  intermissionT = 8; // short setup breath before wave 1
  chars: [Character, Character];
  gloam: GloamUnit[] = [];
  hazards: Hazard[] = [];
  drops: Drop[] = [];
  impacts: PendingImpact[] = [];
  tracers: Tracer[] = [];
  holes: SapperHole[] = [];
  structures: Record<StructureId, { hp: number; maxHp: number; tier: number }>;
  doorOpen: Record<DoorId, boolean>;
  districts: Record<DistrictId, boolean> = {
    armory: false,
    wellcourt: false,
    hall: false,
    undercroft: false,
  };
  valor = 0;
  score = 0;
  scoreRaw = 0;
  kills = 0;
  archNeverBroken = true;
  playerHurtThisWave = false;
  ironWatchWaves = 0;
  valorSpent = 0;
  valorRecovered = 0;
  revives = 0;
  secondWindPrice = PRICES.secondWind;
  command: CommandId = "hold-ground";
  waveCtl: WaveCtl = { queue: [], spawnT: 0, interval: 7, hornT: 0 };
  rackStock: { weapon: WeaponInstance; price: number }[] = [];
  caches: CacheState[] = [{ arrows: 0, bandages: 0 }, { arrows: 0, bandages: 0 }];
  bossCacheOffer: WeaponInstance[] | null = null;
  bossCacheAt: { room: RoomId; x: number; y: number } | null = null;
  wellStock = 2;
  deathRecap = "";
  over = false;
  packSeq = 0;
  unitSeq = 0;
  gateRotation = 0;
  alphaDeaths: { packId: number; at: number; remaining: number }[] = [];
  achievements = new Set<string>();
  private events: GameEvent[] = [];
  private prevInput: [InputState, InputState] = [emptyInput(), emptyInput()];
  private partnerBrain: PartnerBrain = {
    objective: "hold",
    thinkT: 0,
    anchor: null,
    targetId: -1,
    act: "idle",
    actT: 0,
    aimErrX: 0,
    aimErrY: 0,
    retargetT: 0,
  };
  private debutsSeen = new Set<GloamType>();
  private scoreSubmitted = false;
  private barkCd = new Map<BarkPool, number>();

  constructor(seed: number, cfg: EngineConfig) {
    this.seed = seed;
    this.cfg = cfg;
    this.rng = mulberry32(seed);
    this.mods = DIFFICULTY[cfg.difficulty];
    this.structures = {
      watchfire: { hp: 1000, maxHp: 1000, tier: 0 },
      "bar-arch": { hp: BARRICADE_HP[1], maxHp: BARRICADE_HP[1], tier: 1 },
      "bar-sap": { hp: 0, maxHp: 0, tier: 0 },
      "bar-postern": { hp: 0, maxHp: 0, tier: 0 },
      "bar-hall-windows": { hp: 0, maxHp: 0, tier: 0 },
      "bar-armory-breach": { hp: 0, maxHp: 0, tier: 0 },
    };
    this.doorOpen = {} as Record<DoorId, boolean>;
    for (const d of DOORS) this.doorOpen[d.id] = d.startOpen;
    this.chars = [
      this.makeChar(0, cfg.playerClass),
      this.makeChar(1, cfg.partnerClass),
    ];
    this.chars[1].x = 2.5;
    this.restockRacks();
    this.bark("run-start");
  }

  private makeChar(idx: 0 | 1, cls: ClassId): Character {
    const base = CLASSES[cls];
    return {
      idx,
      cls,
      room: "gateyard",
      x: idx === 0 ? -1.5 : 2.5,
      y: 9,
      yaw: Math.PI / 2,
      pitch: 0,
      radius: CHAR_RADIUS,
      hp: base.maxHp,
      maxHp: base.maxHp,
      state: "up",
      bleedout: 0,
      immunity: 0,
      guard: KIT.guardMax,
      mana: KIT.manaMax,
      manaDelay: 0,
      arrows: KIT.quiverStart,
      arrowType: "broadhead",
      weapon: { id: STARTING_WEAPON[cls], quality: "worn" },
      armor: null,
      bandages: 1,
      trapCharges: KIT.trapCharges,
      tiers: {},
      poulticeWaves: 0,
      mealWaves: 0,
      whetstoneWaves: 0,
      attackCd: 0,
      charge: 0,
      charging: false,
      beamT: 0,
      blockHeld: false,
      skillCd: 0,
      daggerCd: 0,
      tauntT: 0,
      staggered: 0,
      reviveT: 0,
      bandageT: 0,
      openT: 0,
      openTarget: null,
      secondWind: false,
      lastAttackAt: -99,
      lastDamagedAt: -99,
      slowT: 0,
      kills: 0,
      headshots: 0,
      damageDealt: 0,
      damageBlocked: 0,
      healedGiven: 0,
    };
  }

  // ---- events -------------------------------------------------------------

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  private sfx(sound: SfxName) {
    this.emit({ type: "sfx", sound });
  }

  bark(pool: BarkPool) {
    const cd = this.barkCd.get(pool) ?? -99;
    if (this.time - cd < 6) return;
    this.barkCd.set(pool, this.time);
    const line = pick(this.rng, BARKS[pool]);
    this.emit({ type: "bark", pool, line });
  }

  private achieve(slug: string) {
    if (this.achievements.has(slug)) return;
    this.achievements.add(slug);
    this.sfx("achievement");
    this.emit({ type: "achievement", slug });
  }

  // ---- helpers ------------------------------------------------------------

  private tier(c: Character, line: string): number {
    return c.tiers[line] ?? 0;
  }

  private weaponDef(c: Character): WeaponDef {
    return WEAPONS[c.weapon.id];
  }

  private dmgMult(c: Character): number {
    let m = QUALITY_MULT[c.weapon.quality];
    if (c.whetstoneWaves > 0) m *= CONSUMABLE_FX.whetstoneMult;
    if (c.cls === "mage") m *= upgradeEffects.focusMult[this.tier(c, "focus-line")];
    return m;
  }

  private armorFrac(c: Character): number {
    const base = c.cls === "knight" ? upgradeEffects.plateArmor[this.tier(c, "plate-line")] : 0;
    const item = c.armor ? ARMORS[c.armor].reduction : 0;
    return 1 - (1 - base) * (1 - item);
  }

  private charSpeed(c: Character, input: InputState): number {
    let s = CLASSES[c.cls].speed;
    if (input.sprint && !c.charging && !c.blockHeld) s *= KIT.sprintMult;
    if (c.bandageT > 0) s *= 0.5;
    if (c.slowT > 0) s *= 0.7;
    if (c.blockHeld) s *= 0.55;
    return s;
  }

  private isOpen = (d: Door): boolean => this.doorOpen[d.id];

  private doorPassableWatch = (d: Door): boolean => this.doorOpen[d.id];

  private doorPassableGloam = (d: Door): boolean => this.doorOpen[d.id];

  private doorCostGloam = (d: Door): number => {
    if (!d.barricade) return 0;
    const s = this.structures[d.barricade];
    // A live barricade costs time to chew through; prefer open routes.
    return s.hp > 0 ? 10 + s.hp / 20 : 0;
  };

  private barricadeBlocks(d: Door): boolean {
    return d.barricade != null && this.structures[d.barricade].hp > 0;
  }

  charElev(c: Character): number {
    return elevAt(ROOMS[c.room], c.y);
  }

  unitElev(u: GloamUnit): number {
    return elevAt(ROOMS[u.room], u.y);
  }

  losCU(c: Character, u: GloamUnit): boolean {
    return hasLos(c.room, c.x, c.y, u.room, u.x, u.y, this.isOpen);
  }

  // Move an entity with room-aware collision. Returns the barricade the
  // mover is pressing against, when one blocks the crossing.
  private moveEntity(
    e: { room: RoomId; x: number; y: number; radius: number },
    dx: number,
    dy: number,
    isGloamMover: boolean,
    canClimb = false,
  ): StructureId | null {
    let blocked: StructureId | null = null;
    const room = ROOMS[e.room];
    const nx = e.x + dx;
    const ny = e.y + dy;
    const r = e.radius;
    const inX = nx >= room.x0 + r && nx <= room.x1 - r;
    const inY = ny >= room.y0 + r && ny <= room.y1 - r;
    if (inX && inY) {
      e.x = nx;
      e.y = ny;
      return null;
    }
    // Try door crossings out of this room.
    for (const d of doorsOf(e.room)) {
      if (!this.doorOpen[d.id]) continue;
      const target = otherSide(d, e.room);
      if (d.axis === "x") {
        const crossingN = d.at >= room.y1 - 0.01 && ny > room.y1 - r;
        const crossingS = d.at <= room.y0 + 0.01 && ny < room.y0 + r;
        if (!crossingN && !crossingS) continue;
        if (nx < d.lo + r * 0.5 || nx > d.hi - r * 0.5) continue;
      } else {
        const crossingE = d.at >= room.x1 - 0.01 && nx > room.x1 - r;
        const crossingW = d.at <= room.x0 + 0.01 && nx < room.x0 + r;
        if (!crossingE && !crossingW) continue;
        if (ny < d.lo + r * 0.5 || ny > d.hi - r * 0.5) continue;
      }
      if (isGloamMover && this.barricadeBlocks(d)) {
        blocked = d.barricade;
        continue;
      }
      const tr = ROOMS[target];
      e.room = target;
      e.x = Math.max(tr.x0 + r, Math.min(tr.x1 - r, nx));
      e.y = Math.max(tr.y0 + r, Math.min(tr.y1 - r, ny));
      return null;
    }
    // Stalker climbing: treat the rampart overlook as a wall it can scale.
    if (canClimb) {
      const pairs: [RoomId, RoomId][] = [
        ["causeway", "rampart"],
        ["treeline", "rampart"],
        ["gateyard", "rampart"],
        ["rampart", "gateyard"],
      ];
      for (const [from, to] of pairs) {
        if (e.room !== from) continue;
        const tr = ROOMS[to];
        const cx = Math.max(tr.x0 + r, Math.min(tr.x1 - r, nx));
        const cy = Math.max(tr.y0 + r, Math.min(tr.y1 - r, ny));
        if (Math.hypot(cx - nx, cy - ny) < 3) {
          e.room = to;
          e.x = cx;
          e.y = cy;
          return null;
        }
      }
    }
    e.x = Math.max(room.x0 + r, Math.min(room.x1 - r, nx));
    e.y = Math.max(room.y0 + r, Math.min(room.y1 - r, ny));
    return blocked;
  }

  // ---- step ---------------------------------------------------------------

  step(playerInput: InputState) {
    if (this.over) return;
    this.time += DT;
    this.tick++;

    const partnerInput = partnerThink(this, this.chars[1], this.partnerBrain);

    this.updateChar(this.chars[0], playerInput, this.prevInput[0]);
    this.updateChar(this.chars[1], partnerInput, this.prevInput[1]);
    this.prevInput = [{ ...playerInput }, { ...partnerInput }];

    this.updatePhase();
    this.tracers = this.tracers.filter((tr) => this.time - tr.t < 0.35);
    this.updateGloam();
    this.updateHazards();
    this.updateImpacts();
    this.updateDrops();
    this.checkEnd();
  }

  private updatePhase() {
    if (this.phase === "combat") {
      const spawning = this.waveCtl.queue.length > 0;
      // Backstop against any stuck-unit softlock: a leftover horde that
      // has neither dealt nor taken damage for a full minute loses its
      // nerve and slinks back into the dark.
      if (
        !spawning &&
        this.gloam.length > 0 &&
        this.gloam.every((u) => u.engaged > 60)
      ) {
        this.gloam = [];
        this.sfx("snarl");
      }
      if (!spawning && this.gloam.length === 0) {
        this.phase = "quiet";
        this.quietT = WAVE.quietTime;
        this.endOfWaveBookkeeping();
      } else {
        this.spawnerTick();
      }
    } else if (this.phase === "quiet") {
      this.quietT -= DT;
      if (this.quietT <= 0) {
        this.phase = "intermission";
        for (const c of this.chars) {
          if (c.state === "up") c.hp += (c.maxHp - c.hp) * 0.3;
        }
        const open = Object.values(this.districts).filter(Boolean).length;
        this.intermissionT = Math.min(
          WAVE.intermissionCap,
          WAVE.intermissionBase + open * WAVE.intermissionPerDistrict,
        );
        this.bark("intermission");
      }
    } else if (this.phase === "intermission") {
      this.intermissionT -= DT;
      if (this.intermissionT <= 0) this.startWave(this.wave + 1);
    }
  }

  private endOfWaveBookkeeping() {
    const w = this.wave;
    this.emit({ type: "wave-clear", wave: w });
    this.sfx("wave-clear");
    this.bark("wave-clear");
    this.addValor(ECON.waveClearBase + ECON.waveClearPerWave * w);
    this.addScore(ECON.scoreWaveClearBase + ECON.scoreWaveClearPerWave * w);
    if (!this.playerHurtThisWave && w >= ECON.ironWatchMinWave) {
      this.addValor(ECON.ironWatchValor);
      this.addScore(ECON.scoreIronWatch);
      this.ironWatchWaves++;
    }
    for (const c of this.chars) {
      if (c.poulticeWaves > 0) c.poulticeWaves--;
      if (c.whetstoneWaves > 0) c.whetstoneWaves--;
      if (c.mealWaves > 0) {
        c.mealWaves--;
        if (c.mealWaves === 0) {
          c.maxHp -= CONSUMABLE_FX.mealMaxHp;
          c.hp = Math.min(c.hp, c.maxHp);
        }
      }
      c.trapCharges = upgradeEffects.trapCharges[this.tier(c, "traps-line")];
    }
    this.wellStock = 2;
    if (w > 0 && w % this.mods.cacheEvery === 0) this.restockCaches();
    if (w > 0 && w % 5 === 0) this.restockRacks();
    if (w === 3) this.achieve("first-night");
    if (w === 8 && this.archNeverBroken) this.achieve("hold-the-arch");
    if (w === 20 && this.cfg.difficulty !== "ember") this.achieve("the-long-count");
  }

  startWave(n: number) {
    if (this.bossCacheOffer && this.bossCacheOffer.length > 0) {
      // A cache left unclaimed through the whole intermission auto-claims
      // its first offer for the player rather than vanishing.
      this.claimBossCache(0, 0);
    }
    this.wave = n;
    this.phase = "combat";
    this.playerHurtThisWave = false;
    this.waveName = milestoneName(n, (len) => Math.floor(this.rng() * len));
    this.emit({ type: "wave-start", wave: n, name: this.waveName });
    this.sfx("wave-horn");
    this.openScheduledDoors(n);
    this.buildWaveQueue(n);
    this.waveCtl.hornT = WAVE.hornLead;
    this.waveCtl.spawnT = 0;
    this.waveCtl.interval = trickleInterval(n);
    if (n >= 15) this.bark("deep-waves");
  }

  private openScheduledDoors(wave: number) {
    for (const d of DOORS) {
      if (d.openAtWave != null && wave >= d.openAtWave && !this.doorOpen[d.id]) {
        this.doorOpen[d.id] = true;
        this.sfx("sapper-breach");
      }
    }
  }

  private effectiveDebut(t: GloamType): number {
    const def = GLOAM[t];
    if (this.mods.intelBoost && def.tier !== "feral") {
      return Math.max(1, def.debutWave - 2);
    }
    return def.debutWave;
  }

  private buildWaveQueue(n: number) {
    const queue: GloamType[] = [];
    let budget = waveBudget(n);
    const boss = bossForWave(n);
    if (boss) {
      queue.push(boss.boss);
      budget = Math.round(budget * B.bossEscortBudgetFrac);
    }
    const band = bandFor(n);
    const entries = Object.entries(band.weights) as [GloamType, number][];
    for (const [t, w] of entries) {
      if (n < this.effectiveDebut(t)) continue;
      const cost = POINT_COST[t] ?? 10;
      const share = Math.floor((budget * w) / cost);
      // Alphas bring their pack from the same share.
      for (let i = 0; i < share; i++) queue.push(t);
    }
    const spentEach = entries.reduce((acc, [t, w]) => {
      if (n < this.effectiveDebut(t)) return acc;
      const cost = POINT_COST[t] ?? 10;
      return acc + Math.floor((budget * w) / cost) * cost;
    }, 0);
    const gnashers = Math.max(0, Math.floor((budget - spentEach) / POINT_COST.gnasher!));
    for (let i = 0; i < gnashers; i++) queue.push("gnasher");
    // Deterministic shuffle so types interleave; alphas pulled forward so
    // packs form around them, boss stays first.
    const head = boss ? queue.splice(0, 1) : [];
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    this.waveCtl.queue = [...head, ...queue];
  }

  private activeGates() {
    const gates = SPAWN_GATES.filter((g) => {
      if (this.wave < g.activeAtWave) return false;
      if (g.needsDistrict && !this.districts[g.needsDistrict]) return false;
      return true;
    });
    return gates;
  }

  private spawnerTick() {
    if (this.waveCtl.hornT > 0) {
      this.waveCtl.hornT -= DT;
      return;
    }
    if (this.waveCtl.queue.length === 0) return;
    if (this.gloam.length >= WAVE.concurrencyCap) return;
    this.waveCtl.spawnT -= DT;
    if (this.waveCtl.spawnT > 0) return;
    this.waveCtl.spawnT = this.waveCtl.interval * (0.7 + this.rng() * 0.6);
    const type = this.waveCtl.queue.shift()!;
    const gates = this.activeGates();
    const useHole =
      this.holes.length > 0 && this.rng() < 0.5 ? this.holes[0] : null;
    const gate = gates[this.gateRotation++ % gates.length];
    const at = useHole ?? gate;
    const gateId = useHole ? "sapper-hole" : gate.id;
    this.spawnUnit(type, at.room, at.x, at.y, gateId, false);
  }

  spawnUnit(
    type: GloamType,
    room: RoomId,
    x: number,
    y: number,
    gate: string,
    escort: boolean,
  ): GloamUnit {
    const def = GLOAM[type];
    const hpMult = hpScale(this.wave) * this.mods.hpMult;
    const dmgMult = dmgScale(this.wave) * this.mods.dmgMult;
    const boss = bossForWave(this.wave);
    const cycleMult =
      def.boss && boss ? Math.pow(B.bossRepeatHpMult, boss.cycle) : 1;
    const jitter = () => (this.rng() - 0.5) * 2.5;
    const u: GloamUnit = {
      id: this.unitSeq++,
      type,
      tier:
        this.mods.intelBoost && type === "breacher" ? "cunning" : def.tier,
      room,
      x: x + jitter(),
      y: y + jitter(),
      yaw: 0,
      radius: def.radius,
      height: def.height,
      hp: def.hp * hpMult * cycleMult,
      maxHp: def.hp * hpMult * cycleMult,
      speed: def.speed * speedScale(this.wave),
      dmg: def.dmg * dmgMult,
      structDmg: def.structDmg * dmgMult,
      attackCycle: def.attackCycle,
      attackReach: def.attackReach,
      state: type === "stalker" ? "perch" : "advance",
      stateT: 0,
      attackCd: def.attackCycle * this.rng(),
      path: null,
      pathIdx: 0,
      goal: null,
      targetChar: -1,
      targetStruct: null,
      packId: -1,
      packRole: null,
      shieldHp: 0,
      tetherUnit: -1,
      hexSpeed: false,
      slowT: 0,
      slowMult: 1,
      burnDps: 0,
      burnT: 0,
      stunned: 0,
      staggered: 0,
      carryValor: 0,
      carryGoods: false,
      specialCd: 0,
      dodgeCd: 0,
      engaged: 99,
      spawnGate: gate,
      escort,
    };
    const r = ROOMS[room];
    u.x = Math.max(r.x0 + u.radius, Math.min(r.x1 - u.radius, u.x));
    u.y = Math.max(r.y0 + u.radius, Math.min(r.y1 - u.radius, u.y));
    if (type === "alpha") {
      u.packId = this.packSeq++;
      // Claim unclaimed gnashers near the same gate into the pack.
      let claimed = 0;
      for (const g of this.gloam) {
        if (claimed >= B.packMax) break;
        if (g.type !== "gnasher" || g.packId !== -1) continue;
        if (Math.hypot(g.x - u.x, g.y - u.y) > B.packClaimRadius && g.room !== room)
          continue;
        g.packId = u.packId;
        g.packRole = claimed % 2 === 0 ? "front" : "flank";
        claimed++;
      }
      this.bark("pack-split");
      this.sfx("pack-howl");
    }
    if (type === "gnasher") {
      // Join an existing understrength pack spawning from the same gate.
      const alpha = this.gloam.find(
        (g) =>
          g.type === "alpha" &&
          g.spawnGate === gate &&
          this.gloam.filter((m) => m.packId === g.packId).length < B.packMax,
      );
      if (alpha) {
        u.packId = alpha.packId;
        const members = this.gloam.filter((m) => m.packId === alpha.packId);
        u.packRole = members.length % 2 === 0 ? "front" : "flank";
      }
    }
    if (!this.debutsSeen.has(type)) {
      this.debutsSeen.add(type);
      if (GLOAM[type].boss) this.sfx("boss-stinger");
      else this.bark("type-debut");
      if (type === "hexer") this.bark("hexer-spawn");
    }
    this.gloam.push(u);
    return u;
  }

  // ---- characters ---------------------------------------------------------

  private updateChar(c: Character, input: InputState, prev: InputState) {
    if (c.state === "gone") return;
    c.yaw = input.yaw;
    c.pitch = input.pitch;
    if (input.command && c.idx === 0) this.command = input.command;

    c.immunity = Math.max(0, c.immunity - DT);
    c.attackCd = Math.max(0, c.attackCd - DT);
    c.skillCd = Math.max(0, c.skillCd - DT);
    c.daggerCd = Math.max(0, c.daggerCd - DT);
    c.tauntT = Math.max(0, c.tauntT - DT);
    c.staggered = Math.max(0, c.staggered - DT);
    c.slowT = Math.max(0, c.slowT - DT);
    c.manaDelay = Math.max(0, c.manaDelay - DT);

    if (c.state === "downed") {
      c.bleedout -= DT;
      if (c.bleedout <= 0) {
        c.state = "gone";
        return;
      }
      const spd = KIT.downedCrawlSpeed;
      this.moveEntity(c, input.forward * Math.cos(c.yaw) * spd * DT +
        input.strafe * Math.cos(c.yaw - Math.PI / 2) * spd * DT,
        input.forward * Math.sin(c.yaw) * spd * DT +
        input.strafe * Math.sin(c.yaw - Math.PI / 2) * spd * DT, false);
      return;
    }

    // Regen sources.
    if (c.cls === "mage" && c.manaDelay <= 0) {
      const regen = upgradeEffects.manaRegen[this.tier(c, "attune-line")];
      c.mana = Math.min(this.manaMax(c), c.mana + regen * DT);
    }
    if (c.cls === "knight" && !c.blockHeld) {
      const regen = upgradeEffects.guardRegen[this.tier(c, "guard-line")];
      c.guard = Math.min(this.guardMax(c), c.guard + regen * DT);
    }
    if (c.poulticeWaves > 0) {
      c.hp = Math.min(c.maxHp, c.hp + CONSUMABLE_FX.poulticeRegen * DT);
    }

    // Movement.
    if (c.staggered <= 0) {
      const spd = this.charSpeed(c, input);
      const fx = Math.cos(c.yaw);
      const fy = Math.sin(c.yaw);
      const rx = Math.cos(c.yaw - Math.PI / 2);
      const ry = Math.sin(c.yaw - Math.PI / 2);
      let mx = input.forward * fx + input.strafe * rx;
      let my = input.forward * fy + input.strafe * ry;
      const ml = Math.hypot(mx, my);
      if (ml > 1) {
        mx /= ml;
        my /= ml;
      }
      this.moveEntity(c, mx * spd * DT, my * spd * DT, false);
    }

    // Block state feeds damage resolution.
    c.blockHeld = c.cls === "knight" && input.secondary && c.staggered <= 0;

    // Edge-detected actions.
    const pressed = (k: "skill" | "bandage" | "cycleAmmo" | "secondary") =>
      input[k] && !prev[k];

    if (pressed("cycleAmmo") && c.cls === "archer") {
      const order: ArrowType[] = ["broadhead", "bodkin", "ember"];
      c.arrowType = order[(order.indexOf(c.arrowType) + 1) % 3];
      this.sfx("station-use");
    }

    if (pressed("bandage") && c.bandages > 0 && c.bandageT <= 0 && c.hp < c.maxHp) {
      c.bandageT = KIT.bandageTime;
      c.bandages--;
    }
    if (c.bandageT > 0) {
      c.bandageT -= DT;
      if (c.bandageT <= 0) {
        c.hp = Math.min(c.maxHp, c.hp + KIT.bandageHeal);
        this.sfx("mend");
      }
    }

    if (pressed("skill")) this.useSkill(c);

    this.updatePrimary(c, input, prev);
    if (c.cls === "archer" && pressed("secondary")) this.daggerStrike(c);
    if (c.cls === "mage" && pressed("secondary")) this.mend(c);
    this.updateInteract(c, input);
  }

  manaMax(c: Character): number {
    return upgradeEffects.manaMax[this.tier(c, "attune-line")];
  }

  guardMax(c: Character): number {
    return upgradeEffects.guardMax[this.tier(c, "guard-line")];
  }

  quiverMax(c: Character): number {
    return upgradeEffects.quiverMax[this.tier(c, "quiver-line")];
  }

  private useSkill(c: Character) {
    if (c.skillCd > 0) return;
    if (c.cls === "knight") {
      const radius = upgradeEffects.tauntRadius[this.tier(c, "fervor-line")];
      c.tauntT = KIT.tauntDuration;
      c.skillCd = upgradeEffects.tauntCooldown[this.tier(c, "fervor-line")];
      this.sfx("taunt");
      for (const u of this.gloam) {
        if (u.room !== c.room && !this.losCU(c, u)) continue;
        if (Math.hypot(u.x - c.x, u.y - c.y) <= radius) {
          u.targetChar = c.idx;
          u.targetStruct = null;
        }
      }
    } else if (c.cls === "archer") {
      if (c.trapCharges <= 0) return this.sfx("denied");
      c.trapCharges--;
      this.hazards.push({
        kind: "caltrops",
        room: c.room,
        x: c.x,
        y: c.y,
        radius: KIT.trapRadius,
        dps: 0,
        slow: 1 - upgradeEffects.trapSlow[this.tier(c, "traps-line")],
        barbDps: upgradeEffects.trapBarbs[this.tier(c, "traps-line")],
        ttl: 30,
        hurts: "gloam",
      });
      this.sfx("trap-place");
    } else {
      const cost = KIT.burnFieldCost;
      if (c.mana < cost) return this.sfx("denied");
      c.mana -= cost;
      c.manaDelay = KIT.manaRegenDelay;
      c.skillCd = KIT.burnFieldCooldown;
      const dist = 8;
      const tx = c.x + Math.cos(c.yaw) * dist;
      const ty = c.y + Math.sin(c.yaw) * dist;
      const room = ROOMS[c.room];
      this.hazards.push({
        kind: "burnfield",
        room: c.room,
        x: Math.max(room.x0, Math.min(room.x1, tx)),
        y: Math.max(room.y0, Math.min(room.y1, ty)),
        radius: KIT.burnFieldRadius,
        dps: KIT.burnFieldDps * this.dmgMult(c),
        slow: 1,
        barbDps: 0,
        ttl: KIT.burnFieldTime,
        hurts: "gloam",
      });
      this.sfx("burn-field");
    }
  }

  private updatePrimary(c: Character, input: InputState, prev: InputState) {
    const w = this.weaponDef(c);
    const pressEdge = input.primary && !prev.primary;
    const releaseEdge = !input.primary && prev.primary;

    if (w.kind === "melee") {
      if (input.primary) c.charge += DT;
      if (releaseEdge && c.attackCd <= 0 && c.staggered <= 0) {
        const heavy = c.charge >= (w.heavyWindup ?? 1.1);
        this.meleeSwing(c, heavy);
      }
      if (!input.primary) c.charge = 0;
      c.charging = input.primary && c.charge > 0.15;
      return;
    }

    if (w.kind === "bow") {
      if (w.flat) {
        if (input.primary && c.attackCd <= 0) this.fireArrow(c, false);
        c.charging = false;
        return;
      }
      if (input.primary) {
        if (c.charge === 0 && c.attackCd <= 0) this.sfx("bow-draw");
        c.charge += DT;
      }
      if (releaseEdge && c.attackCd <= 0) {
        const drawMult = upgradeEffects.drawMult[this.tier(c, "draw-line")];
        const full = c.charge >= (w.chargeTime ?? 0.9) * drawMult;
        this.fireArrow(c, full);
      }
      if (!input.primary) c.charge = 0;
      c.charging = input.primary && c.charge > 0.15;
      return;
    }

    // Focus: tap = bolt, sustained hold = beam.
    if (input.primary) c.beamT += DT;
    else c.beamT = 0;
    if (pressEdge && c.attackCd <= 0) this.castBolt(c);
    if (input.primary && c.beamT > 0.4 && (w.beamDps ?? 0) > 0) {
      const cost = (w.beamCost ?? 0) * DT;
      if (c.mana >= cost) {
        c.mana -= cost;
        c.manaDelay = KIT.manaRegenDelay;
        this.beamTick(c, (w.beamDps ?? 0) * this.dmgMult(c) * DT);
      }
    } else if (input.primary && c.beamT > 0.4 && w.id === "cinder-rod" && c.attackCd <= 0) {
      this.castBolt(c);
    }
    c.charging = input.primary && c.beamT > 0.15;
  }

  private facingCos(c: Character, x: number, y: number): number {
    const dx = x - c.x;
    const dy = y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    return (dx / d) * Math.cos(c.yaw) + (dy / d) * Math.sin(c.yaw);
  }

  private meleeSwing(c: Character, heavy: boolean) {
    const w = this.weaponDef(c);
    c.attackCd = w.cycle ?? 0.5;
    c.charge = 0;
    c.lastAttackAt = this.time;
    this.sfx(heavy ? "swing-heavy" : "swing");
    const dmg = (heavy ? w.heavyDmg! : w.lightDmg!) * this.dmgMult(c);
    const arc = w.arc ?? Math.PI / 2;
    const reach = (w.reach ?? 2.4) + 0.4;
    const arcCos = Math.cos(arc / 2);
    let hits = 0;
    for (const u of this.gloam) {
      if (u.room !== c.room && !this.losCU(c, u)) continue;
      const d = Math.hypot(u.x - c.x, u.y - c.y);
      if (d > reach + u.radius) continue;
      if (this.facingCos(c, u.x, u.y) < arcCos) continue;
      if (Math.abs(this.unitElev(u) - this.charElev(c)) > 2.5) continue;
      hits++;
      let mult = 1;
      const armored = u.type === "ironback" || u.type === "coalhide";
      if (w.vsArmorMult && armored) mult *= w.vsArmorMult;
      if (heavy || w.staggerLight) u.staggered = B.staggerTime;
      if (heavy && u.type === "breacher") u.shieldHp = -1; // shield shattered
      if (heavy && w.knockbackHeavy) {
        const d2 = Math.hypot(u.x - c.x, u.y - c.y) || 1;
        this.moveEntity(
          u,
          ((u.x - c.x) / d2) * w.knockbackHeavy,
          ((u.y - c.y) / d2) * w.knockbackHeavy,
          true,
        );
      }
      this.damageGloam(u, dmg * mult, c, heavy ? "heavy" : "light", false);
    }
    if (hits > 0) this.sfx("melee-hit");
    if (heavy && hits >= 6 && c.idx === 0 && c.cls === "knight") {
      this.achieve("crowd-breaker");
    }
    // Structures in front: the knight never hits friendly structures, so
    // melee only damages gloam.
  }

  private daggerStrike(c: Character) {
    if (c.daggerCd > 0) return;
    c.daggerCd = KIT.daggerCooldown;
    c.lastAttackAt = this.time;
    this.sfx("dagger");
    const arcCos = Math.cos(KIT.daggerArc / 2);
    for (const u of this.gloam) {
      if (u.room !== c.room) continue;
      const d = Math.hypot(u.x - c.x, u.y - c.y);
      if (d > KIT.daggerReach + u.radius) continue;
      if (this.facingCos(c, u.x, u.y) < arcCos) continue;
      this.damageGloam(u, KIT.daggerDmg * this.dmgMult(c), c, "dagger", false);
    }
    this.moveEntity(
      c,
      -Math.cos(c.yaw) * KIT.daggerHop,
      -Math.sin(c.yaw) * KIT.daggerHop,
      false,
    );
  }

  private fireArrow(c: Character, full: boolean) {
    const w = this.weaponDef(c);
    if (c.arrows <= 0) {
      this.sfx("denied");
      c.charge = 0;
      c.attackCd = 0.4;
      return;
    }
    c.arrows--;
    c.attackCd = w.reload ?? 0.5;
    c.charge = 0;
    c.lastAttackAt = this.time;
    this.sfx(w.flat ? (w.id === "repeater" ? "repeater" : "crossbow") : "bow-release");
    const dmgBase = (full ? w.chargedDmg! : w.tapDmg!) * this.dmgMult(c);
    const pierce = full ? (w.pierce ?? 1) : 1;
    this.hitscan(c, dmgBase, pierce, true);
  }

  private beamTick(c: Character, dmg: number) {
    this.hitscan(c, dmg, 1, false, 14);
  }

  // Shared ranged resolution with elevation-aware height check.
  private hitscan(
    c: Character,
    dmg: number,
    pierce: number,
    isArrow: boolean,
    maxRange = RANGED_MAX,
  ) {
    const dirX = Math.cos(c.yaw);
    const dirY = Math.sin(c.yaw);
    const eye = this.charElev(c) + CLASSES[c.cls].eyeHeight;
    const arrow = isArrow ? ARROWS[c.arrowType] : null;
    const reach = Math.min(maxRange, 30);
    const tracer: Tracer | null =
      this.tracers.length < 48
        ? {
            t: this.time,
            x0: c.x,
            y0: c.y,
            h0: eye,
            x1: c.x + dirX * reach,
            y1: c.y + dirY * reach,
            h1: eye + Math.tan(c.pitch) * reach,
            beam: !isArrow,
          }
        : null;
    if (tracer) this.tracers.push(tracer);
    const candidates: { u: GloamUnit; d: number }[] = [];
    for (const u of this.gloam) {
      if (u.room !== c.room && !this.losCU(c, u)) continue;
      const relX = u.x - c.x;
      const relY = u.y - c.y;
      const along = relX * dirX + relY * dirY;
      if (along < 0.3 || along > maxRange) continue;
      const perp = Math.abs(relX * dirY - relY * dirX);
      if (perp > u.radius + 0.25) continue;
      candidates.push({ u, d: along });
    }
    candidates.sort((a, b) => a.d - b.d);
    let left = pierce;
    for (const { u, d } of candidates) {
      if (left <= 0) break;
      const base = this.unitElev(u);
      const hitH = eye + Math.tan(c.pitch) * d;
      if (hitH < base - 0.1 || hitH > base + u.height + 0.1) continue;
      const head = hitH > base + u.height * (1 - KIT.headBandFrac);
      // Breacher plank shield: blocks frontal ranged unless bodkin.
      if (u.type === "breacher" && u.shieldHp >= 0 && !(arrow && arrow.ignoresGuard)) {
        const toC = Math.atan2(c.y - u.y, c.x - u.x);
        const diff = Math.abs(Math.atan2(Math.sin(toC - u.yaw), Math.cos(toC - u.yaw)));
        if (diff < B.breacherShieldArc / 2) {
          this.sfx("clang-block");
          left = 0;
          break;
        }
      }
      let mult = head ? KIT.headshotMult : 1;
      if (u.type === "ironback" && !(arrow && arrow.ignoresGuard)) {
        const toC = Math.atan2(c.y - u.y, c.x - u.x);
        const diff = Math.abs(Math.atan2(Math.sin(toC - u.yaw), Math.cos(toC - u.yaw)));
        if (diff < B.ironbackFrontArc / 2) mult *= B.ironbackFrontMult;
      }
      if (arrow) {
        if (arrow.vsUnarmoredMult !== 1 && u.type !== "ironback" && u.type !== "coalhide") {
          mult *= arrow.vsUnarmoredMult;
        }
        if (arrow.burnDps > 0) {
          u.burnDps = arrow.burnDps;
          u.burnT = ARROWS.ember.burnTime;
        }
      }
      this.damageGloam(u, dmg * mult, c, isArrow ? "arrow" : "beam", head);
      if (isArrow) this.sfx("arrow-hit");
      left--;
      // The tracer stops at the last body it buried itself in.
      if (tracer && left === 0) {
        tracer.x1 = c.x + dirX * d;
        tracer.y1 = c.y + dirY * d;
        tracer.h1 = eye + Math.tan(c.pitch) * d;
      }
    }
  }

  private castBolt(c: Character) {
    const w = this.weaponDef(c);
    const cost = w.boltCost ?? 6;
    if (c.mana < cost) {
      this.sfx("denied");
      return;
    }
    c.mana -= cost;
    c.manaDelay = KIT.manaRegenDelay;
    c.attackCd = w.boltCycle ?? 0.45;
    c.lastAttackAt = this.time;
    this.sfx("bolt-cast");
    // Aim assist: the bolt arcs to the best target near the aim ray.
    const dirX = Math.cos(c.yaw);
    const dirY = Math.sin(c.yaw);
    let best: GloamUnit | null = null;
    let bestD = Infinity;
    for (const u of this.gloam) {
      if (u.room !== c.room && !this.losCU(c, u)) continue;
      const relX = u.x - c.x;
      const relY = u.y - c.y;
      const d = Math.hypot(relX, relY);
      if (d < 1 || d > BOLT_RANGE) continue;
      const cos = (relX * dirX + relY * dirY) / d;
      if (cos < AIM_ASSIST_COS) continue;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    const tx = best ? best.x : c.x + dirX * 12;
    const ty = best ? best.y : c.y + dirY * 12;
    const room = best ? best.room : c.room;
    this.impacts.push({
      t: this.time + (best ? bestD : 12) / BOLT_SPEED,
      t0: this.time,
      fromX: c.x,
      fromY: c.y,
      room,
      x: tx,
      y: ty,
      dmg: (w.boltDmg ?? 16) * this.dmgMult(c),
      radius: 1.5,
      splashFrac: 0.6,
      hurts: "gloam",
      isGlob: false,
      by: c.idx,
    });
  }

  private mend(c: Character) {
    const w = this.weaponDef(c);
    const tierBonus = upgradeEffects.mendBonus[this.tier(c, "mending-line")];
    const cost = Math.max(
      5,
      (w.mendCost ?? 25) - upgradeEffects.mendCostCut[this.tier(c, "mending-line")],
    );
    if (c.mana < cost) {
      this.sfx("denied");
      return;
    }
    const heal = (w.mendHeal ?? 30) + tierBonus;
    const ally = this.chars[c.idx === 0 ? 1 : 0];
    const d = Math.hypot(ally.x - c.x, ally.y - c.y);
    const aimed =
      ally.state !== "gone" &&
      d <= KIT.mendRange &&
      (d < 2 || this.facingCos(c, ally.x, ally.y) >= KIT.mendConeCos) &&
      (ally.room === c.room ||
        hasLos(c.room, c.x, c.y, ally.room, ally.x, ally.y, this.isOpen));
    c.mana -= cost;
    c.manaDelay = KIT.manaRegenDelay;
    this.sfx("mend");
    if (aimed && ally.hp < ally.maxHp) {
      ally.hp = Math.min(ally.maxHp, ally.hp + heal);
      c.healedGiven += heal;
    } else {
      const self = heal * KIT.selfMendFrac;
      c.hp = Math.min(c.maxHp, c.hp + self);
      c.healedGiven += self;
    }
    if (c.idx === 0 && c.cls === "mage" && c.healedGiven >= 1000) {
      this.achieve("lifeline");
    }
  }

  private updateInteract(c: Character, input: InputState) {
    if (!input.interact) {
      c.reviveT = 0;
      c.openT = 0;
      c.openTarget = null;
      return;
    }
    const ally = this.chars[c.idx === 0 ? 1 : 0];
    if (
      ally.state === "downed" &&
      ally.room === c.room &&
      Math.hypot(ally.x - c.x, ally.y - c.y) <= KIT.reviveRange + 0.6
    ) {
      c.reviveT += DT;
      if (c.reviveT === DT) this.sfx("revive-channel");
      if (c.reviveT >= KIT.reviveTime) {
        c.reviveT = 0;
        ally.state = "up";
        ally.hp = ally.maxHp * KIT.reviveHpFrac;
        ally.immunity = KIT.reviveImmunity;
        this.revives++;
        this.addValor(ECON.reviveValor);
        this.addScore(ECON.scoreRevive);
        this.sfx("revive-done");
        this.bark("revive-done");
        if (c.idx === 0 && this.revives >= 3) this.achieve("shoulder-to-shoulder");
      }
      return;
    }
    c.reviveT = 0;
    // District rubble channel.
    for (const [district, pos] of Object.entries(DISTRICT_RUBBLE) as [
      DistrictId,
      { x: number; y: number },
    ][]) {
      if (this.districts[district]) continue;
      if (Math.hypot(pos.x - c.x, pos.y - c.y) > 2.5) continue;
      if (district === "hall" && !this.districts.armory && !this.districts.wellcourt)
        continue;
      if (district === "undercroft" && !this.districts.hall) continue;
      const price = Math.round(PRICES.districtOpen[district] * this.mods.priceMult);
      if (this.valor < price) {
        if (c.openT === 0) this.sfx("denied");
        c.openT = 0;
        return;
      }
      c.openTarget = district;
      c.openT += DT;
      if (c.openT >= 4) {
        c.openT = 0;
        c.openTarget = null;
        this.spendValor(price);
        this.openDistrict(district);
      }
      return;
    }
    c.openT = 0;
    // Well: free bandage stock.
    if (this.districts.wellcourt) {
      const well = STATIONS.find((s) => s.id === "well")!;
      if (
        c.room === well.room &&
        Math.hypot(well.x - c.x, well.y - c.y) < 2 &&
        this.wellStock > 0 &&
        c.bandages < KIT.maxBandages
      ) {
        this.wellStock--;
        c.bandages++;
        this.sfx("station-use");
        return;
      }
    }
    // Undercroft caches: free takes.
    if (this.districts.undercroft) {
      for (const s of STATIONS.filter((s) => s.id === "cache")) {
        if (c.room !== s.room || Math.hypot(s.x - c.x, s.y - c.y) > 2) continue;
        const cache = this.caches[s.index];
        if (cache.arrows > 0 && c.cls === "archer") {
          c.arrows = Math.min(this.quiverMax(c), c.arrows + cache.arrows);
          cache.arrows = 0;
          this.sfx("station-use");
          return;
        }
        if (cache.bandages > 0 && c.bandages < KIT.maxBandages) {
          const take = Math.min(cache.bandages, KIT.maxBandages - c.bandages);
          cache.bandages -= take;
          c.bandages += take;
          this.sfx("station-use");
          return;
        }
      }
    }
    // Early horn at the watchfire during intermission.
    if (
      this.phase === "intermission" &&
      c.room === "gateyard" &&
      Math.hypot(WATCHFIRE_POS.x - c.x, WATCHFIRE_POS.y - c.y) < 3
    ) {
      this.intermissionT = 0;
      this.addValor(ECON.earlyHornValor);
      this.sfx("wave-horn");
    }
  }

  openDistrict(district: DistrictId) {
    this.districts[district] = true;
    for (const d of DOORS) {
      if (d.openedByDistrict === district) this.doorOpen[d.id] = true;
    }
    // A new outer breach starts with a tier 1 barricade already standing:
    // the garrison boards it up as the rubble clears.
    const bar: Partial<Record<DistrictId, StructureId>> = {
      armory: "bar-armory-breach",
      hall: "bar-hall-windows",
    };
    const b = bar[district];
    if (b) {
      this.structures[b] = {
        hp: BARRICADE_HP[1],
        maxHp: BARRICADE_HP[1],
        tier: 1,
      };
    }
    if (district === "undercroft") this.restockCaches();
    this.emit({ type: "district-open", district });
    this.sfx("rubble-open");
    this.bark("district-open");
    const all = Object.values(this.districts).every(Boolean);
    if (all) this.achieve("the-full-hold");
  }

  // ---- damage -------------------------------------------------------------

  damageChar(c: Character, raw: number, source: string, fromX?: number, fromY?: number) {
    if (c.state !== "up" || c.immunity > 0) return;
    let dmg = raw;
    // Knight block: frontal absorb funded by guard.
    const frontal =
      fromX === undefined ||
      fromY === undefined ||
      this.facingCos(c, fromX, fromY) >= Math.cos(KIT.blockArc / 2);
    if (c.blockHeld && c.guard > 0 && frontal) {
      const absorbed = dmg * KIT.blockAbsorb;
      dmg -= absorbed;
      c.damageBlocked += absorbed;
      c.guard -= raw;
      this.sfx("clang-block");
      if (c.guard <= 0) {
        c.guard = 0;
        c.staggered = KIT.guardBreakStagger;
        this.sfx("guard-break");
      }
    }
    dmg *= 1 - this.armorFrac(c);
    c.hp -= dmg;
    c.lastDamagedAt = this.time;
    if (c.idx === 0) this.playerHurtThisWave = true;
    if (c.hp <= 35 && c.hp > 0 && c.idx === 0) this.bark("player-low");
    if (c.hp <= 0) {
      if (c.secondWind) {
        c.secondWind = false;
        c.hp = c.maxHp * 0.5;
        c.immunity = KIT.reviveImmunity;
        this.sfx("revive-done");
        return;
      }
      c.hp = 0;
      c.state = "downed";
      c.bleedout = KIT.bleedoutTime;
      c.blockHeld = false;
      this.sfx("down-sting");
      if (c.idx === 0) {
        this.deathRecap = `Brought down by ${source} in ${this.roomName(c.room)}, wave ${this.wave}.`;
      } else {
        this.bark("player-down");
      }
    }
  }

  private roomName(r: RoomId): string {
    const names: Record<RoomId, string> = {
      treeline: "the treeline",
      causeway: "the causeway",
      gateyard: "the Gateyard",
      rampart: "the rampart",
      stairW: "the west stair",
      stairE: "the east stair",
      outsideW: "the west scrub",
      outsideE: "the gully",
      outsideS: "the south scrub",
      armory: "the Armory",
      wellcourt: "the Well Court",
      hall: "the Great Hall",
      undercroft: "the Undercroft",
    };
    return names[r];
  }

  damageGloam(
    u: GloamUnit,
    dmg: number,
    by: Character | null,
    kind: "light" | "heavy" | "arrow" | "beam" | "dagger" | "splash" | "hazard",
    headshot: boolean,
  ) {
    // Coalhide plate vs seams.
    if (u.type === "coalhide" && by) {
      const toC = Math.atan2(by.y - u.y, by.x - u.x);
      const diff = Math.abs(Math.atan2(Math.sin(toC - u.yaw), Math.cos(toC - u.yaw)));
      dmg *= diff < (Math.PI * 2 - B.coalhideSeamArc) / 2
        ? B.coalhidePlateMult
        : B.coalhideSeamMult;
    }
    if (u.shieldHp > 0) {
      const soak = Math.min(u.shieldHp, dmg);
      u.shieldHp -= soak;
      dmg -= soak;
    }
    u.hp -= dmg;
    u.engaged = 0;
    if (by) by.damageDealt += dmg;
    if (u.hp <= 0) this.killGloam(u, by, headshot, kind);
  }

  private killGloam(
    u: GloamUnit,
    by: Character | null,
    headshot: boolean,
    kind: string,
  ) {
    const i = this.gloam.indexOf(u);
    if (i < 0) return;
    this.gloam.splice(i, 1);
    this.kills++;
    this.sfx("snarl");
    if (by) {
      by.kills++;
      if (kind === "light" || kind === "heavy" || kind === "dagger") {
        if (by.cls === "knight") {
          const heal = upgradeEffects.meleeKillHeal[this.tier(by, "fervor-line")];
          by.hp = Math.min(by.maxHp, by.hp + heal);
        }
      }
      if (headshot) {
        by.headshots++;
        if (by.idx === 0 && by.cls === "archer" && by.headshots >= 25) {
          this.achieve("keen-eye");
        }
      }
    }
    const v = Math.round((VALOR[u.type] ?? 0) * this.mods.valorMult);
    this.addValor(v + (headshot ? ECON.headshotKillValor : 0));
    let pts = SCORE[u.type] ?? 0;
    if (headshot) pts *= 1 + ECON.scoreHeadshotMult;
    this.addScore(pts);

    // Pack break bookkeeping.
    if (u.type === "alpha") {
      const remaining = this.gloam.filter((g) => g.packId === u.packId).length;
      if (remaining > 0) {
        this.alphaDeaths.push({ packId: u.packId, at: this.time, remaining });
        for (const g of this.gloam) {
          if (g.packId === u.packId) {
            g.state = "scatter";
            g.stateT = this.mods.intelBoost ? B.packScatterTime / 2 : B.packScatterTime;
            g.packRole = null;
          }
        }
      }
    }
    if (u.packId !== -1 && u.type !== "alpha") {
      const rec = this.alphaDeaths.find((a) => a.packId === u.packId);
      if (rec) {
        rec.remaining--;
        if (rec.remaining <= 0 && this.time - rec.at <= 8 && by?.idx === 0) {
          this.achieve("pack-breaker");
        }
      }
    }
    if (u.type === "filcher" && (u.carryValor > 0 || u.carryGoods)) {
      this.valor += u.carryValor;
      this.valorRecovered += u.carryValor;
      this.addValor(Math.round(DROPS.filcherKillBonus * this.mods.valorMult));
      if (by?.idx === 0) this.achieve("no-thieves-tonight");
      this.sfx("filcher-jingle");
    }
    if (u.type === "broodmother") {
      for (let k = 0; k < B.broodDeathBurst; k++) {
        if (this.gloam.length >= WAVE.concurrencyCap) break;
        this.spawnUnit("skitterling", u.room, u.x, u.y, u.spawnGate, false);
      }
    }
    if (u.type === "hexer" || u.type === "shepherd") {
      const anotherDriver = this.gloam.some(
        (h) => h.type === "hexer" || h.type === "shepherd",
      );
      if (!anotherDriver) {
        for (const g of this.gloam) g.hexSpeed = false;
      }
    }
    if (GLOAM[u.type].boss) {
      this.bark("boss-down");
      this.dropBossCache(u);
    }
    this.rollDrops(u);
  }

  private rollDrops(u: GloamUnit) {
    const roll = this.rng();
    const scale = this.mods.dropMult;
    if (u.type === "gnasher" && roll < DROPS.gnasherArrowChance * scale) {
      this.drops.push({
        kind: "arrows",
        room: u.room,
        x: u.x,
        y: u.y,
        arrows: DROPS.gnasherArrowCount,
        valor: 0,
        bandages: 0,
        ttl: DROPS.pickupTtl,
      });
    }
    const satchel =
      (u.type === "mauler" && roll < DROPS.maulerSatchelChance * scale) ||
      (u.type === "broodmother" && roll < DROPS.broodSatchelChance * scale);
    if (satchel) {
      this.drops.push({
        kind: "satchel",
        room: u.room,
        x: u.x,
        y: u.y,
        arrows: 0,
        valor: DROPS.satchelValor,
        bandages: this.rng() < DROPS.satchelBandageChance ? 1 : 0,
        ttl: DROPS.pickupTtl,
      });
    }
  }

  private dropBossCache(u: GloamUnit) {
    const quality = this.wave >= 15 ? "masterwork" : this.wave >= 10 ? "fine" : "standard";
    const offer: WeaponInstance[] = [];
    for (const c of this.chars) {
      // A boss cache never offers a downgrade: same tier or better, and
      // never the weapon already carried.
      const curTier = WEAPONS[c.weapon.id].tier;
      const pool = Object.values(WEAPONS).filter(
        (w) =>
          w.cls === c.cls &&
          w.tier >= Math.max(1, curTier) &&
          w.id !== c.weapon.id &&
          !w.sidegrade,
      );
      if (pool.length > 0) {
        offer.push({ id: pick(this.rng, pool).id, quality });
      }
    }
    if (offer.length === 0) return;
    this.bossCacheOffer = offer;
    this.bossCacheAt = { room: u.room, x: u.x, y: u.y };
    for (const c of this.chars) c.bandages = KIT.maxBandages;
  }

  claimBossCache(offerIdx: number, charIdx: 0 | 1): boolean {
    if (!this.bossCacheOffer || !this.bossCacheOffer[offerIdx]) return false;
    const w = this.bossCacheOffer[offerIdx];
    const c = this.chars[charIdx];
    if (WEAPONS[w.id].cls !== c.cls) return false;
    c.weapon = w;
    this.bossCacheOffer = null;
    this.bossCacheAt = null;
    this.sfx("purchase");
    if (w.quality === "masterwork" && charIdx === 0) this.achieve("well-armed");
    return true;
  }

  // ---- the horde ----------------------------------------------------------

  private updateGloam() {
    // Pairwise separation keeps the horde from stacking into one point.
    for (let i = 0; i < this.gloam.length; i++) {
      const a = this.gloam[i];
      for (let j = i + 1; j < this.gloam.length; j++) {
        const b = this.gloam[j];
        if (a.room !== b.room) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d > 0.001 && d < min) {
          const push = ((min - d) / 2) * 0.5;
          const px = (dx / d) * push;
          const py = (dy / d) * push;
          this.moveEntity(a, -px, -py, true);
          this.moveEntity(b, px, py, true);
        }
      }
    }
    for (const u of [...this.gloam]) {
      this.updateUnit(u);
    }
    this.alphaDeaths = this.alphaDeaths.filter((a) => this.time - a.at < 10);
  }

  private nearestChar(u: GloamUnit, needUp = true): Character | null {
    let best: Character | null = null;
    let bestD = Infinity;
    for (const c of this.chars) {
      if (needUp && c.state !== "up") continue;
      if (c.state === "gone") continue;
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private unitTakesHazards(u: GloamUnit) {
    u.slowMult = 1;
    for (const h of this.hazards) {
      if (h.hurts !== "gloam" || h.room !== u.room) continue;
      const d = Math.hypot(h.x - u.x, h.y - u.y);
      if (d > h.radius + u.radius) continue;
      if (h.kind === "caltrops") {
        u.slowMult = Math.min(u.slowMult, h.slow);
        if (h.barbDps > 0) this.damageGloam(u, h.barbDps * DT, null, "hazard", false);
        if (h.ttl > 29.9) this.sfx("trap-trigger");
      } else {
        this.damageGloam(u, h.dps * DT, null, "hazard", false);
      }
    }
    if (u.burnT > 0) {
      u.burnT -= DT;
      this.damageGloam(u, u.burnDps * DT, null, "hazard", false);
    }
  }

  private unitSpeed(u: GloamUnit): number {
    let s = u.speed * u.slowMult;
    if (u.hexSpeed) s *= 1 + B.hexerSpeedBonus;
    // Fairness rule: no walker ever outruns a sprinting archer (7.56).
    // Bursts (pounces, charges) bypass this; sustained pursuit never does.
    if (!GLOAM[u.type].boss) s = Math.min(s, 7.4);
    return s;
  }

  private stepToward(u: GloamUnit, room: RoomId, x: number, y: number): StructureId | null {
    if (u.room === room) {
      const dx = x - u.x;
      const dy = y - u.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) return null;
      const spd = this.unitSpeed(u);
      u.yaw = Math.atan2(dy, dx);
      return this.moveEntity(u, (dx / d) * spd * DT, (dy / d) * spd * DT, true, u.type === "stalker");
    }
    // Follow the room path door by door.
    const cur = u.path?.[u.pathIdx];
    if (!u.path || !cur || (cur.a !== u.room && cur.b !== u.room)) {
      u.path = findPath(u.room, room, this.doorPassableGloam, this.doorCostGloam);
      u.pathIdx = 0;
    }
    if (!u.path || u.path.length === 0 || u.pathIdx >= u.path.length) return null;
    const door = u.path[u.pathIdx];
    const mid = doorMid(door);
    const dx = mid.x - u.x;
    const dy = mid.y - u.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = this.unitSpeed(u);
    u.yaw = Math.atan2(dy, dx);
    const before = u.room;
    const blocked = this.moveEntity(
      u,
      (dx / d) * spd * DT,
      (dy / d) * spd * DT,
      true,
      u.type === "stalker",
    );
    if (u.room !== before) u.pathIdx++;
    return blocked;
  }

  private chewStructure(u: GloamUnit, id: StructureId) {
    u.attackCd -= DT;
    if (u.attackCd > 0) return;
    u.attackCd = u.attackCycle;
    const s = this.structures[id];
    if (s.hp <= 0) return;
    s.hp -= u.structDmg;
    u.engaged = 0;
    this.sfx(id === "watchfire" ? "watchfire-hit" : "structure-hit");
    if (s.hp <= s.maxHp * 0.5 && s.hp + u.structDmg > s.maxHp * 0.5) {
      this.bloodScent(id, u.room);
      if (id !== "watchfire") this.bark("barricade-low");
    }
    if (s.hp <= 0) {
      s.hp = 0;
      if (id === "bar-arch") this.archNeverBroken = false;
      if (id === "watchfire") {
        this.endRun("The Watchfire fell.");
      } else {
        this.sfx("structure-break");
      }
    }
  }

  private bloodScent(id: StructureId, room: RoomId) {
    const pos =
      id === "watchfire"
        ? WATCHFIRE_POS
        : doorMid(DOORS.find((d) => d.barricade === id)!);
    for (const u of this.gloam) {
      if (u.tier !== "feral") continue;
      const d = Math.hypot(u.x - pos.x, u.y - pos.y);
      if (d <= B.bloodScentRadius) {
        u.targetStruct = id;
        u.targetChar = -1;
      }
    }
  }

  private attackChar(u: GloamUnit, c: Character) {
    u.attackCd -= DT;
    if (u.attackCd > 0) return;
    u.attackCd = u.attackCycle;
    u.engaged = 0;
    this.damageChar(c, u.dmg, this.sourceName(u), u.x, u.y);
    if (u.type === "mauler" || GLOAM[u.type].boss) {
      // Knockback unless braced.
      if (!(c.cls === "knight" && c.blockHeld && this.facingCos(c, u.x, u.y) > 0)) {
        const dx = c.x - u.x;
        const dy = c.y - u.y;
        const d = Math.hypot(dx, dy) || 1;
        this.moveEntity(c, (dx / d) * B.maulerKnockback, (dy / d) * B.maulerKnockback, false);
      }
    }
  }

  sourceName(u: GloamUnit): string {
    const names: Partial<Record<GloamType, string>> = {
      gnasher: "a Gnasher",
      lobber: "a Lobber's ember glob",
      alpha: "an Alpha",
      breacher: "a Breacher",
      shrike: "a Shrike",
      mauler: "a Mauler slam",
      ironback: "an Ironback",
      hexer: "a Hexer",
      stalker: "a Stalker's pounce",
      filcher: "a Filcher",
      sapper: "a Sapper",
      broodmother: "a Broodmother",
      skitterling: "skitterlings",
      cracktusk: "Cracktusk's charge",
      shepherd: "the Shepherd",
      coalhide: "Coalhide",
      packlord: "the Packlord",
    };
    return names[u.type] ?? "the Gloam";
  }

  private updateUnit(u: GloamUnit) {
    u.stunned = Math.max(0, u.stunned - DT);
    u.staggered = Math.max(0, u.staggered - DT);
    u.slowT = Math.max(0, u.slowT - DT);
    u.engaged += DT;
    u.dodgeCd = Math.max(0, u.dodgeCd - DT);
    this.unitTakesHazards(u);
    if (u.hp <= 0) return;
    if (u.stunned > 0 || u.staggered > 0) return;

    switch (u.type) {
      case "lobber":
        return this.updateLobber(u);
      case "hexer":
        return this.updateHexer(u);
      case "shrike":
        return this.updateShrike(u);
      case "stalker":
        return this.updateStalker(u);
      case "filcher":
        return this.updateFilcher(u);
      case "sapper":
        return this.updateSapper(u);
      case "broodmother":
        return this.updateBrood(u);
      case "cracktusk":
        return this.updateCracktusk(u);
      case "shepherd":
        return this.updateShepherd(u);
      case "packlord":
        return this.updatePacklord(u);
      default:
        return this.updateMeleeUnit(u);
    }
  }

  // Ferals and simple melee: advance on target, chew what blocks.
  private updateMeleeUnit(u: GloamUnit) {
    if (u.state === "scatter") {
      u.stateT -= DT;
      if (u.stateT <= 0) u.state = "advance";
      else {
        const away = this.nearestChar(u);
        if (away) {
          const dx = u.x - away.x;
          const dy = u.y - away.y;
          const d = Math.hypot(dx, dy) || 1;
          u.yaw = Math.atan2(dy, dx);
          this.moveEntity(u, (dx / d) * u.speed * 0.8 * DT, (dy / d) * u.speed * 0.8 * DT, true);
        }
        return;
      }
    }
    // Taunt and blood scent may have pinned a target already.
    let target: Character | null =
      u.targetChar >= 0 ? this.chars[u.targetChar] : null;
    if (target && target.state !== "up") {
      target = null;
      u.targetChar = -1;
    }
    if (u.targetStruct) {
      const s = this.structures[u.targetStruct];
      if (s.hp <= 0 && u.targetStruct !== "watchfire") u.targetStruct = null;
    }
    if (!u.targetStruct) {
      const near = this.nearestChar(u);
      if (
        near &&
        (near.room === u.room ||
          (Math.hypot(near.x - u.x, near.y - u.y) < 14 &&
            hasLos(u.room, u.x, u.y, near.room, near.x, near.y, this.isOpen)))
      ) {
        target = target ?? near;
      }
    }
    if (target) {
      u.targetChar = target.idx;
      // Shield escort: a breacher slows so its lobbers keep cover.
      if (u.type === "breacher") {
        const ward = this.gloam.find(
          (g) => g.type === "lobber" && g.room === u.room &&
            Math.hypot(g.x - u.x, g.y - u.y) < 10,
        );
        if (ward && Math.hypot(ward.x - u.x, ward.y - u.y) > 3.5) {
          u.slowMult = Math.min(u.slowMult, 0.5);
        }
      }
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      const sameFloor = Math.abs(this.unitElev(u) - elevAt(ROOMS[target.room], target.y)) < 2.5;
      if (d <= u.attackReach + target.radius && target.room === u.room && sameFloor) {
        u.yaw = Math.atan2(target.y - u.y, target.x - u.x);
        if (u.type === "mauler" || GLOAM[u.type].boss) {
          // Telegraphed slam.
          if (u.state !== "telegraph") {
            u.state = "telegraph";
            u.stateT = B.maulerTelegraph;
            this.sfx("mauler-roar");
            this.bark("mauler-telegraph");
            return;
          }
          u.stateT -= DT;
          if (u.stateT > 0) return;
          u.state = "fight";
          const d2 = Math.hypot(target.x - u.x, target.y - u.y);
          if (d2 <= u.attackReach + target.radius + 1) {
            this.attackChar(u, target);
            this.sfx("mauler-slam");
          }
          return;
        }
        u.state = "fight";
        this.attackChar(u, target);
        return;
      }
      u.state = "advance";
      // Pack flankers route around: pick the door not used by the pack front.
      const blocked = this.stepToward(u, target.room, target.x, target.y);
      if (blocked) {
        u.state = "chew";
        this.chewStructure(u, blocked);
      }
      return;
    }
    // Unopposed: press toward the Watchfire.
    u.state = "advance";
    const wf = this.structures.watchfire;
    if (u.room === "gateyard") {
      const d = Math.hypot(WATCHFIRE_POS.x - u.x, WATCHFIRE_POS.y - u.y);
      if (d < u.attackReach + 1.5) {
        u.state = "chew";
        this.chewStructure(u, "watchfire");
        return;
      }
    }
    if (wf.hp > 0) {
      const blocked = this.stepToward(u, "gateyard", WATCHFIRE_POS.x, WATCHFIRE_POS.y);
      if (blocked) {
        u.state = "chew";
        this.chewStructure(u, blocked);
      }
    }
  }

  private updateLobber(u: GloamUnit) {
    // Seek breacher cover, hold range, lob.
    const target = this.nearestChar(u);
    if (!target) return this.updateMeleeUnit(u);
    // The tide presses in: no artillery sieges from outside the walls.
    const outside =
      u.room === "treeline" ||
      u.room === "outsideW" ||
      u.room === "outsideE" ||
      u.room === "outsideS";
    const d = Math.hypot(target.x - u.x, target.y - u.y);
    const visible =
      !outside &&
      (target.room === u.room ||
        hasLos(u.room, u.x, u.y, target.room, target.x, target.y, this.isOpen));
    if (!visible || d > GLOAM.lobber.attackReach) {
      const blocked = this.stepToward(u, target.room, target.x, target.y);
      if (blocked) this.chewStructure(u, blocked);
      return;
    }
    u.state = "standoff";
    u.yaw = Math.atan2(target.y - u.y, target.x - u.x);
    // Back off when pressed.
    if (d < B.lobberMinRange) {
      const dx = u.x - target.x;
      const dy = u.y - target.y;
      const l = Math.hypot(dx, dy) || 1;
      this.moveEntity(u, (dx / l) * u.speed * 0.7 * DT, (dy / l) * u.speed * 0.7 * DT, true);
    } else {
      // Sidle behind the nearest breacher when one is close.
      const cover = this.gloam.find(
        (g) => g.type === "breacher" && g.room === u.room &&
          Math.hypot(g.x - u.x, g.y - u.y) < 6,
      );
      if (cover) {
        const bx = cover.x - Math.cos(cover.yaw) * 1.2;
        const by = cover.y - Math.sin(cover.yaw) * 1.2;
        const dx = bx - u.x;
        const dy = by - u.y;
        const l = Math.hypot(dx, dy);
        if (l > 0.5) this.moveEntity(u, (dx / l) * u.speed * 0.5 * DT, (dy / l) * u.speed * 0.5 * DT, true);
      }
    }
    u.attackCd -= DT;
    if (u.attackCd <= 0) {
      u.attackCd = u.attackCycle;
      u.engaged = 0;
      this.sfx("lob");
      this.impacts.push({
        t: this.time + B.lobberFlight,
        t0: this.time,
        fromX: u.x,
        fromY: u.y,
        room: target.room,
        x: target.x,
        y: target.y,
        dmg: u.dmg,
        radius: B.lobberPuddleRadius,
        splashFrac: 1,
        hurts: "watch",
        isGlob: true,
        by: -1,
      });
    }
  }

  private updateHexer(u: GloamUnit) {
    u.specialCd -= DT;
    const target = this.nearestChar(u);
    // Keep standoff distance.
    if (target) {
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      if (d < B.hexerStandoff && target.room === u.room) {
        const dx = u.x - target.x;
        const dy = u.y - target.y;
        const l = Math.hypot(dx, dy) || 1;
        this.moveEntity(u, (dx / l) * u.speed * DT, (dy / l) * u.speed * DT, true);
      }
    }
    // A hexer with no flock nearby drifts in with the horde; standing
    // alone in the scrub, it is just a target nobody can reach.
    let ally: GloamUnit | null = null;
    let allyD = Infinity;
    for (const g of this.gloam) {
      if (g.id === u.id || g.type === "hexer") continue;
      const d = Math.hypot(g.x - u.x, g.y - u.y);
      if (d < allyD) {
        allyD = d;
        ally = g;
      }
    }
    if (ally && allyD > B.hexerRange * 0.6) {
      const blocked = this.stepToward(u, ally.room, ally.x, ally.y);
      if (blocked) this.chewStructure(u, blocked);
    } else if (!ally) {
      const blocked = this.stepToward(u, "gateyard", WATCHFIRE_POS.x, WATCHFIRE_POS.y);
      if (blocked) this.chewStructure(u, blocked);
    }
    if (u.specialCd > 0) return;
    u.specialCd = B.hexerRetether;
    // Doctrine: shield a mauler first, speed the pack second.
    const mauler = this.gloam.find(
      (g) =>
        (g.type === "mauler" || g.type === "coalhide") &&
        g.shieldHp <= 0 &&
        Math.hypot(g.x - u.x, g.y - u.y) <= B.hexerRange,
    );
    if (mauler) {
      u.tetherUnit = mauler.id;
      mauler.shieldHp = B.hexerShieldHp;
      this.sfx("hexer-tether");
      return;
    }
    let sped = 0;
    for (const g of this.gloam) {
      if (g.id === u.id || g.hexSpeed) continue;
      if (Math.hypot(g.x - u.x, g.y - u.y) <= B.hexerRange) {
        g.hexSpeed = true;
        sped++;
        if (sped >= 6) break;
      }
    }
    if (sped > 0) this.sfx("hexer-tether");
  }

  private updateShrike(u: GloamUnit) {
    const target = this.nearestChar(u);
    if (!target) return this.updateMeleeUnit(u);
    if (target.room !== u.room) {
      const blocked = this.stepToward(u, target.room, target.x, target.y);
      if (blocked) this.chewStructure(u, blocked);
      return;
    }
    const d = Math.hypot(target.x - u.x, target.y - u.y);
    u.yaw = Math.atan2(target.y - u.y, target.x - u.x);
    // Read the player's aim: sidestep when stared down.
    const aimCos = this.facingCos(target, u.x, u.y);
    if (aimCos > B.shrikeDodgeCos && d > 2.5 && u.dodgeCd <= 0) {
      u.dodgeCd = B.shrikeDodgeCooldown;
      const side = this.rng() < 0.5 ? 1 : -1;
      const px = -Math.sin(u.yaw) * side;
      const py = Math.cos(u.yaw) * side;
      this.moveEntity(u, px * 2.2, py * 2.2, true);
      this.sfx("shrike-hiss");
      return;
    }
    // Commit only while the target is committed.
    const committed =
      target.charging ||
      target.attackCd > 0.15 ||
      this.time - target.lastAttackAt < B.shrikeCommitWindow ||
      target.bandageT > 0 ||
      target.reviveT > 0 ||
      this.facingCos(target, u.x, u.y) < 0;
    if (d <= u.attackReach + target.radius && committed) {
      this.attackChar(u, target);
      return;
    }
    if (committed || d > B.shrikeCircle * 1.6) {
      const blocked = this.stepToward(u, target.room, target.x, target.y);
      if (blocked) this.chewStructure(u, blocked);
    } else {
      // Orbit at circling distance.
      const ang = Math.atan2(u.y - target.y, u.x - target.x) + 1.4 * DT;
      const ox = target.x + Math.cos(ang) * B.shrikeCircle;
      const oy = target.y + Math.sin(ang) * B.shrikeCircle;
      const dx = ox - u.x;
      const dy = oy - u.y;
      const l = Math.hypot(dx, dy) || 1;
      this.moveEntity(u, (dx / l) * u.speed * 0.9 * DT, (dy / l) * u.speed * 0.9 * DT, true);
    }
  }

  private updateStalker(u: GloamUnit) {
    if (u.state === "perch") {
      // Head for the rampart and wait for an opening.
      if (u.room !== "rampart") {
        this.stepToward(u, "rampart", 0, 25.7);
        return;
      }
      this.bark("stalker-overhead");
      // Opportunism: pounce only on the engaged or the isolated.
      let mark: Character | null = null;
      for (const c of this.chars) {
        if (c.state !== "up") continue;
        const other = this.chars[c.idx === 0 ? 1 : 0];
        const isolated =
          other.state !== "up" ||
          Math.hypot(other.x - c.x, other.y - c.y) > B.stalkerIsolatedDist;
        const engaged = this.time - c.lastAttackAt < 1.2 || this.time - c.lastDamagedAt < 1.2;
        if (isolated || engaged) {
          mark = c;
          break;
        }
      }
      if (mark && Math.hypot(mark.x - u.x, mark.y - u.y) < B.stalkerPounceRange + 6) {
        u.state = "pounce";
        u.targetChar = mark.idx;
        this.sfx("stalker-screech");
      }
      return;
    }
    if (u.state === "pounce") {
      const c = u.targetChar >= 0 ? this.chars[u.targetChar] : null;
      if (!c || c.state !== "up") {
        u.state = "advance";
        return;
      }
      const dx = c.x - u.x;
      const dy = c.y - u.y;
      const d = Math.hypot(dx, dy);
      u.yaw = Math.atan2(dy, dx);
      if (d <= u.attackReach + c.radius && c.room === u.room) {
        this.attackChar(u, c);
        u.state = "fight";
        return;
      }
      this.moveEntity(u, (dx / d) * B.stalkerPounceSpeed * DT, (dy / d) * B.stalkerPounceSpeed * DT, true, true);
      return;
    }
    this.updateMeleeUnit(u);
  }

  private richestStore(): { room: RoomId; x: number; y: number; kind: "ledger" | "cache" } | null {
    const options: { room: RoomId; x: number; y: number; kind: "ledger" | "cache"; value: number }[] = [];
    if (this.valor >= 40) {
      options.push({ room: "gateyard", x: 1.5, y: 4, kind: "ledger", value: Math.min(this.valor, DROPS.filcherStealMax) });
    }
    if (this.districts.undercroft) {
      for (const s of STATIONS.filter((s) => s.id === "cache")) {
        const cache = this.caches[s.index];
        const value = cache.arrows + cache.bandages * 30;
        if (value > 0) options.push({ room: s.room, x: s.x, y: s.y, kind: "cache", value });
      }
    }
    if (options.length === 0) return null;
    options.sort((a, b) => b.value - a.value);
    return options[0];
  }

  private updateFilcher(u: GloamUnit) {
    if (u.state === "flee") {
      const gate = SPAWN_GATES.find((g) => g.id === u.spawnGate) ?? SPAWN_GATES[0];
      const blocked = this.stepToward(u, gate.room, gate.x, gate.y);
      if (blocked) this.chewStructure(u, blocked);
      if (u.room === gate.room && Math.hypot(gate.x - u.x, gate.y - u.y) < 2) {
        // Escaped with the goods.
        const i = this.gloam.indexOf(u);
        if (i >= 0) this.gloam.splice(i, 1);
      }
      return;
    }
    const store = this.richestStore();
    if (!store) return this.updateMeleeUnit(u);
    if (u.room === store.room && Math.hypot(store.x - u.x, store.y - u.y) < 1.5) {
      u.state = "steal";
      u.stateT += DT;
      if (u.stateT >= B.filcherStealTime) {
        if (store.kind === "ledger") {
          const take = Math.min(this.valor, DROPS.filcherStealMax);
          this.valor -= take;
          u.carryValor = take;
        } else {
          const s = STATIONS.filter((s) => s.id === "cache").find(
            (s) => s.x === store.x && s.y === store.y,
          );
          if (s) {
            this.caches[s.index] = { arrows: 0, bandages: 0 };
          }
          u.carryGoods = true;
        }
        u.state = "flee";
        u.stateT = 0;
        this.sfx("filcher-jingle");
        this.bark("filcher-raid");
      }
      return;
    }
    u.stateT = 0;
    const blocked = this.stepToward(u, store.room, store.x, store.y);
    if (blocked) this.chewStructure(u, blocked);
    if (u.engaged < 99 && this.rng() < 0.001) this.bark("filcher-raid");
  }

  private updateSapper(u: GloamUnit) {
    u.specialCd -= DT;
    if (u.state === "dig") {
      u.stateT -= DT;
      if (this.tick % 45 === 0) this.sfx("sapper-thud");
      if (u.stateT <= 0) {
        this.holes.push({ room: u.goal!.room, x: u.goal!.x, y: u.goal!.y, ttl: B.sapperHoleTime });
        this.sfx("sapper-breach");
        u.state = "advance";
        u.goal = null;
        u.specialCd = 45; // one dig per stretch, not a drill press
        // The sapper climbs through its own hole.
        u.room = this.holes[this.holes.length - 1].room;
        u.x = this.holes[this.holes.length - 1].x;
        u.y = this.holes[this.holes.length - 1].y;
      }
      return;
    }
    if (!u.goal && u.specialCd <= 0) {
      // Dig into the opened district with the fewest defenders.
      const options: DistrictId[] = (Object.keys(this.districts) as DistrictId[]).filter(
        (d) => this.districts[d],
      );
      if (options.length === 0) return this.updateMeleeUnit(u);
      let best: DistrictId = options[0];
      let bestCount = Infinity;
      for (const d of options) {
        const room = DISTRICT_ROOMS[d];
        const count = this.chars.filter((c) => c.room === room && c.state === "up").length;
        if (count < bestCount) {
          bestCount = count;
          best = d;
        }
      }
      const room = ROOMS[DISTRICT_ROOMS[best]];
      u.goal = {
        room: room.id,
        x: (room.x0 + room.x1) / 2 + (this.rng() - 0.5) * 4,
        y: (room.y0 + room.y1) / 2 + (this.rng() - 0.5) * 4,
      };
      u.state = "dig";
      u.stateT = B.sapperDigTime;
      this.bark("sapper-dig");
      this.sfx("sapper-thud");
      return;
    }
    this.updateMeleeUnit(u);
  }

  private updateBrood(u: GloamUnit) {
    u.specialCd -= DT;
    if (u.specialCd <= 0) {
      u.specialCd = B.broodSpawnEvery;
      for (let k = 0; k < B.broodSpawnBatch; k++) {
        if (this.gloam.length >= WAVE.concurrencyCap) break;
        this.spawnUnit("skitterling", u.room, u.x, u.y, u.spawnGate, false);
      }
      this.sfx("brood-pulse");
    }
    this.updateMeleeUnit(u);
  }

  private updateCracktusk(u: GloamUnit) {
    u.specialCd -= DT;
    if (u.state === "charge") {
      const spd = B.cracktuskChargeSpeed;
      const dx = Math.cos(u.yaw) * spd * DT;
      const dy = Math.sin(u.yaw) * spd * DT;
      const before = { x: u.x, y: u.y };
      const blocked = this.moveEntity(u, dx, dy, true);
      // Trample anything caught in the line.
      for (const c of this.chars) {
        if (c.state !== "up" || c.room !== u.room) continue;
        if (Math.hypot(c.x - u.x, c.y - u.y) < u.radius + c.radius + 0.3) {
          this.attackChar(u, c);
        }
      }
      if (blocked) {
        this.chewStructure(u, blocked);
        this.chewStructure(u, blocked);
        u.state = "stunned";
        u.stunned = B.cracktuskStun;
        this.sfx("mauler-slam");
        return;
      }
      const moved = Math.hypot(u.x - before.x, u.y - before.y);
      if (moved < spd * DT * 0.5) {
        // Hit a wall: stunned and open.
        u.state = "stunned";
        u.stunned = B.cracktuskStun;
        this.sfx("mauler-slam");
      }
      return;
    }
    if (u.state === "telegraph") {
      u.stateT -= DT;
      if (u.stateT <= 0) u.state = "charge";
      return;
    }
    const target = this.nearestChar(u);
    if (u.specialCd <= 0 && target && target.room === u.room) {
      u.specialCd = B.cracktuskCooldown;
      u.state = "telegraph";
      u.stateT = B.cracktuskTelegraph;
      u.yaw = Math.atan2(target.y - u.y, target.x - u.x);
      this.sfx("mauler-roar");
      this.bark("mauler-telegraph");
      return;
    }
    this.updateMeleeUnit(u);
  }

  private updateShepherd(u: GloamUnit) {
    u.specialCd -= DT;
    // The hunt must be huntable: the Shepherd presses in until a player
    // can see it, then holds its standoff inside bow range.
    const target = this.nearestChar(u);
    // Inside the walls or on the causeway counts as presenting itself; a
    // sightline through a door slit does not.
    const inside =
      u.room === "causeway" ||
      u.room === "gateyard" ||
      u.room === "armory" ||
      u.room === "wellcourt" ||
      u.room === "hall" ||
      u.room === "undercroft";
    if (target && !inside) {
      const blocked = this.stepToward(u, target.room, target.x, target.y);
      if (blocked) this.chewStructure(u, blocked);
    } else if (target && target.room === u.room) {
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      if (d < B.shepherdStandoff) {
        const dx = u.x - target.x;
        const dy = u.y - target.y;
        const l = Math.hypot(dx, dy) || 1;
        this.moveEntity(u, (dx / l) * u.speed * DT, (dy / l) * u.speed * DT, true);
      }
    }
    const flock = this.gloam.filter((g) => g.escort && g.type === "gnasher").length;
    if (u.specialCd <= 0 && flock < 6) {
      u.specialCd = B.shepherdSummonEvery;
      for (let k = 0; k < B.shepherdSummonCount; k++) {
        if (this.gloam.length >= WAVE.concurrencyCap) break;
        this.spawnUnit("gnasher", u.room, u.x, u.y, u.spawnGate, true);
      }
      this.sfx("pack-howl");
    }
    // The tether drives whatever runs near the Shepherd, not the world.
    for (const g of this.gloam) {
      if (g.id === u.id) continue;
      if (Math.hypot(g.x - u.x, g.y - u.y) <= 20) g.hexSpeed = true;
    }
  }

  private updatePacklord(u: GloamUnit) {
    u.specialCd -= DT;
    if (u.specialCd <= 0) {
      u.specialCd = B.packlordHowlEvery;
      this.sfx("howl-warning");
      for (const g of this.gloam) {
        g.hexSpeed = true;
        g.slowT = 0;
      }
      this.sfx("pack-howl");
    }
    this.updateMeleeUnit(u);
  }

  // ---- hazards, impacts, drops -------------------------------------------

  private updateHazards() {
    for (const h of this.hazards) {
      h.ttl -= DT;
      if (h.hurts === "watch") {
        for (const c of this.chars) {
          if (c.state !== "up" || c.room !== h.room) continue;
          if (Math.hypot(c.x - h.x, c.y - h.y) <= h.radius + c.radius) {
            this.damageChar(c, h.dps * DT, "a burning puddle");
          }
        }
      }
    }
    this.hazards = this.hazards.filter((h) => h.ttl > 0);
    for (const hole of this.holes) hole.ttl -= DT;
    this.holes = this.holes.filter((h) => h.ttl > 0);
  }

  private updateImpacts() {
    const due = this.impacts.filter((i) => i.t <= this.time);
    this.impacts = this.impacts.filter((i) => i.t > this.time);
    for (const imp of due) {
      if (imp.dmg <= 0) continue;
      if (imp.hurts === "watch") {
        this.sfx("glob-splat");
        for (const c of this.chars) {
          if (c.state !== "up" || c.room !== imp.room) continue;
          if (Math.hypot(c.x - imp.x, c.y - imp.y) <= imp.radius + c.radius) {
            this.damageChar(c, imp.dmg, "a Lobber's ember glob");
          }
        }
        if (imp.isGlob) {
          this.hazards.push({
            kind: "puddle",
            room: imp.room,
            x: imp.x,
            y: imp.y,
            radius: B.lobberPuddleRadius,
            dps: B.lobberPuddleDps * this.mods.dmgMult,
            slow: 1,
            barbDps: 0,
            ttl: B.lobberPuddleTime,
            hurts: "watch",
          });
        }
      } else {
        this.sfx("bolt-hit");
        const by = imp.by >= 0 ? this.chars[imp.by as 0 | 1] : null;
        for (const u of [...this.gloam]) {
          if (u.room !== imp.room) continue;
          const d = Math.hypot(u.x - imp.x, u.y - imp.y);
          if (d <= 0.6 + u.radius) {
            this.damageGloam(u, imp.dmg, by, "splash", false);
          } else if (d <= imp.radius + u.radius) {
            this.damageGloam(u, imp.dmg * imp.splashFrac, by, "splash", false);
          }
        }
      }
    }
  }

  private updateDrops() {
    for (const d of this.drops) {
      d.ttl -= DT;
      for (const c of this.chars) {
        if (c.state !== "up" || c.room !== d.room) continue;
        if (Math.hypot(c.x - d.x, c.y - d.y) > DROPS.pickupRadius + c.radius) continue;
        if (d.kind === "arrows" && c.cls === "archer") {
          c.arrows = Math.min(this.quiverMax(c), c.arrows + d.arrows);
        } else if (d.kind === "arrows") {
          continue;
        }
        if (d.valor > 0) this.addValor(d.valor);
        if (d.bandages > 0) c.bandages = Math.min(KIT.maxBandages, c.bandages + d.bandages);
        d.ttl = 0;
        this.sfx("purchase");
        break;
      }
    }
    this.drops = this.drops.filter((d) => d.ttl > 0);
  }

  // ---- economy ------------------------------------------------------------

  private addValor(v: number) {
    this.valor += Math.round(v);
  }

  private spendValor(v: number) {
    this.valor -= v;
    this.valorSpent += v;
    if (this.valorSpent >= 3000) this.achieve("quartermaster");
    this.sfx("purchase");
  }

  private addScore(pts: number) {
    this.scoreRaw += pts;
    this.score = Math.min(
      ECON.scoreCap,
      Math.round(this.scoreRaw * this.mods.scoreMult),
    );
    if (
      this.score >= 20_000 &&
      this.cfg.difficulty !== "ember" &&
      !this.achievements.has("watch-legend")
    ) {
      this.achieve("watch-legend");
    }
  }

  private price(base: number): number {
    return Math.round(base * this.mods.priceMult);
  }

  private restockRacks() {
    // The quartermaster stocks what the fighters need: one straight
    // upgrade path per class present, plus one wildcard.
    this.rackStock = [];
    const stockFor = (cls: ClassId, wildcard: boolean) => {
      const cur = this.chars[0].cls === cls ? this.chars[0] : this.chars[1];
      const minTier = wildcard ? 1 : Math.min(2, WEAPONS[cur.weapon.id].tier + 1);
      const options = Object.values(WEAPONS).filter(
        (w) =>
          w.cls === cls &&
          w.tier > 0 &&
          (wildcard || (w.tier >= minTier && !w.sidegrade)),
      );
      if (options.length === 0) return;
      const w = pick(this.rng, options);
      const qRoll = this.rng();
      // Quality floors keep the ladder honest: guaranteed slots never lag
      // the night. The wildcard slot still gambles.
      const quality = wildcard
        ? this.wave >= 12 && qRoll < 0.25
          ? "masterwork"
          : this.wave >= 6 && qRoll < 0.5
            ? "fine"
            : "standard"
        : this.wave >= 14
          ? "masterwork"
          : this.wave >= 6
            ? "fine"
            : "standard";
      let priceBase = PRICES.weaponTier[w.tier];
      if (quality === "fine") priceBase *= 1 + PRICES.weaponFinePremium;
      if (quality === "masterwork") priceBase *= 1 + PRICES.weaponMasterworkPremium;
      this.rackStock.push({
        weapon: { id: w.id, quality },
        price: Math.round(priceBase),
      });
    };
    stockFor(this.cfg.playerClass, false);
    stockFor(this.cfg.partnerClass, false);
    stockFor(this.cfg.playerClass, true);
  }

  private restockCaches() {
    for (const cache of this.caches) {
      cache.arrows = 24;
      cache.bandages = 2;
    }
  }

  // Purchase API. The ledger UI, stations, and bots all come through here.
  // Station items check proximity; ledger items require intermission.
  buy(item: string, who: 0 | 1 = 0): boolean {
    const c = this.chars[who];
    const near = (id: StationId, dist = 3): boolean => {
      const buyer = this.chars[0];
      const st = STATIONS.find((s) => s.id === id);
      if (!st) return false;
      return buyer.room === st.room && Math.hypot(st.x - buyer.x, st.y - buyer.y) <= dist;
    };
    const fail = (): false => {
      this.sfx("denied");
      return false;
    };
    const ledgerOk = this.phase === "intermission";
    const [kind, arg, arg2] = item.split(":");

    const priceMult = who === 1 ? PRICES.partnerPriceMult : 1;
    const pay = (base: number): boolean => {
      const p = Math.round(this.price(base) * priceMult);
      if (this.valor < p) return false;
      this.spendValor(p);
      return true;
    };

    switch (kind) {
      case "district": {
        // Districts open via the interact channel; ledger fallback for bots.
        const d = arg as DistrictId;
        if (this.districts[d]) return fail();
        if (d === "hall" && !this.districts.armory && !this.districts.wellcourt) return fail();
        if (d === "undercroft" && !this.districts.hall) return fail();
        if (!pay(PRICES.districtOpen[d])) return fail();
        this.openDistrict(d);
        return true;
      }
      case "repair": {
        if (!ledgerOk) return fail();
        const id = arg as StructureId;
        const s = this.structures[id];
        if (!s || s.tier === 0 || s.hp >= s.maxHp) return fail();
        const missing = s.maxHp - s.hp;
        let per100 = PRICES.barricadeRepairPer100;
        if (this.districts.hall) per100 *= 1 - PRICES.hallRepairDiscount;
        if (!pay((missing / 100) * per100)) return fail();
        s.hp = s.maxHp;
        return true;
      }
      case "stoke": {
        if (!ledgerOk) return fail();
        const s = this.structures.watchfire;
        if (s.hp >= s.maxHp) return fail();
        const missing = s.maxHp - s.hp;
        if (!pay((missing / 100) * PRICES.watchfireStokePer100)) return fail();
        s.hp = s.maxHp;
        return true;
      }
      case "barricade-install": {
        if (!ledgerOk) return fail();
        const id = arg as StructureId;
        const s = this.structures[id];
        if (!s || s.tier !== 0) return fail();
        if (!pay(PRICES.barricadeInstall)) return fail();
        this.structures[id] = { hp: BARRICADE_HP[1], maxHp: BARRICADE_HP[1], tier: 1 };
        return true;
      }
      case "barricade-tier": {
        if (!ledgerOk) return fail();
        const id = arg as StructureId;
        const s = this.structures[id];
        if (!s || s.tier === 0 || s.tier >= 3) return fail();
        if (s.tier === 2 && this.wave < PRICES.barricadeTier3Wave) return fail();
        const cost = s.tier === 1 ? PRICES.barricadeTier2 : PRICES.barricadeTier3;
        if (!pay(cost)) return fail();
        s.tier++;
        s.maxHp = BARRICADE_HP[s.tier];
        s.hp = s.maxHp;
        return true;
      }
      case "upgrade": {
        if (!ledgerOk) return fail();
        const line = arg;
        const def = UPGRADES.find((u) => u.line === line && u.cls === c.cls);
        if (!def) return fail();
        const cur = this.tier(c, line);
        if (cur >= 3) return fail();
        if (!pay(def.prices[cur])) return fail();
        c.tiers[line] = cur + 1;
        if (line === "quiver-line") c.arrows = Math.min(this.quiverMax(c), c.arrows);
        if (line === "traps-line") c.trapCharges = upgradeEffects.trapCharges[cur + 1];
        return true;
      }
      case "rack": {
        if (!near("racks")) return fail();
        const idx = Number(arg);
        const stock = this.rackStock[idx];
        if (!stock) return fail();
        if (WEAPONS[stock.weapon.id].cls !== c.cls) return fail();
        const tradeIn = Math.round(
          PRICES.weaponTier[WEAPONS[c.weapon.id].tier] *
            QUALITY_MULT[c.weapon.quality] *
            PRICES.weaponTradeIn,
        );
        const p = Math.max(0, Math.round(this.price(stock.price) * priceMult) - tradeIn);
        if (this.valor < p) return fail();
        this.spendValor(p);
        c.weapon = stock.weapon;
        this.rackStock.splice(idx, 1);
        if (stock.weapon.quality === "masterwork" && who === 0) this.achieve("well-armed");
        return true;
      }
      case "armor": {
        if (!near("armor-stand")) return fail();
        const a = ARMORS[arg as ArmorId];
        if (!a || !a.wearable.includes(c.cls)) return fail();
        if (!pay(a.price)) return fail();
        c.armor = a.id;
        return true;
      }
      case "bandage": {
        if (!ledgerOk) return fail();
        if (c.bandages >= KIT.maxBandages) return fail();
        if (!pay(PRICES.bandage)) return fail();
        c.bandages++;
        return true;
      }
      case "poultice": {
        if (!near("herb-bed")) return fail();
        if (!pay(PRICES.poultice)) return fail();
        c.poulticeWaves = 2; // this wave and the next
        return true;
      }
      case "meal": {
        if (!near("hearth")) return fail();
        if (c.mealWaves > 0) return fail();
        if (!pay(PRICES.meal)) return fail();
        c.mealWaves = CONSUMABLE_FX.mealWaves;
        c.maxHp += CONSUMABLE_FX.mealMaxHp;
        c.hp += CONSUMABLE_FX.mealMaxHp;
        return true;
      }
      case "whetstone": {
        if (!near("whetstone")) return fail();
        if (!pay(PRICES.whetstone)) return fail();
        c.whetstoneWaves = 2;
        return true;
      }
      case "quiver": {
        if (!ledgerOk && !near("racks")) return fail();
        if (c.cls !== "archer" || c.arrows >= this.quiverMax(c)) return fail();
        if (!pay(PRICES.quiverRefill)) return fail();
        c.arrows = this.quiverMax(c);
        return true;
      }
      case "secondwind": {
        if (!ledgerOk) return fail();
        if (c.secondWind) return fail();
        const p = Math.round(this.price(this.secondWindPrice) * priceMult);
        if (this.valor < p) return fail();
        this.spendValor(p);
        this.secondWindPrice *= 2;
        c.secondWind = true;
        return true;
      }
      default:
        void arg2;
        return fail();
    }
  }

  // ---- run end ------------------------------------------------------------

  private checkEnd() {
    if (this.over) return;
    const anyUp = this.chars.some((c) => c.state === "up");
    if (!anyUp) {
      const p = this.chars[0];
      if (!this.deathRecap) {
        this.deathRecap = `The watch fell in ${this.roomName(p.room)}, wave ${this.wave}.`;
      }
      this.endRun(this.deathRecap);
    }
  }

  endRun(recap: string) {
    if (this.over || this.scoreSubmitted) return;
    this.over = true;
    this.phase = "gameover";
    this.scoreSubmitted = true;
    this.deathRecap = recap;
    if (recap === "The Watchfire fell.") this.sfx("watchfire-fall");
    const p = this.chars[0];
    const q = this.chars[1];
    this.emit({
      type: "gameover",
      score: this.score,
      recap,
      stats: {
        difficulty: this.cfg.difficulty,
        wave: this.wave,
        kills: this.kills,
        headshots: p.headshots + q.headshots,
        damage_dealt: Math.round(p.damageDealt + q.damageDealt),
        damage_blocked: Math.round(p.damageBlocked + q.damageBlocked),
        hp_healed: Math.round(p.healedGiven + q.healedGiven),
        revives: this.revives,
        valor_spent: this.valorSpent,
        valor_recovered: this.valorRecovered,
        districts_opened: Object.values(this.districts).filter(Boolean).length,
        class: p.cls,
        partner_class: q.cls,
      },
    });
  }
}
