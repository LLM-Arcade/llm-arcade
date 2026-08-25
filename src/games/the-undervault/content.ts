// The Undervault content tables. Bestiary, bosses, gear, relics, statuses,
// and the five depth regions. DOM free so the harness can import it.
//
// Sprite indexes here address the shipped sheets in the order the pixels
// actually run, which is not the order art-manifest.json declares. See
// sprites.ts for the measured correction.

export type Trait = "fast" | "slow" | "ranged" | "venom" | "armored" | "burning" | "shriek";

export interface MonsterDef {
  id: string;
  name: string;
  /** Column in monsters.gif, 0 based, in shipped order. */
  family: number;
  hp: number;
  damage: number;
  traits: Trait[];
}

/**
 * Eleven families. monsters.gif ships eleven, not the twelve the manifest
 * lists: there is no vault leech on the sheet, so its venom job sits on the
 * sewer beetle alone.
 */
export const BESTIARY: MonsterDef[] = [
  { id: "bone-porter", name: "Bone Porter", family: 0, hp: 5, damage: 2, traits: [] },
  { id: "candle-wraith", name: "Candle Wraith", family: 1, hp: 4, damage: 1, traits: ["ranged"] },
  { id: "root-brute", name: "Root Brute", family: 2, hp: 11, damage: 3, traits: ["slow"] },
  { id: "sewer-beetle", name: "Sewer Beetle", family: 3, hp: 6, damage: 1, traits: ["venom"] },
  { id: "salt-mummy", name: "Salt Mummy", family: 4, hp: 12, damage: 3, traits: ["slow"] },
  { id: "rust-automaton", name: "Rust Automaton", family: 5, hp: 14, damage: 3, traits: ["armored", "slow"] },
  { id: "mole-knight", name: "Mole Knight", family: 6, hp: 10, damage: 3, traits: ["armored"] },
  { id: "fungal-pilgrim", name: "Fungal Pilgrim", family: 7, hp: 9, damage: 2, traits: [] },
  // Ranged and fast together is unblockable chip: a range hit floors at 1
  // after armour, so two shots a turn from a flock kills through any plate.
  // The harpy keeps the reach, the salamander keeps the speed.
  { id: "ash-harpy", name: "Ash Harpy", family: 8, hp: 7, damage: 2, traits: ["ranged"] },
  { id: "oracle-mask", name: "Oracle Mask", family: 9, hp: 8, damage: 2, traits: ["shriek"] },
  { id: "coal-salamander", name: "Coal Salamander", family: 10, hp: 9, damage: 2, traits: ["burning", "fast"] },
];

export const monsterById = (id: string): MonsterDef => {
  const def = BESTIARY.find((m) => m.id === id);
  if (!def) throw new Error(`unknown monster ${id}`);
  return def;
};

export type BossGimmick = "telegraph" | "spawn" | "shield" | "root" | "line";

export interface BossDef {
  id: string;
  name: string;
  /** Column in bosses.gif, 0 based. */
  art: number;
  hp: number;
  damage: number;
  gimmick: BossGimmick;
  /** Turns between gimmick beats. */
  period: number;
  intro: string;
}

export const BOSSES: BossDef[] = [
  {
    id: "bell-tower-colossus",
    name: "Bell Tower Colossus",
    art: 0,
    hp: 24,
    damage: 3,
    gimmick: "telegraph",
    period: 2,
    intro: "The bell swings once on its own. The colossus winds up a full turn before every swing.",
  },
  {
    id: "obsidian-spider-queen",
    name: "Obsidian Spider Queen",
    art: 1,
    hp: 30,
    damage: 3,
    gimmick: "spawn",
    period: 3,
    intro: "Egg sacs line the vault. She calls a sewer beetle every third turn, three at most.",
  },
  {
    id: "reliquary-sentinel",
    name: "Reliquary Sentinel",
    art: 2,
    hp: 34,
    damage: 4,
    gimmick: "shield",
    period: 2,
    intro: "Its reliquary plate closes on alternate turns. Strike when the plate is open.",
  },
  {
    id: "root-crowned-judge",
    name: "Root-Crowned Judge",
    art: 3,
    hp: 40,
    damage: 4,
    gimmick: "root",
    period: 4,
    intro: "Roots crawl under the flagstones. Every fourth turn they hold your feet.",
  },
  {
    id: "buried-engine",
    name: "The Buried Engine",
    art: 4,
    hp: 46,
    damage: 4,
    gimmick: "line",
    period: 3,
    intro: "The engine charges for two turns, then fires along its row and column. Step off the line.",
  },
];

// ---- Gear ------------------------------------------------------------
// icons.gif row 1 is a single mixed equipment row, not the separate weapon
// and armor rows the manifest describes. Four weapon tiers share the one
// sword icon; the three armor tiers get the boots, helm, and shield.

export interface GearDef {
  name: string;
  bonus: number;
  icon: EquipmentIcon;
}

export const WEAPONS: GearDef[] = [
  { name: "Chipped Falchion", bonus: 1, icon: "sword" },
  { name: "Gatehouse Blade", bonus: 2, icon: "sword" },
  { name: "Ossuary Cleaver", bonus: 3, icon: "sword" },
  { name: "Mechanism Edge", bonus: 4, icon: "sword" },
];

export const ARMORS: GearDef[] = [
  { name: "Warden Boots", bonus: 1, icon: "boots" },
  { name: "Vault Helm", bonus: 2, icon: "helm" },
  { name: "Bastion Shield", bonus: 3, icon: "shield" },
];

// ---- Relics ----------------------------------------------------------

export type RelicId =
  | "sunwheel"
  | "mandrake"
  | "spiral-ward"
  | "coin-bell"
  | "delvers-map"
  | "vault-gear"
  | "bone-flute"
  | "cinder-cap";

export interface RelicDef {
  id: RelicId;
  name: string;
  effect: string;
  icon: RelicIcon;
}

export const RELICS: RelicDef[] = [
  { id: "sunwheel", name: "Sunwheel Medallion", effect: "+1 damage on every blow.", icon: "medallion" },
  { id: "mandrake", name: "Mandrake Knot", effect: "Recover 1 HP every 8 turns.", icon: "mandrake" },
  { id: "spiral-ward", name: "Spiral Ward", effect: "Survives one killing blow at 1 HP.", icon: "spiral" },
  { id: "coin-bell", name: "Coin Bell", effect: "Gold caches pay half again.", icon: "bell" },
  { id: "delvers-map", name: "Delver's Map", effect: "Reveals traps on adjacent tiles.", icon: "map" },
  { id: "vault-gear", name: "Vault Gear", effect: "Take 1 less damage from every hit.", icon: "gear" },
  { id: "bone-flute", name: "Bone Flute", effect: "Immune to poison.", icon: "flute" },
  { id: "cinder-cap", name: "Cinder Cap", effect: "Immune to burning.", icon: "cap" },
];

export const relicById = (id: RelicId): RelicDef => {
  const def = RELICS.find((r) => r.id === id);
  if (!def) throw new Error(`unknown relic ${id}`);
  return def;
};

// ---- Statuses --------------------------------------------------------

export type StatusId = "poison" | "burn" | "root" | "shield" | "regen";

export interface StatusDef {
  id: StatusId;
  name: string;
  icon: StatusIcon;
  /** Damage per turn while the counter runs; regen heals with a negative value. */
  tick: number;
  turns: number;
}

export const STATUSES: Record<StatusId, StatusDef> = {
  poison: { id: "poison", name: "Poisoned", icon: "poison", tick: 1, turns: 3 },
  burn: { id: "burn", name: "Burning", icon: "burn", tick: 2, turns: 2 },
  root: { id: "root", name: "Rooted", icon: "curse", tick: 0, turns: 2 },
  shield: { id: "shield", name: "Warded", icon: "ward", tick: 0, turns: 3 },
  regen: { id: "regen", name: "Mending", icon: "regen", tick: -1, turns: 3 },
};

// ---- Portraits -------------------------------------------------------

export type PortraitId = "hooded-scout" | "clay-guardian" | "olive-herbalist" | "lamp-bearer";

export interface PortraitDef {
  id: PortraitId;
  name: string;
  perk: string;
  /** Column in portraits.gif, 0 based. */
  art: number;
  bonusHp: number;
  bonusTonics: number;
  bonusFov: number;
  dodge: number;
}

export const PORTRAITS: PortraitDef[] = [
  {
    id: "hooded-scout",
    name: "Hooded Scout",
    perk: "Slips one blow in eight.",
    art: 0,
    bonusHp: 0,
    bonusTonics: 0,
    bonusFov: 0,
    dodge: 0.125,
  },
  {
    id: "clay-guardian",
    name: "Clay Guardian",
    perk: "Carries 4 more HP.",
    art: 1,
    bonusHp: 4,
    bonusTonics: 0,
    bonusFov: 0,
    dodge: 0,
  },
  {
    id: "olive-herbalist",
    name: "Olive Herbalist",
    perk: "Starts with 2 extra tonics.",
    art: 2,
    bonusHp: 0,
    bonusTonics: 2,
    bonusFov: 0,
    dodge: 0,
  },
  {
    id: "lamp-bearer",
    name: "Lamp-Bearer",
    perk: "Sees 1.5 tiles further.",
    art: 3,
    bonusHp: 0,
    bonusTonics: 0,
    bonusFov: 1.5,
    dodge: 0,
  },
];

export const portraitById = (id: PortraitId): PortraitDef => {
  const def = PORTRAITS.find((p) => p.id === id);
  if (!def) throw new Error(`unknown portrait ${id}`);
  return def;
};

/** portraits.gif column 4 is the merchant bust. */
export const MERCHANT_PORTRAIT = 4;

// ---- Depth regions ---------------------------------------------------

export interface FloorDef {
  id: string;
  name: string;
  /** Background jpg under public/assets/games/the-undervault/. */
  art: string;
  blurb: string;
  monsters: string[];
  monsterCount: number;
  goldPiles: number;
  tonics: number;
  relics: number;
  traps: number;
  /** A locked side vault appears from the ossuary down. */
  vault: boolean;
  merchant: boolean;
  boss: string;
}

export const FLOORS: FloorDef[] = [
  {
    id: "gatehouse",
    name: "The Gatehouse",
    art: "depth-gatehouse.jpg",
    blurb: "Toll booths and a bell that still answers.",
    monsters: ["bone-porter", "candle-wraith", "root-brute", "sewer-beetle"],
    monsterCount: 6,
    goldPiles: 3,
    tonics: 3,
    relics: 1,
    traps: 2,
    vault: false,
    merchant: false,
    boss: "bell-tower-colossus",
  },
  {
    id: "ossuary",
    name: "The Ossuary",
    art: "depth-ossuary.jpg",
    blurb: "Niches stacked to the vaulting, and something spinning between them.",
    monsters: ["bone-porter", "candle-wraith", "sewer-beetle", "salt-mummy", "rust-automaton"],
    monsterCount: 8,
    goldPiles: 4,
    tonics: 3,
    relics: 1,
    traps: 3,
    vault: true,
    merchant: true,
    boss: "obsidian-spider-queen",
  },
  {
    id: "fungal-cistern",
    name: "The Fungal Cistern",
    art: "depth-fungal-cistern.jpg",
    blurb: "Standing water, olive caps, and a sentinel that will not rust.",
    monsters: ["sewer-beetle", "salt-mummy", "fungal-pilgrim", "mole-knight", "oracle-mask"],
    monsterCount: 9,
    goldPiles: 4,
    tonics: 3,
    relics: 1,
    traps: 3,
    vault: true,
    merchant: false,
    boss: "reliquary-sentinel",
  },
  {
    id: "buried-court",
    name: "The Buried Court",
    art: "depth-buried-court.jpg",
    blurb: "Colonnades under a ceiling of roots, and a bench that still sits.",
    monsters: ["root-brute", "rust-automaton", "mole-knight", "fungal-pilgrim", "ash-harpy", "oracle-mask"],
    monsterCount: 10,
    goldPiles: 5,
    tonics: 4,
    relics: 1,
    traps: 4,
    vault: true,
    merchant: true,
    boss: "root-crowned-judge",
  },
  {
    id: "deep-mechanism",
    name: "The Deep Mechanism",
    art: "depth-deep-mechanism.jpg",
    blurb: "Gear teeth the size of doors, and the thing they were built to turn.",
    monsters: ["salt-mummy", "rust-automaton", "mole-knight", "ash-harpy", "oracle-mask", "coal-salamander"],
    monsterCount: 11,
    goldPiles: 5,
    tonics: 4,
    relics: 1,
    traps: 4,
    vault: true,
    merchant: false,
    boss: "buried-engine",
  },
];

// ---- Icon name tables ------------------------------------------------
// icons.gif is a clean 8 by 4 grid. These are the shipped pictures read off
// the sheet, row by row.

export const EQUIPMENT_ICONS = [
  "sword",
  "shield",
  "lantern",
  "satchel",
  "key",
  "rope",
  "boots",
  "helm",
] as const;

export const RELIC_ICONS = [
  "medallion",
  "mandrake",
  "spiral",
  "bell",
  "map",
  "gear",
  "flute",
  "cap",
] as const;

export const STATUS_ICONS = [
  "ward",
  "poison",
  "shock",
  "swift",
  "burn",
  "regen",
  "curse",
  "heal",
] as const;

export const SITE_ICONS = [
  "open-door",
  "locked-door",
  "alcove",
  "spikes",
  "brazier",
  "stairs",
  "snare",
  "sundisc",
] as const;

export type EquipmentIcon = (typeof EQUIPMENT_ICONS)[number];
export type RelicIcon = (typeof RELIC_ICONS)[number];
export type StatusIcon = (typeof STATUS_ICONS)[number];
export type SiteIcon = (typeof SITE_ICONS)[number];

/** events.gif cells, row major. */
export const EVENT_CARDS = ["camp", "merchant", "boss", "descent", "death", "victory"] as const;
export type EventCard = (typeof EVENT_CARDS)[number];

/** ui-panels.gif cells: row 1 plain, row 2 the selected variant. */
export const PANEL_SKINS = ["inventory", "character", "map", "dialogue", "combat"] as const;
export type PanelSkin = (typeof PANEL_SKINS)[number];

/** Warm terminal palette for the typographic floor. No blue, no purple. */
export const PALETTE = {
  board: "#241C13",
  ink: "#1A140D",
  wall: "#6E5C48",
  floor: "#4A3F31",
  dim: "#393126",
  stairs: "#F0E4CC",
  cream: "#F4E6C1",
  label: "rgba(244,230,193,0.55)",
  olive: "#8C9A5B",
  mustard: "#D2A33C",
  terra: "#C0603A",
} as const;
