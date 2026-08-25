// The Undervault turn engine. Framework free and DOM free: the React shell
// calls playerAct() once per input, then drains the event queue into sfx,
// achievement, and score callbacks. Nothing here reads a clock, so two runs
// from the same seed produce identical stats.

import {
  ARMORS,
  BOSSES,
  FLOORS,
  RELICS,
  STATUSES,
  WEAPONS,
  monsterById,
  portraitById,
  relicById,
  type BossDef,
  type EventCard,
  type FloorDef,
  type GearDef,
  type MonsterDef,
  type PortraitId,
  type RelicDef,
  type RelicId,
  type StatusId,
} from "./content.ts";
import {
  BASE_FOV,
  DOOR,
  FLOOR,
  MAP_H,
  MAP_W,
  STAIRS,
  STEPS,
  WALL,
  computeVisible,
  generateFloor,
  idx,
  lineOfSight,
  makeRng,
  reachable,
  ri,
  stepToward,
  walkable,
  type FloorPlan,
  type Point,
  type Rng,
} from "./dungeon.ts";

export const TUNE = {
  baseHp: 16,
  baseAttack: 3,
  attackSpread: 2, // 0..2 added to every blow
  tonicHeal: 8,
  startTonics: 2,
  maxTonics: 6,
  rangedRange: 4,
  rangedDamage: 1,
  wakeRadius: 6,
  shriekRadius: 7,
  spikeDamage: 2,
  wardSoak: 2, // extra damage the Warded status turns aside
  regenEvery: 14, // turns per 1 HP walking it off
  relicRegenEvery: 8, // turns per 1 HP with the Mandrake Knot
  campRest: 6,
  campGold: 15,
  campTonicChance: 0.2,
  shopTonic: 25,
  shopRelic: 60,
  shopArmor: 40,
  bossSpawnCap: 3,
  engineLineDamage: 4,
  score: {
    kill: 30,
    boss: 200,
    depth: 400,
    gold: 1,
    relic: 150,
    victory: 2000,
  },
  scoreCap: 60000,
  /**
   * vault-legend, calibrated the established way from the six seed ace
   * spread in scripts/harness/the-undervault.mjs. Measured 2026-08-24:
   * the reckless bot tops out at 1,321, the one ace run that died reached
   * 3,975, and the lowest ace victory scored 6,902. Victory alone is worth
   * 2,000, so 6,000 is the round number no scraping run reaches and every
   * clear passes. The harness asserts both sides of that line.
   */
  legendScore: 6000,
} as const;

export type SfxName =
  | "step"
  | "bump"
  | "playerHit"
  | "monsterDie"
  | "bossHit"
  | "bossDie"
  | "pickup"
  | "equip"
  | "tonic"
  | "descend"
  | "trap"
  | "status"
  | "merchant"
  | "death"
  | "victory"
  | "deny";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, string | number> };

export type Phase = "choosing" | "running" | "card" | "dead" | "won";

export type Action =
  | { type: "move"; dx: number; dy: number }
  | { type: "wait" }
  | { type: "tonic" }
  | { type: "pickup" }
  | { type: "descend" }
  | { type: "choose"; index: number };

export type MonsterArt = "idle" | "move" | "hit" | "attack";

export interface Monster {
  def: MonsterDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  awake: boolean;
  beat: number;
  art: MonsterArt;
  /** Set when the queen calls it, so her cap counts only her brood. */
  summoned: boolean;
}

export interface Boss {
  def: BossDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  awake: boolean;
  beat: number;
  art: "idle" | "attack" | "hit";
  /** Colossus wind up, and the engine's charge count. */
  winding: boolean;
  charge: number;
  shielded: boolean;
}

export type ItemKind = "gold" | "tonic" | "weapon" | "armor" | "relic" | "key";

export interface Item {
  kind: ItemKind;
  x: number;
  y: number;
  amount?: number;
  gear?: GearDef;
  relic?: RelicId;
}

export interface Trap {
  kind: "spike" | "snare";
  x: number;
  y: number;
  known: boolean;
}

export type MsgTone = "info" | "good" | "bad" | "gold";

export interface Msg {
  text: string;
  tone: MsgTone;
  turn: number;
}

export interface CardChoice {
  label: string;
  detail: string;
  enabled: boolean;
}

export interface Card {
  kind: EventCard;
  title: string;
  body: string;
  choices: CardChoice[];
}

export interface Status {
  id: StatusId;
  turns: number;
}

export const manhattan = (ax: number, ay: number, bx: number, by: number) =>
  Math.abs(ax - bx) + Math.abs(ay - by);

export class Engine {
  readonly seed: number;
  phase: Phase = "choosing";
  card: Card | null = null;

  depth = 1;
  turn = 0;
  score = 0;

  tiles = new Uint8Array(0);
  visible = new Uint8Array(0);
  seen = new Uint8Array(0);
  plan!: FloorPlan;

  px = 0;
  py = 0;
  hp: number = TUNE.baseHp;
  maxHp: number = TUNE.baseHp;
  fov: number = BASE_FOV;
  dodge = 0;
  portrait: PortraitId | null = null;
  portraitArt = 0;

  weapon: GearDef | null = null;
  armor: GearDef | null = null;
  relics: RelicDef[] = [];
  tonics: number = TUNE.startTonics;
  keys = 0;
  gold = 0;
  kills = 0;
  statuses: Status[] = [];

  monsters: Monster[] = [];
  items: Item[] = [];
  traps: Trap[] = [];
  boss: Boss | null = null;
  fallenBoss: { art: number; x: number; y: number } | null = null;
  /** True on the turn the Buried Engine's line is about to fire. */
  lineWarning = false;
  msgs: Msg[] = [];

  private rng: Rng;
  private events: GameEvent[] = [];
  private achieved = new Set<string>();
  private cardQueue: EventCard[] = [];
  private regenClock = 0;
  private deathSaved = false;
  private shopStock = { tonic: true, relic: true, armor: true };
  private introShown = new Set<string>();

  constructor(seed = 20260824) {
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);
  }

  get floorDef(): FloorDef {
    return FLOORS[Math.min(FLOORS.length - 1, this.depth - 1)];
  }

  get attack(): number {
    const relic = this.hasRelic("sunwheel") ? 1 : 0;
    return TUNE.baseAttack + (this.weapon?.bonus ?? 0) + relic;
  }

  get defense(): number {
    return (this.armor?.bonus ?? 0) + (this.hasRelic("vault-gear") ? 1 : 0);
  }

  hasRelic(id: RelicId): boolean {
    return this.relics.some((r) => r.id === id);
  }

  statusTurns(id: StatusId): number {
    return this.statuses.find((s) => s.id === id)?.turns ?? 0;
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.monsters.find((m) => m.x === x && m.y === y);
  }

  occupied(x: number, y: number): boolean {
    if (this.boss && this.boss.x === x && this.boss.y === y) return true;
    return this.monsterAt(x, y) !== undefined;
  }

  // ---- Input ---------------------------------------------------------

  choosePortrait(id: PortraitId) {
    if (this.phase !== "choosing") return;
    const def = portraitById(id);
    this.portrait = id;
    this.portraitArt = def.art;
    this.maxHp = TUNE.baseHp + def.bonusHp;
    this.hp = this.maxHp;
    this.fov = BASE_FOV + def.bonusFov;
    this.dodge = def.dodge;
    this.tonics = TUNE.startTonics + def.bonusTonics;
    this.phase = "running";
    this.buildFloor();
    this.addScore(TUNE.score.depth);
    this.say(`${def.name} takes the gatehouse stair. ${def.perk}`, "info");
  }

  playerAct(action: Action) {
    if (action.type === "choose") {
      this.resolveCard(action.index);
      return;
    }
    if (this.phase !== "running") return;

    switch (action.type) {
      case "tonic":
        if (!this.drinkTonic()) return;
        break;
      case "pickup":
        if (!this.pickup(this.px, this.py, true)) return;
        break;
      case "descend":
        if (this.tiles[idx(this.px, this.py)] !== STAIRS) {
          this.say("No stair under your boots.", "info");
          this.emit({ type: "sfx", sound: "deny" });
          return;
        }
        if (!this.tryDescend()) return;
        return; // a fresh floor does not owe the old one a turn
      case "wait":
        break;
      case "move":
        if (!this.tryMove(action.dx, action.dy)) return;
        if (this.phase !== "running") return; // descended, died, or a card is up
        break;
    }

    this.worldTurn();
  }

  private tryMove(dx: number, dy: number): boolean {
    const nx = this.px + dx;
    const ny = this.py + dy;
    if (!walkable(this.tiles, nx, ny)) {
      this.emit({ type: "sfx", sound: "bump" });
      return false; // stone costs nothing
    }

    const boss = this.boss;
    if (boss && boss.x === nx && boss.y === ny) {
      this.hitBoss(boss);
      return true;
    }
    const target = this.monsterAt(nx, ny);
    if (target) {
      this.hitMonster(target);
      return true;
    }

    if (this.statusTurns("root") > 0) {
      this.say("Roots hold your boots. You can still swing.", "bad");
      this.emit({ type: "sfx", sound: "deny" });
      return true; // the turn is spent straining against them
    }

    if (this.tiles[idx(nx, ny)] === DOOR) {
      if (this.keys <= 0) {
        this.say("The vault door is locked. Find its key.", "info");
        this.emit({ type: "sfx", sound: "deny" });
        return false;
      }
      this.keys--;
      this.tiles[idx(nx, ny)] = FLOOR;
      this.say("The key turns. The vault door swings in.", "good");
      this.emit({ type: "sfx", sound: "equip" });
      return true;
    }

    this.px = nx;
    this.py = ny;
    this.emit({ type: "sfx", sound: "step" });
    this.springTrap(nx, ny);
    if (this.phase !== "running") return true;
    this.pickup(nx, ny, false);
    if (this.tiles[idx(nx, ny)] === STAIRS) this.tryDescend();
    return true;
  }

  private drinkTonic(): boolean {
    if (this.tonics <= 0) {
      this.say("Your belt is empty.", "info");
      this.emit({ type: "sfx", sound: "deny" });
      return false;
    }
    if (this.hp >= this.maxHp) {
      this.say("You are whole. Keep it.", "info");
      this.emit({ type: "sfx", sound: "deny" });
      return false;
    }
    this.tonics--;
    this.hp = Math.min(this.maxHp, this.hp + TUNE.tonicHeal);
    this.say(`You drink a bitterroot tonic. (+${TUNE.tonicHeal} HP)`, "good");
    this.emit({ type: "sfx", sound: "tonic" });
    return true;
  }

  // ---- The world's half of the turn ------------------------------------

  private worldTurn() {
    this.monstersAct();
    if (this.phase === "running") this.bossAct();
    if (this.phase !== "running") return;

    this.turn++;
    this.tickStatuses();
    if (this.phase !== "running") return;

    this.regenClock++;
    const every = this.hasRelic("mandrake") ? TUNE.relicRegenEvery : TUNE.regenEvery;
    if (this.regenClock >= every) {
      this.regenClock = 0;
      if (this.hp < this.maxHp) this.hp++;
    }
    this.refreshFov();
    this.revealTraps();
    this.maybeBossCard();
  }

  private monstersAct() {
    for (const m of [...this.monsters]) {
      if (this.phase !== "running") return;
      if (!this.monsters.includes(m)) continue;
      if (m.def.traits.includes("slow") && this.turn % 2 === 1) continue;

      if (!m.awake) {
        const near = manhattan(m.x, m.y, this.px, this.py) <= TUNE.wakeRadius;
        if (near && lineOfSight(this.tiles, m.x, m.y, this.px, this.py)) m.awake = true;
        else continue;
      }

      const acts = m.def.traits.includes("fast") ? 2 : 1;
      for (let i = 0; i < acts; i++) {
        if (this.phase !== "running") return;
        this.monsterTurn(m);
      }
    }
  }

  private monsterTurn(m: Monster) {
    m.beat++;
    const dist = manhattan(m.x, m.y, this.px, this.py);

    if (m.def.traits.includes("shriek") && m.beat % 3 === 0) {
      m.art = "attack";
      let woken = 0;
      for (const other of this.monsters) {
        if (other === m || other.awake) continue;
        if (manhattan(other.x, other.y, m.x, m.y) > TUNE.shriekRadius) continue;
        other.awake = true;
        woken++;
      }
      if (woken > 0) {
        this.say(`The ${m.def.name} shrieks. ${woken} more stir.`, "bad");
        this.emit({ type: "sfx", sound: "status" });
      }
      return;
    }

    if (dist === 1) {
      m.art = "attack";
      this.hurtPlayer(m.def.damage, m.def.name);
      if (this.phase !== "running") return;
      if (m.def.traits.includes("venom")) this.applyStatus("poison");
      if (m.def.traits.includes("burning")) this.applyStatus("burn");
      return;
    }

    if (
      m.def.traits.includes("ranged") &&
      dist <= TUNE.rangedRange &&
      lineOfSight(this.tiles, m.x, m.y, this.px, this.py)
    ) {
      m.art = "attack";
      this.hurtPlayer(TUNE.rangedDamage, m.def.name);
      return;
    }

    const next = stepToward(
      this.tiles,
      { x: m.x, y: m.y },
      { x: this.px, y: this.py },
      (x, y) => this.occupied(x, y) || (x === this.px && y === this.py),
    );
    if (next) {
      m.x = next.x;
      m.y = next.y;
      m.art = "move";
    } else {
      m.art = "idle";
    }
  }

  private bossAct() {
    const boss = this.boss;
    if (!boss) return;
    if (!boss.awake) {
      if (
        manhattan(boss.x, boss.y, this.px, this.py) <= TUNE.wakeRadius &&
        lineOfSight(this.tiles, boss.x, boss.y, this.px, this.py)
      ) {
        boss.awake = true;
      } else {
        return;
      }
    }

    boss.beat++;
    boss.art = "idle";
    this.lineWarning = false;
    const dist = manhattan(boss.x, boss.y, this.px, this.py);

    switch (boss.def.gimmick) {
      case "shield":
        boss.shielded = boss.beat % boss.def.period === 1;
        break;
      case "spawn":
        if (boss.beat % boss.def.period === 0 && this.broodCount() < TUNE.bossSpawnCap) {
          if (this.spawnBrood(boss)) {
            boss.art = "attack";
            this.say("The queen splits an egg sac. A sewer beetle drops free.", "bad");
            this.emit({ type: "sfx", sound: "status" });
            return;
          }
        }
        break;
      case "root":
        if (boss.beat % boss.def.period === 0 && lineOfSight(this.tiles, boss.x, boss.y, this.px, this.py)) {
          boss.art = "attack";
          this.applyStatus("root");
          this.say("The judge raises a hand. Roots close on your boots.", "bad");
          return;
        }
        break;
      case "line": {
        boss.charge++;
        if (boss.charge < boss.def.period) {
          this.lineWarning = boss.charge === boss.def.period - 1;
          boss.art = "attack";
          this.say(
            boss.charge === 1
              ? "The engine draws breath. Its bore glows."
              : "The bore is white. Step off the line.",
            "bad",
          );
          return;
        }
        boss.charge = 0;
        boss.art = "attack";
        const onLine =
          (this.px === boss.x || this.py === boss.y) &&
          lineOfSight(this.tiles, boss.x, boss.y, this.px, this.py);
        if (onLine) {
          this.say("The engine fires down the line.", "bad");
          this.hurtPlayer(TUNE.engineLineDamage, boss.def.name, true);
        } else {
          this.say("The bolt tears past. You stepped off in time.", "good");
        }
        return;
      }
      case "telegraph":
        if (boss.winding) {
          boss.winding = false;
          boss.art = "attack";
          if (dist === 1) {
            this.hurtPlayer(boss.def.damage, boss.def.name);
          } else {
            this.say("The bell swings through empty air.", "good");
          }
          return;
        }
        if (dist === 1) {
          boss.winding = true;
          boss.art = "attack";
          this.say("The colossus hauls the bell back. One turn to move.", "bad");
          return;
        }
        break;
    }

    if (dist === 1) {
      boss.art = "attack";
      this.hurtPlayer(boss.def.damage, boss.def.name);
      return;
    }

    const next = stepToward(
      this.tiles,
      { x: boss.x, y: boss.y },
      { x: this.px, y: this.py },
      (x, y) => this.occupied(x, y) || (x === this.px && y === this.py),
    );
    if (next) {
      boss.x = next.x;
      boss.y = next.y;
    }
  }

  private broodCount(): number {
    return this.monsters.filter((m) => m.summoned).length;
  }

  private spawnBrood(boss: Boss): boolean {
    const def = monsterById("sewer-beetle");
    for (const [dx, dy] of STEPS) {
      const x = boss.x + dx;
      const y = boss.y + dy;
      if (!walkable(this.tiles, x, y)) continue;
      if (this.occupied(x, y) || (x === this.px && y === this.py)) continue;
      this.monsters.push({
        def,
        x,
        y,
        hp: def.hp,
        maxHp: def.hp,
        awake: true,
        beat: 0,
        art: "idle",
        summoned: true,
      });
      return true;
    }
    return false;
  }

  // ---- Damage ----------------------------------------------------------

  private hitMonster(m: Monster) {
    const raw = this.attack + ri(this.rng, 0, TUNE.attackSpread);
    const dmg = Math.max(1, raw - (m.def.traits.includes("armored") ? 1 : 0));
    m.hp -= dmg;
    m.art = "hit";
    m.awake = true;
    if (m.hp > 0) {
      this.say(`You strike the ${m.def.name}. (${dmg})`, "info");
      this.emit({ type: "sfx", sound: "bump" });
      return;
    }
    this.monsters = this.monsters.filter((o) => o !== m);
    this.kills++;
    this.addScore(TUNE.score.kill);
    this.say(`The ${m.def.name} falls.`, "good");
    this.emit({ type: "sfx", sound: "monsterDie" });
    if (this.kills >= 20) this.achieve("monster-breaker");
  }

  private hitBoss(boss: Boss) {
    const raw = this.attack + ri(this.rng, 0, TUNE.attackSpread);
    boss.awake = true;
    if (boss.shielded) {
      boss.art = "hit";
      this.say(`The ${boss.def.name} shuts its plate. Nothing lands.`, "bad");
      this.emit({ type: "sfx", sound: "deny" });
      return;
    }
    const dmg = Math.max(1, raw - (boss.def.gimmick === "shield" ? 1 : 0));
    boss.hp -= dmg;
    boss.art = "hit";
    if (boss.hp > 0) {
      this.say(`You strike the ${boss.def.name}. (${dmg})`, "info");
      this.emit({ type: "sfx", sound: "bossHit" });
      return;
    }
    this.fellBoss(boss);
  }

  private fellBoss(boss: Boss) {
    this.boss = null;
    this.fallenBoss = { art: boss.def.art, x: boss.x, y: boss.y };
    this.monsters = this.monsters.filter((m) => !m.summoned);
    this.kills++;
    this.addScore(TUNE.score.boss);
    this.say(`The ${boss.def.name} comes apart. The stair unlocks.`, "good");
    this.emit({ type: "sfx", sound: "bossDie" });
    if (this.kills >= 20) this.achieve("monster-breaker");
    if (boss.def.id === "obsidian-spider-queen") this.achieve("ossuary");
    if (boss.def.id === "buried-engine") this.win();
  }

  private hurtPlayer(amount: number, source: string, unavoidable = false) {
    if (!unavoidable && this.dodge > 0 && this.rng() < this.dodge) {
      this.say(`You slip the ${source}'s blow.`, "good");
      return;
    }
    const ward = this.statusTurns("shield") > 0 ? TUNE.wardSoak : 0;
    const dmg = Math.max(1, amount - this.defense - ward);
    this.hp -= dmg;
    this.say(`The ${source} hits you. (-${dmg})`, "bad");
    this.emit({ type: "sfx", sound: "playerHit" });
    if (this.hp <= 0) this.die(source);
  }

  private applyStatus(id: StatusId) {
    if (id === "poison" && this.hasRelic("bone-flute")) return;
    if (id === "burn" && this.hasRelic("cinder-cap")) return;
    const def = STATUSES[id];
    const existing = this.statuses.find((s) => s.id === id);
    if (existing) existing.turns = def.turns;
    else this.statuses.push({ id, turns: def.turns });
    this.say(`${def.name}.`, "bad");
    this.emit({ type: "sfx", sound: "status" });
  }

  private tickStatuses() {
    for (const status of [...this.statuses]) {
      const def = STATUSES[status.id];
      if (def.tick > 0) {
        this.hp -= def.tick;
        if (this.hp <= 0) {
          this.die(status.id);
          return;
        }
      } else if (def.tick < 0) {
        this.hp = Math.min(this.maxHp, this.hp - def.tick);
      }
      status.turns--;
    }
    this.statuses = this.statuses.filter((s) => s.turns > 0);
  }

  private die(source: string) {
    if (this.hasRelic("spiral-ward") && !this.deathSaved) {
      this.deathSaved = true;
      this.hp = 1;
      this.statuses = [];
      this.applyStatus("shield");
      this.say("The Spiral Ward burns out and leaves you standing at 1 HP.", "good");
      return;
    }
    this.hp = 0;
    this.phase = "dead";
    this.boss = null;
    this.emit({ type: "sfx", sound: "death" });
    this.card = {
      kind: "death",
      title: "The vault keeps you",
      body: `The ${source} finishes you on ${this.floorDef.name}. Depth ${this.depth}, ${this.kills} kills, ${this.gold} gold.`,
      choices: [],
    };
    this.finish();
  }

  private win() {
    this.phase = "won";
    this.addScore(TUNE.score.victory);
    this.emit({ type: "sfx", sound: "victory" });
    this.achieve("boss-breaker");
    this.card = {
      kind: "victory",
      title: "The mechanism stops",
      body: `You walk out of the Deep Mechanism with ${this.gold} gold and ${this.relics.length} relics. ${this.kills} things fell on the way down.`,
      choices: [],
    };
    this.finish();
  }

  private finish() {
    this.addScore(this.gold * TUNE.score.gold);
    this.addScore(this.relics.length * TUNE.score.relic);
    if (this.score >= TUNE.legendScore) this.achieve("vault-legend");
    this.emit({
      type: "gameover",
      score: this.score,
      stats: {
        depth: this.depth,
        kills: this.kills,
        gold: this.gold,
        relics: this.relics.length,
        turns: this.turn,
      },
    });
  }

  // ---- Floors ----------------------------------------------------------

  private buildFloor() {
    const def = this.floorDef;
    const plan = generateFloor(this.rng, def.vault);
    this.plan = plan;
    this.tiles = plan.tiles;
    this.px = plan.start.x;
    this.py = plan.start.y;
    this.seen = new Uint8Array(MAP_W * MAP_H);
    this.monsters = [];
    this.items = [];
    this.traps = [];
    this.fallenBoss = null;
    this.lineWarning = false;

    const open = reachable(this.tiles, plan.start);
    const inVault = (x: number, y: number) =>
      plan.vault !== null &&
      x >= plan.vault.x &&
      x < plan.vault.x + plan.vault.w &&
      y >= plan.vault.y &&
      y < plan.vault.y + plan.vault.h;

    const free = (x: number, y: number) =>
      open[idx(x, y)] === 1 &&
      this.tiles[idx(x, y)] === FLOOR &&
      !(x === this.px && y === this.py) &&
      !this.occupied(x, y) &&
      !this.items.some((i) => i.x === x && i.y === y) &&
      !this.traps.some((t) => t.x === x && t.y === y);

    const spot = (test?: (x: number, y: number) => boolean): Point | null => {
      for (let tries = 0; tries < 600; tries++) {
        const x = ri(this.rng, 1, MAP_W - 2);
        const y = ri(this.rng, 1, MAP_H - 2);
        if (free(x, y) && (!test || test(x, y))) return { x, y };
      }
      return null;
    };

    const outsideVault = (x: number, y: number) => !inVault(x, y);
    const away = (x: number, y: number) => manhattan(x, y, this.px, this.py) > 6 && outsideVault(x, y);

    // Everything a locked floor needs before the door opens has to sit in
    // the half of the map you can walk without a key.
    const dry = plan.door ? this.dryReachable(plan.start) : null;
    const beforeTheDoor = (x: number, y: number) => !dry || dry[idx(x, y)] === 1;

    if (plan.door) {
      const keyAt = spot(beforeTheDoor);
      if (keyAt) this.items.push({ kind: "key", x: keyAt.x, y: keyAt.y });
      else this.tiles[idx(plan.door.x, plan.door.y)] = FLOOR; // no key fits, so no lock
    }

    const bossDef = BOSSES.find((b) => b.id === def.boss)!;
    const bossSpot = this.bossStand(plan);
    this.boss = {
      def: bossDef,
      x: bossSpot.x,
      y: bossSpot.y,
      hp: bossDef.hp,
      maxHp: bossDef.hp,
      awake: false,
      beat: 0,
      art: "idle",
      winding: false,
      charge: 0,
      shielded: false,
    };

    const families = def.monsters.map(monsterById);
    for (let i = 0; i < def.monsterCount; i++) {
      const family = families[ri(this.rng, 0, families.length - 1)];
      const at = spot(away);
      if (!at) break;
      this.monsters.push({
        def: family,
        x: at.x,
        y: at.y,
        hp: family.hp,
        maxHp: family.hp,
        awake: false,
        beat: 0,
        art: "idle",
        summoned: false,
      });
    }

    const drop = (item: Omit<Item, "x" | "y">, test?: (x: number, y: number) => boolean) => {
      const at = spot(test);
      if (at) this.items.push({ ...item, x: at.x, y: at.y });
    };

    for (let i = 0; i < def.goldPiles; i++) {
      drop({ kind: "gold", amount: ri(this.rng, 10, 22) + this.depth * 4 }, outsideVault);
    }
    for (let i = 0; i < def.tonics; i++) drop({ kind: "tonic" }, outsideVault);

    // One of each every floor. A run that never finds gear is not a run.
    const tier = Math.min(WEAPONS.length - 1, this.depth - 1);
    drop({ kind: "weapon", gear: WEAPONS[tier] }, outsideVault);
    const armorTier = Math.min(ARMORS.length - 1, Math.floor((this.depth - 1) / 1.5));
    drop({ kind: "armor", gear: ARMORS[armorTier] }, outsideVault);

    // The vault holds a relic and the door's key lies in the open.
    for (let i = 0; i < def.relics; i++) {
      const relic = this.rollRelic();
      if (!relic) break;
      if (plan.vault) drop({ kind: "relic", relic }, inVault);
      else drop({ kind: "relic", relic }, outsideVault);
    }

    for (let i = 0; i < def.traps; i++) {
      const at = spot(away);
      if (!at) break;
      this.traps.push({ kind: this.rng() < 0.55 ? "spike" : "snare", x: at.x, y: at.y, known: false });
    }

    this.refreshFov();
    this.revealTraps();
  }

  /** Cells walkable without a key, which is where the key itself must lie. */
  private dryReachable(from: Point): Uint8Array {
    const locked = Uint8Array.from(this.tiles);
    for (let i = 0; i < locked.length; i++) {
      if (locked[i] === DOOR) locked[i] = WALL;
    }
    return reachable(locked, from);
  }

  /** The boss stands beside its stair, never on it. */
  private bossStand(plan: FloorPlan): Point {
    for (const [dx, dy] of STEPS) {
      const x = plan.stairs.x + dx;
      const y = plan.stairs.y + dy;
      if (walkable(this.tiles, x, y) && this.tiles[idx(x, y)] === FLOOR) return { x, y };
    }
    return { x: plan.stairs.x, y: plan.stairs.y };
  }

  private rollRelic(): RelicId | null {
    const held = new Set(this.relics.map((r) => r.id));
    const open = RELICS.filter((r) => !held.has(r.id));
    if (open.length === 0) return null;
    return open[ri(this.rng, 0, open.length - 1)].id;
  }

  private tryDescend(): boolean {
    if (this.boss) {
      this.say("The stair is sealed while its keeper stands.", "info");
      this.emit({ type: "sfx", sound: "deny" });
      return false;
    }
    if (this.depth >= FLOORS.length) {
      this.say("Nothing below but the mechanism you already stopped.", "info");
      return false;
    }
    this.depth++;
    this.addScore(TUNE.score.depth);
    this.emit({ type: "sfx", sound: "descend" });
    if (this.depth >= 2) this.achieve("first-descent");
    if (this.depth >= 5) this.achieve("deep-mechanism");
    this.buildFloor();
    this.shopStock = { tonic: true, relic: true, armor: true };
    this.cardQueue = ["descent", "camp"];
    if (this.floorDef.merchant) this.cardQueue.push("merchant");
    this.nextCard();
    return true;
  }

  // ---- Items -----------------------------------------------------------

  private pickup(x: number, y: number, deliberate: boolean): boolean {
    const item = this.items.find((i) => i.x === x && i.y === y);
    if (!item) {
      if (deliberate) {
        this.say("Nothing here worth bending for.", "info");
        this.emit({ type: "sfx", sound: "deny" });
      }
      return false;
    }

    switch (item.kind) {
      case "gold": {
        const base = item.amount ?? 0;
        const amount = this.hasRelic("coin-bell") ? Math.round(base * 1.5) : base;
        this.gold += amount;
        this.say(`You pocket ${amount} gold.`, "gold");
        this.emit({ type: "sfx", sound: "pickup" });
        break;
      }
      case "tonic":
        if (this.tonics >= TUNE.maxTonics) {
          if (deliberate) this.say("Your belt will not hold another tonic.", "info");
          return false;
        }
        this.tonics++;
        this.say("A bitterroot tonic goes on your belt.", "good");
        this.emit({ type: "sfx", sound: "pickup" });
        break;
      case "key":
        this.keys++;
        this.say("A vault key, still warm.", "good");
        this.emit({ type: "sfx", sound: "pickup" });
        break;
      case "relic": {
        const def = relicById(item.relic!);
        this.relics.push(def);
        this.say(`${def.name}. ${def.effect}`, "gold");
        this.emit({ type: "sfx", sound: "equip" });
        if (this.relics.length >= 3) this.achieve("relic-bearer");
        break;
      }
      case "weapon": {
        const gear = item.gear!;
        if (gear.bonus <= (this.weapon?.bonus ?? 0)) {
          if (deliberate) this.say(`A ${gear.name}. Yours bites harder.`, "info");
          return false;
        }
        this.weapon = gear;
        this.say(`You take up the ${gear.name}. (+${gear.bonus} ATK)`, "good");
        this.emit({ type: "sfx", sound: "equip" });
        break;
      }
      case "armor": {
        const gear = item.gear!;
        if (gear.bonus <= (this.armor?.bonus ?? 0)) {
          if (deliberate) this.say(`A ${gear.name}. Yours holds better.`, "info");
          return false;
        }
        this.armor = gear;
        this.say(`You strap on the ${gear.name}. (+${gear.bonus} DEF)`, "good");
        this.emit({ type: "sfx", sound: "equip" });
        break;
      }
    }
    this.items = this.items.filter((i) => i !== item);
    return true;
  }

  private springTrap(x: number, y: number) {
    const trap = this.traps.find((t) => t.x === x && t.y === y);
    if (!trap) return;
    this.traps = this.traps.filter((t) => t !== trap);
    this.emit({ type: "sfx", sound: "trap" });
    if (trap.kind === "spike") {
      this.say("Spikes come up through the flagstone.", "bad");
      this.hurtPlayer(TUNE.spikeDamage, "spike trap", true);
    } else {
      this.say("A snare whips around your ankles.", "bad");
      this.applyStatus("root");
    }
  }

  private revealTraps() {
    if (!this.hasRelic("delvers-map")) return;
    for (const trap of this.traps) {
      if (manhattan(trap.x, trap.y, this.px, this.py) <= 1) trap.known = true;
    }
  }

  // ---- Cards -----------------------------------------------------------

  private nextCard() {
    const kind = this.cardQueue.shift();
    if (!kind) {
      if (this.phase === "card") this.phase = "running";
      this.card = null;
      return;
    }
    this.phase = "card";
    this.card = this.buildCard(kind);
  }

  private buildCard(kind: EventCard): Card {
    const def = this.floorDef;
    switch (kind) {
      case "descent":
        return {
          kind,
          title: def.name,
          body: `${def.blurb} Depth ${this.depth} of ${FLOORS.length}.`,
          choices: [{ label: "Go down", detail: "", enabled: true }],
        };
      case "camp":
        return {
          kind,
          title: "A dry corner",
          body: "You have one watch before the noise starts again.",
          choices: [
            {
              label: "Rest",
              detail: `Recover ${TUNE.campRest} HP, then mend 1 a turn for a while.`,
              enabled: true,
            },
            {
              label: "Scavenge",
              detail: `${TUNE.campGold} gold, and one time in five a tonic.`,
              enabled: true,
            },
          ],
        };
      case "merchant":
        return {
          kind,
          title: "The lamplit merchant",
          body: `He counts your purse before he looks at your face. You carry ${this.gold} gold.`,
          choices: [
            {
              label: `Tonic · ${TUNE.shopTonic}g`,
              detail: "One bitterroot tonic.",
              enabled: this.shopStock.tonic && this.gold >= TUNE.shopTonic && this.tonics < TUNE.maxTonics,
            },
            {
              label: `Relic · ${TUNE.shopRelic}g`,
              detail: "Whatever the vault gave him.",
              enabled: this.shopStock.relic && this.gold >= TUNE.shopRelic && this.rollRelic() !== null,
            },
            {
              label: `Armour · ${TUNE.shopArmor}g`,
              detail: "One step up from what you wear.",
              enabled:
                this.shopStock.armor &&
                this.gold >= TUNE.shopArmor &&
                (this.armor?.bonus ?? 0) < ARMORS[ARMORS.length - 1].bonus,
            },
            { label: "Walk on", detail: "", enabled: true },
          ],
        };
      case "boss": {
        const boss = this.boss!;
        return {
          kind,
          title: boss.def.name,
          body: boss.def.intro,
          choices: [{ label: "Face it", detail: "", enabled: true }],
        };
      }
      default:
        return { kind, title: "", body: "", choices: [] };
    }
  }

  private resolveCard(index: number) {
    const card = this.card;
    if (!card || this.phase !== "card") return;

    if (card.kind === "camp") {
      if (index === 0) {
        this.hp = Math.min(this.maxHp, this.hp + TUNE.campRest);
        this.applyStatus("regen");
        this.say(`You sleep badly and wake stronger. (+${TUNE.campRest} HP)`, "good");
        this.emit({ type: "sfx", sound: "tonic" });
      } else {
        this.gold += TUNE.campGold;
        this.say(`You turn out the corner for ${TUNE.campGold} gold.`, "gold");
        if (this.rng() < TUNE.campTonicChance && this.tonics < TUNE.maxTonics) {
          this.tonics++;
          this.say("A tonic, unbroken, under the rubble.", "good");
        }
        this.emit({ type: "sfx", sound: "pickup" });
      }
    } else if (card.kind === "merchant") {
      const choice = card.choices[index];
      if (choice && choice.enabled) {
        if (index === 0) {
          this.gold -= TUNE.shopTonic;
          this.tonics++;
          this.shopStock.tonic = false;
          this.say("He slides a tonic across the crate.", "good");
        } else if (index === 1) {
          const relic = this.rollRelic();
          if (relic) {
            this.gold -= TUNE.shopRelic;
            const def = relicById(relic);
            this.relics.push(def);
            this.shopStock.relic = false;
            this.say(`${def.name}. ${def.effect}`, "gold");
            if (this.relics.length >= 3) this.achieve("relic-bearer");
          }
        } else if (index === 2) {
          const next = ARMORS.find((a) => a.bonus > (this.armor?.bonus ?? 0));
          if (next) {
            this.gold -= TUNE.shopArmor;
            this.armor = next;
            this.shopStock.armor = false;
            this.say(`You buy the ${next.name}. (+${next.bonus} DEF)`, "good");
          }
        }
        this.emit({ type: "sfx", sound: "merchant" });
        if (index < 3) {
          // Stay at the crate so a second purchase is possible.
          this.card = this.buildCard("merchant");
          return;
        }
      } else if (index < 3) {
        this.emit({ type: "sfx", sound: "deny" });
        return;
      }
    }

    this.nextCard();
  }

  private maybeBossCard() {
    const boss = this.boss;
    if (!boss || this.introShown.has(boss.def.id)) return;
    if (this.visible[idx(boss.x, boss.y)] !== 1) return;
    this.introShown.add(boss.def.id);
    this.cardQueue.push("boss");
    this.nextCard();
  }

  // ---- Plumbing --------------------------------------------------------

  private refreshFov() {
    this.visible = computeVisible(this.tiles, this.px, this.py, this.fov);
    for (let i = 0; i < this.visible.length; i++) {
      if (this.visible[i]) this.seen[i] = 1;
    }
  }

  private addScore(amount: number) {
    this.score = Math.min(TUNE.scoreCap, this.score + amount);
  }

  private say(text: string, tone: MsgTone) {
    this.msgs.push({ text, tone, turn: this.turn });
    if (this.msgs.length > 40) this.msgs.splice(0, this.msgs.length - 40);
  }

  private achieve(slug: string) {
    if (this.achieved.has(slug)) return;
    this.achieved.add(slug);
    this.emit({ type: "achievement", slug });
  }

  private emit(event: GameEvent) {
    this.events.push(event);
  }
}
