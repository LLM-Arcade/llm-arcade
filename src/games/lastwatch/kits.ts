// Class base stats and upgrade lines. Weapons and armor live in
// arsenal.ts; these are the numbers a class carries regardless of gear.

import type { ClassId, UpgradeLine } from "./types.ts";

export interface ClassStats {
  maxHp: number;
  baseArmor: number; // damage reduction fraction
  speed: number; // m/s
  eyeHeight: number; // m, for aim resolution
}

export const CLASSES: Record<ClassId, ClassStats> = {
  knight: { maxHp: 220, baseArmor: 0.4, speed: 4.8, eyeHeight: 1.7 },
  archer: { maxHp: 130, baseArmor: 0, speed: 5.6, eyeHeight: 1.6 },
  mage: { maxHp: 110, baseArmor: 0, speed: 5.0, eyeHeight: 1.6 },
};

export const KIT = {
  sprintMult: 1.35,
  downedCrawlSpeed: 1.0, // m/s
  bleedoutTime: 30, // s
  reviveTime: 3, // s channel
  reviveRange: 1.5, // m
  reviveHpFrac: 0.4,
  reviveImmunity: 3, // s
  maxBandages: 3,
  bandageHeal: 30,
  bandageTime: 3, // s channel

  // knight
  guardMax: 100,
  guardRegen: 15, // per s while not blocking
  guardBreakStagger: 1.2, // s
  blockArc: (120 * Math.PI) / 180,
  blockAbsorb: 0.7,
  tauntRadius: 8,
  tauntDuration: 4,
  tauntCooldown: 12,
  meleeKillHeal: 2,

  // archer
  quiverStart: 36,
  headshotMult: 2,
  headBandFrac: 0.2, // top fraction of the capsule
  daggerDmg: 20,
  daggerArc: (100 * Math.PI) / 180,
  daggerReach: 1.8,
  daggerHop: 2.5, // m backward
  daggerCooldown: 1.2,
  trapCharges: 2,
  trapRadius: 2,
  trapSlow: 0.5,
  trapSlowTime: 3,

  // mage
  manaMax: 100,
  manaRegen: 6, // per s
  manaRegenDelay: 1, // s after any cast
  mendRange: 12,
  mendConeCos: Math.cos((10 * Math.PI) / 180),
  selfMendFrac: 0.7,
  burnFieldCost: 35,
  burnFieldCooldown: 10,
  burnFieldRadius: 3,
  burnFieldDps: 12,
  burnFieldTime: 6,
};

export interface UpgradeDef {
  line: UpgradeLine;
  cls: ClassId;
  prices: [number, number, number];
}

export const UPGRADES: UpgradeDef[] = [
  { line: "plate-line", cls: "knight", prices: [150, 350, 700] },
  { line: "guard-line", cls: "knight", prices: [120, 280, 550] },
  { line: "fervor-line", cls: "knight", prices: [150, 350, 700] },
  { line: "draw-line", cls: "archer", prices: [150, 350, 700] },
  { line: "quiver-line", cls: "archer", prices: [100, 250, 500] },
  { line: "traps-line", cls: "archer", prices: [120, 300, 600] },
  { line: "attune-line", cls: "mage", prices: [150, 350, 700] },
  { line: "focus-line", cls: "mage", prices: [150, 350, 700] },
  { line: "mending-line", cls: "mage", prices: [120, 280, 550] },
];

// Effects per tier, applied cumulatively from base. Tier is 0..3.
export const upgradeEffects = {
  plateArmor: [0.4, 0.45, 0.5, 0.55],
  guardMax: [100, 140, 180, 220],
  guardRegen: [15, 15, 18, 21],
  tauntRadius: [8, 10, 10, 10],
  tauntCooldown: [12, 12, 9, 9],
  meleeKillHeal: [2, 2, 2, 4],
  drawMult: [1, 0.85, 0.7, 0.55],
  quiverMax: [36, 48, 64, 80],
  trapBarbs: [0, 10, 10, 10], // dmg per s while slowed
  trapCharges: [2, 2, 3, 3],
  trapSlow: [0.5, 0.5, 0.5, 0.65],
  manaMax: [100, 125, 150, 175],
  manaRegen: [6, 7, 8, 9],
  focusMult: [1, 1.15, 1.3, 1.45],
  mendBonus: [0, 10, 20, 20],
  mendCostCut: [0, 0, 0, 5],
};
