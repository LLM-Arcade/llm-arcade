// Rune & Ruin — turn-based roguelike engine. Framework-free: the React
// shell calls playerAct() per input and drains the event queue after each
// turn (sfx / achievements / gameover → onScore).

import { ARMORS, BESTIARY, WEAPONS, type GearDef, type MonsterDef } from "./content";
import {
  FLOOR,
  MAP_H,
  MAP_W,
  STAIRS,
  WALL,
  computeVisible,
  generateFloor,
  idx,
  lineOfSight,
} from "./dungeon";

export type SfxName =
  | "hit"
  | "hurt"
  | "kill"
  | "gold"
  | "rune"
  | "tonic"
  | "quaff"
  | "gear"
  | "stairs"
  | "levelup"
  | "death"
  | "denied";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "achievement"; slug: string }
  | { type: "gameover"; score: number; stats: Record<string, string | number> };

export type Phase = "running" | "dead";

export type Action = { type: "move"; dx: number; dy: number } | { type: "wait" } | { type: "quaff" };

export interface Monster {
  def: MonsterDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  awake: boolean;
}

export type ItemKind = "gold" | "rune" | "tonic" | "weapon" | "armor";

export interface Item {
  kind: ItemKind;
  x: number;
  y: number;
  amount?: number; // gold
  gear?: GearDef; // weapon / armor
}

export type MsgTone = "info" | "good" | "bad" | "gold";

export interface Msg {
  text: string;
  tone: MsgTone;
  turn: number;
}

// ---- Tuning ----------------------------------------------------------
const BASE_HP = 20;
const BASE_ATK = 2;
const REGEN_EVERY = 10; // turns per 1 HP
const TONIC_HEAL = 10;
const XP_BASE = 10; // xp for level 2; +70% per level after
const WAKE_RADIUS2 = 64; // monsters notice you within 8 tiles + LOS
const SCORE_CAP = 200000;

const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

export class Engine {
  phase: Phase = "running";
  depth = 1;
  turn = 0;
  score = 0;

  tiles = new Uint8Array(0);
  visible = new Uint8Array(0);
  seen = new Uint8Array(0);

  px = 0;
  py = 0;
  hp = BASE_HP;
  maxHp = BASE_HP;
  level = 1;
  xp = 0;
  xpNext = XP_BASE;
  weapon: GearDef | null = null;
  armor: GearDef | null = null;
  tonics = 1;
  gold = 0;
  runes = 0;
  kills = 0;
  lastHurtTurn = -99;

  monsters: Monster[] = [];
  items: Item[] = [];
  msgs: Msg[] = [];

  private events: GameEvent[] = [];
  private achieved = new Set<string>();
  private regenClock = 0;

  constructor() {
    this.buildFloor();
    this.say("You descend into the ruin. The door grinds shut above.", "info");
  }

  get atk(): number {
    return BASE_ATK + Math.floor((this.level - 1) / 2) + (this.weapon?.bonus ?? 0);
  }

  get def(): number {
    return this.armor?.bonus ?? 0;
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  playerAct(action: Action) {
    if (this.phase !== "running") return;

    if (action.type === "quaff") {
      if (this.tonics <= 0) {
        this.say("Your belt is out of tonics.", "info");
        this.emit({ type: "sfx", sound: "denied" });
        return;
      }
      if (this.hp >= this.maxHp) {
        this.say("You're already hale — save it.", "info");
        this.emit({ type: "sfx", sound: "denied" });
        return;
      }
      this.tonics--;
      this.hp = Math.min(this.maxHp, this.hp + TONIC_HEAL);
      this.say(`You quaff a bitterroot tonic. (+${TONIC_HEAL} HP)`, "good");
      this.emit({ type: "sfx", sound: "quaff" });
    } else if (action.type === "move") {
      const nx = this.px + action.dx;
      const ny = this.py + action.dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;

      const target = this.monsterAt(nx, ny);
      if (target) {
        this.attackMonster(target);
      } else if (this.tiles[idx(nx, ny)] === WALL) {
        return; // bumping stone costs nothing
      } else {
        this.px = nx;
        this.py = ny;
        this.pickup(nx, ny);
        if (this.tiles[idx(nx, ny)] === STAIRS) {
          this.descend();
          return; // fresh floor — the ruin doesn't get a turn
        }
      }
    }
    // action.type === "wait" falls through — the world takes its turn

    this.monstersAct();
    if (this.phase !== "running") return;

    this.turn++;
    this.regenClock++;
    if (this.regenClock >= REGEN_EVERY) {
      this.regenClock = 0;
      if (this.hp < this.maxHp) this.hp++;
    }
    this.refreshFov();
  }

  // ---- Floors ----------------------------------------------------------

  private buildFloor() {
    const plan = generateFloor();
    this.tiles = plan.tiles;
    this.px = plan.start.x;
    this.py = plan.start.y;
    this.seen = new Uint8Array(MAP_W * MAP_H);
    this.monsters = [];
    this.items = [];

    const free = (x: number, y: number) =>
      this.tiles[idx(x, y)] === FLOOR &&
      !(x === this.px && y === this.py) &&
      !this.monsterAt(x, y) &&
      !this.items.some((i) => i.x === x && i.y === y);

    const placeAt = (pred?: (x: number, y: number) => boolean) => {
      for (let tries = 0; tries < 400; tries++) {
        const x = ri(1, MAP_W - 2);
        const y = ri(1, MAP_H - 2);
        if (free(x, y) && (!pred || pred(x, y))) return { x, y };
      }
      return null;
    };

    // Monsters — never right on top of the entrance
    const eligible = BESTIARY.filter((b) => this.depth >= b.minDepth && this.depth <= b.maxDepth);
    const count = Math.min(4 + this.depth, 14);
    for (let i = 0; i < count; i++) {
      const def = eligible[ri(0, eligible.length - 1)];
      const spot = placeAt((x, y) => Math.abs(x - this.px) + Math.abs(y - this.py) > 7);
      if (!spot) break;
      const hp = def.hp + Math.min(6, Math.max(0, this.depth - def.minDepth));
      this.monsters.push({ def, x: spot.x, y: spot.y, hp, maxHp: hp, awake: false });
    }

    // Loot
    const drop = (item: Omit<Item, "x" | "y">) => {
      const spot = placeAt();
      if (spot) this.items.push({ ...item, x: spot.x, y: spot.y });
    };
    const goldPiles = ri(3, 5);
    for (let i = 0; i < goldPiles; i++) drop({ kind: "gold", amount: ri(8, 20) + this.depth * 3 });
    const tonics = ri(1, 2);
    for (let i = 0; i < tonics; i++) drop({ kind: "tonic" });
    const runes = 1 + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < runes; i++) drop({ kind: "rune" });
    const tier = () => Math.floor((this.depth - 1) / 2) + (Math.random() < 0.3 ? 1 : 0);
    if (Math.random() < 0.5) drop({ kind: "weapon", gear: WEAPONS[Math.min(WEAPONS.length - 1, tier())] });
    if (Math.random() < 0.5) drop({ kind: "armor", gear: ARMORS[Math.min(ARMORS.length - 1, tier())] });

    this.refreshFov();
  }

  private descend() {
    this.depth++;
    this.score += 100 + this.depth * 50;
    this.emit({ type: "sfx", sound: "stairs" });
    if (this.depth >= 3) this.achieve("delver");
    if (this.depth >= 6) this.achieve("deep-delver");
    if (this.depth >= 10) this.achieve("abyss-walker");
    this.buildFloor();
    this.say(`You descend. Floor ${this.depth}.`, "good");
  }

  // ---- Combat ----------------------------------------------------------

  private attackMonster(m: Monster) {
    const dmg = Math.max(1, this.atk + ri(0, 2) - m.def.def);
    m.hp -= dmg;
    if (m.hp <= 0) {
      this.monsters = this.monsters.filter((o) => o !== m);
      this.kills++;
      this.score += m.def.xp * 3;
      this.say(`The ${m.def.name} falls. (+${m.def.xp} XP)`, "good");
      this.emit({ type: "sfx", sound: "kill" });
      if (this.kills === 1) this.achieve("first-blood");
      if (this.kills >= 25) this.achieve("slayer");
      if (m.def.id === "golem") this.achieve("golem-breaker");
      this.gainXp(m.def.xp);
    } else {
      this.say(`You hit the ${m.def.name}. (${dmg})`, "info");
      this.emit({ type: "sfx", sound: "hit" });
    }
  }

  private attackPlayer(m: Monster) {
    const dmg = Math.max(1, m.def.atk + ri(0, 2) - this.def);
    this.hp -= dmg;
    this.lastHurtTurn = this.turn;
    this.say(`The ${m.def.name} hits you. (−${dmg})`, "bad");
    this.emit({ type: "sfx", sound: "hurt" });
    if (this.hp <= 0) this.die(m);
  }

  private die(killer: Monster) {
    this.hp = 0;
    this.phase = "dead";
    this.say(`The ${killer.def.name} finishes you on floor ${this.depth}.`, "bad");
    this.emit({ type: "sfx", sound: "death" });
    this.emit({
      type: "gameover",
      score: Math.min(this.score, SCORE_CAP),
      stats: {
        floor: this.depth,
        kills: this.kills,
        gold: this.gold,
        runes: this.runes,
        level: this.level,
        turns: this.turn,
        slain_by: killer.def.name,
      },
    });
  }

  private gainXp(amount: number) {
    this.xp += amount;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.xpNext = Math.round(this.xpNext * 1.7);
      this.level++;
      this.maxHp += 4;
      this.hp = Math.min(this.maxHp, this.hp + 4);
      const atkUp = this.level % 2 === 1;
      this.say(`Welcome to level ${this.level}.${atkUp ? " Your arm steadies. (+1 ATK)" : ""}`, "good");
      this.emit({ type: "sfx", sound: "levelup" });
    }
  }

  // ---- Items -----------------------------------------------------------

  private pickup(x: number, y: number) {
    const item = this.items.find((i) => i.x === x && i.y === y);
    if (!item) return;

    switch (item.kind) {
      case "gold": {
        const amt = item.amount ?? 0;
        this.gold += amt;
        this.score += amt;
        this.say(`You scoop up ${amt} gold.`, "gold");
        this.emit({ type: "sfx", sound: "gold" });
        if (this.gold >= 400) this.achieve("hoarder");
        break;
      }
      case "rune":
        this.runes++;
        this.score += 150;
        this.say("You pry a warm rune from the stone. (+150)", "gold");
        this.emit({ type: "sfx", sound: "rune" });
        if (this.runes >= 5) this.achieve("rune-keeper");
        break;
      case "tonic":
        this.tonics++;
        this.say("You pocket a bitterroot tonic.", "info");
        this.emit({ type: "sfx", sound: "tonic" });
        break;
      case "weapon": {
        const gear = item.gear!;
        if (gear.bonus > (this.weapon?.bonus ?? 0)) {
          this.weapon = gear;
          this.say(`You take up the ${gear.name}. (+${gear.bonus} ATK)`, "good");
          this.emit({ type: "sfx", sound: "gear" });
        } else {
          this.say(`A ${gear.name} — yours is better. You leave it.`, "info");
          return; // stays on the floor
        }
        break;
      }
      case "armor": {
        const gear = item.gear!;
        if (gear.bonus > (this.armor?.bonus ?? 0)) {
          this.armor = gear;
          this.say(`You strap on the ${gear.name}. (+${gear.bonus} DEF)`, "good");
          this.emit({ type: "sfx", sound: "gear" });
        } else {
          this.say(`A ${gear.name} — yours is better. You leave it.`, "info");
          return;
        }
        break;
      }
    }
    this.items = this.items.filter((i) => i !== item);
  }

  // ---- Monsters ----------------------------------------------------------

  private monstersAct() {
    for (const m of [...this.monsters]) {
      if (this.phase !== "running") return;
      if (m.def.trait === "slow" && this.turn % 2 === 1) continue;

      if (!m.awake) {
        const d2 = (m.x - this.px) ** 2 + (m.y - this.py) ** 2;
        if (d2 <= WAKE_RADIUS2 && lineOfSight(this.tiles, m.x, m.y, this.px, this.py)) {
          m.awake = true;
        } else {
          continue;
        }
      }

      const steps = m.def.trait === "fast" ? 2 : 1;
      for (let s = 0; s < steps; s++) {
        if (Math.abs(m.x - this.px) + Math.abs(m.y - this.py) === 1) {
          this.attackPlayer(m);
          break;
        }
        this.stepMonster(m);
      }
    }
  }

  private stepMonster(m: Monster) {
    const dx = Math.sign(this.px - m.x);
    const dy = Math.sign(this.py - m.y);
    let candidates: [number, number][];

    if (m.def.trait === "erratic" && Math.random() < 0.4) {
      candidates = shuffle([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]);
    } else {
      const primary: [number, number][] =
        Math.abs(this.px - m.x) >= Math.abs(this.py - m.y)
          ? [
              [dx, 0],
              [0, dy],
            ]
          : [
              [0, dy],
              [dx, 0],
            ];
      const rest = shuffle(
        ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).filter(
          ([cx, cy]) => !primary.some(([px2, py2]) => px2 === cx && py2 === cy),
        ),
      );
      candidates = [...primary.filter(([cx, cy]) => cx !== 0 || cy !== 0), ...rest];
    }

    for (const [cx, cy] of candidates) {
      const nx = m.x + cx;
      const ny = m.y + cy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (this.tiles[idx(nx, ny)] === WALL) continue;
      if (nx === this.px && ny === this.py) continue; // attacks handled above
      if (this.monsterAt(nx, ny)) continue;
      m.x = nx;
      m.y = ny;
      return;
    }
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.monsters.find((m) => m.x === x && m.y === y);
  }

  // ---- Plumbing ----------------------------------------------------------

  private refreshFov() {
    this.visible = computeVisible(this.tiles, this.px, this.py);
    for (let i = 0; i < this.visible.length; i++) {
      if (this.visible[i]) this.seen[i] = 1;
    }
  }

  private say(text: string, tone: MsgTone) {
    this.msgs.push({ text, tone, turn: this.turn });
    if (this.msgs.length > 60) this.msgs.splice(0, this.msgs.length - 60);
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

const shuffle = <T,>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
