// Weapons, armor, consumables, prices, and loot tables. The economy's
// TUNE lives here; every knob carries its unit.

import type { ArmorId, ArrowType, ClassId, Quality, WeaponId } from "./types.ts";

export type WeaponKind = "melee" | "bow" | "focus";

export interface WeaponDef {
  id: WeaponId;
  cls: ClassId;
  kind: WeaponKind;
  tier: 0 | 1 | 2; // rack price tier; 0 = starting weapon
  // melee
  lightDmg?: number;
  heavyDmg?: number;
  arc?: number; // radians
  reach?: number; // m
  cycle?: number; // s between light swings
  heavyWindup?: number; // s
  vsArmorMult?: number; // war axe bonus vs armored targets
  staggerLight?: boolean; // maul
  knockbackHeavy?: number; // m, maul
  // A sidegrade trades the class's core rhythm for a different one; the
  // guaranteed rack slot never offers one, the wildcard slot may.
  sidegrade?: boolean;
  // bow
  tapDmg?: number;
  chargedDmg?: number;
  chargeTime?: number; // s to full charge
  pierce?: number; // bodies a charged shot passes through
  flat?: boolean; // crossbow: no charge, fixed damage
  reload?: number; // s, crossbow/repeater cycle
  // focus
  boltDmg?: number;
  boltCost?: number; // mana
  boltCycle?: number; // s
  beamDps?: number;
  beamCost?: number; // mana per s
  mendHeal?: number;
  mendCost?: number; // mana
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  "worn-sword": {
    id: "worn-sword", cls: "knight", kind: "melee", tier: 0,
    lightDmg: 18, heavyDmg: 38, arc: (100 * Math.PI) / 180, reach: 2.4,
    cycle: 0.5, heavyWindup: 1.1,
  },
  "arming-sword": {
    id: "arming-sword", cls: "knight", kind: "melee", tier: 1,
    lightDmg: 24, heavyDmg: 50, arc: (110 * Math.PI) / 180, reach: 2.6,
    cycle: 0.5, heavyWindup: 1.1,
  },
  "war-axe": {
    id: "war-axe", cls: "knight", kind: "melee", tier: 1,
    lightDmg: 30, heavyDmg: 62, arc: (85 * Math.PI) / 180, reach: 2.2,
    cycle: 0.55, heavyWindup: 1.1, vsArmorMult: 1.5,
  },
  maul: {
    id: "maul", cls: "knight", kind: "melee", tier: 2,
    lightDmg: 34, heavyDmg: 75, arc: (70 * Math.PI) / 180, reach: 2.4,
    cycle: 0.8, heavyWindup: 1.3, staggerLight: true, knockbackHeavy: 3,
  },
  halberd: {
    id: "halberd", cls: "knight", kind: "melee", tier: 2,
    lightDmg: 26, heavyDmg: 54, arc: (60 * Math.PI) / 180, reach: 3.6,
    cycle: 0.65, heavyWindup: 1.2,
  },
  "worn-shortbow": {
    id: "worn-shortbow", cls: "archer", kind: "bow", tier: 0,
    tapDmg: 14, chargedDmg: 36, chargeTime: 0.8, pierce: 1, reload: 0.5,
  },
  longbow: {
    id: "longbow", cls: "archer", kind: "bow", tier: 1,
    tapDmg: 18, chargedDmg: 48, chargeTime: 0.9, pierce: 1, reload: 0.5,
  },
  warbow: {
    id: "warbow", cls: "archer", kind: "bow", tier: 2,
    tapDmg: 24, chargedDmg: 66, chargeTime: 1.2, pierce: 2, reload: 0.55,
  },
  crossbow: {
    id: "crossbow", cls: "archer", kind: "bow", tier: 1, sidegrade: true,
    tapDmg: 52, chargedDmg: 52, chargeTime: 0, pierce: 1, flat: true, reload: 1.6,
  },
  repeater: {
    id: "repeater", cls: "archer", kind: "bow", tier: 2, sidegrade: true,
    tapDmg: 11, chargedDmg: 11, chargeTime: 0, pierce: 1, flat: true, reload: 0.25,
  },
  "ash-wand": {
    id: "ash-wand", cls: "mage", kind: "focus", tier: 0,
    boltDmg: 16, boltCost: 6, boltCycle: 0.45, beamDps: 28, beamCost: 14,
    mendHeal: 30, mendCost: 25,
  },
  "oak-staff": {
    id: "oak-staff", cls: "mage", kind: "focus", tier: 1,
    boltDmg: 22, boltCost: 8, boltCycle: 0.45, beamDps: 40, beamCost: 18,
    mendHeal: 35, mendCost: 25,
  },
  "kiln-staff": {
    id: "kiln-staff", cls: "mage", kind: "focus", tier: 2,
    boltDmg: 30, boltCost: 12, boltCycle: 0.5, beamDps: 55, beamCost: 24,
    mendHeal: 30, mendCost: 28,
  },
  "hearth-staff": {
    id: "hearth-staff", cls: "mage", kind: "focus", tier: 1,
    boltDmg: 18, boltCost: 8, boltCycle: 0.45, beamDps: 32, beamCost: 16,
    mendHeal: 50, mendCost: 22,
  },
  "cinder-rod": {
    id: "cinder-rod", cls: "mage", kind: "focus", tier: 2, sidegrade: true,
    boltDmg: 9, boltCost: 3, boltCycle: 0.25, beamDps: 0, beamCost: 0,
    mendHeal: 30, mendCost: 25,
  },
};

export const QUALITY_MULT: Record<Quality, number> = {
  worn: 0.85,
  standard: 1.0,
  fine: 1.15,
  masterwork: 1.3,
};

export const STARTING_WEAPON: Record<ClassId, WeaponId> = {
  knight: "worn-sword",
  archer: "worn-shortbow",
  mage: "ash-wand",
};

export interface ArmorDef {
  id: ArmorId;
  reduction: number; // stacks multiplicatively with class base armor
  wearable: ClassId[];
  price: number; // valor
}

export const ARMORS: Record<ArmorId, ArmorDef> = {
  padded: { id: "padded", reduction: 0.05, wearable: ["knight", "archer", "mage"], price: 120 },
  jack: { id: "jack", reduction: 0.1, wearable: ["knight", "archer", "mage"], price: 250 },
  mail: { id: "mail", reduction: 0.15, wearable: ["knight", "archer"], price: 450 },
  plate: { id: "plate", reduction: 0.22, wearable: ["knight"], price: 700 },
};

export const ARROWS: Record<
  ArrowType,
  { vsUnarmoredMult: number; ignoresGuard: boolean; burnDps: number; burnTime: number }
> = {
  broadhead: { vsUnarmoredMult: 1, ignoresGuard: false, burnDps: 0, burnTime: 0 },
  bodkin: { vsUnarmoredMult: 0.8, ignoresGuard: true, burnDps: 0, burnTime: 0 },
  ember: { vsUnarmoredMult: 1, ignoresGuard: false, burnDps: 4, burnTime: 3 },
};

// Everything purchasable, at Long Watch prices. The difficulty multiplier
// applies at purchase time. Partner gear costs 80% of these.
export const PRICES = {
  weaponTier: [0, 200, 350] as const, // rack price by weapon tier (tier 0 is never sold)
  weaponFinePremium: 0.25, // fraction added for fine quality
  weaponMasterworkPremium: 0.6,
  weaponTradeIn: 0.4, // fraction of value returned when replacing
  districtOpen: { armory: 250, wellcourt: 250, hall: 400, undercroft: 300 } as const,
  barricadeRepairPer100: 30,
  barricadeInstall: 150,
  barricadeTier2: 250,
  barricadeTier3: 600,
  barricadeTier3Wave: 8, // earliest wave tier 3 unlocks
  hallRepairDiscount: 0.2, // while the hall is open
  watchfireStokePer100: 40,
  bandage: 35,
  poultice: 60, // +2 hp/s regen for the next wave
  meal: 100, // +20 max hp for 3 waves
  whetstone: 75, // +10% weapon damage next wave
  quiverRefill: 40,
  secondWind: 800, // doubles each purchase
  partnerPriceMult: 0.8,
} as const;

export const BARRICADE_HP = [0, 300, 600, 1000] as const; // by tier

export const CONSUMABLE_FX = {
  poulticeRegen: 2, // hp/s
  mealMaxHp: 20,
  mealWaves: 3,
  whetstoneMult: 1.1,
} as const;

// Drop tables. Chances at Long Watch; the difficulty drop multiplier
// scales the roll.
export const DROPS = {
  gnasherArrowChance: 0.1,
  gnasherArrowCount: 6,
  maulerSatchelChance: 0.35,
  broodSatchelChance: 0.5,
  satchelValor: 25,
  satchelBandageChance: 0.5,
  filcherStealMax: 60, // valor it can carry off
  filcherKillBonus: 40,
  pickupRadius: 1.2, // m, walk-over collection
  pickupTtl: 30, // s before a drop fades
} as const;

// Valor earned per kill.
export const VALOR: Record<string, number> = {
  gnasher: 10,
  lobber: 20,
  alpha: 35,
  breacher: 25,
  shrike: 30,
  mauler: 60,
  ironback: 20,
  hexer: 30,
  stalker: 25,
  filcher: 40,
  sapper: 35,
  broodmother: 45,
  skitterling: 2,
  cracktusk: 250,
  shepherd: 250,
  coalhide: 250,
  packlord: 250,
};

// Score per kill, before the headshot and difficulty multipliers.
export const SCORE: Record<string, number> = {
  gnasher: 20,
  lobber: 45,
  alpha: 90,
  breacher: 55,
  shrike: 75,
  mauler: 130,
  ironback: 45,
  hexer: 70,
  stalker: 60,
  filcher: 100,
  sapper: 85,
  broodmother: 110,
  skitterling: 5,
  cracktusk: 600,
  shepherd: 600,
  coalhide: 600,
  packlord: 900,
};

export const ECON = {
  waveClearBase: 50,
  waveClearPerWave: 10,
  ironWatchValor: 100,
  ironWatchMinWave: 3,
  earlyHornValor: 25,
  reviveValor: 25,
  headshotKillValor: 5,
  scoreWaveClearBase: 100,
  scoreWaveClearPerWave: 25,
  scoreIronWatch: 250,
  scoreRevive: 50,
  scoreHeadshotMult: 0.5, // bonus fraction of the kill's score
  scoreCap: 5_000_000,
} as const;
