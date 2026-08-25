// The Gloam roster: stats, intelligence tiers, and behavior parameters.
// Coordination rules are implemented in engine.ts; the numbers live here.

import type { GloamType, IntelTier } from "./types.ts";

export interface GloamDef {
  type: GloamType;
  tier: IntelTier;
  hp: number;
  speed: number; // m/s
  radius: number; // m, capsule radius
  height: number; // m, capsule height for aim resolution
  dmg: number; // per hit vs characters
  structDmg: number; // per hit vs structures
  attackCycle: number; // s between attacks
  attackReach: number; // m
  debutWave: number;
  boss: boolean;
}

export const GLOAM: Record<GloamType, GloamDef> = {
  gnasher: {
    type: "gnasher", tier: "feral", hp: 30, speed: 6.5, radius: 0.4, height: 1.2,
    dmg: 8, structDmg: 4, attackCycle: 0.9, attackReach: 1.2, debutWave: 1, boss: false,
  },
  lobber: {
    type: "lobber", tier: "feral", hp: 45, speed: 4.2, radius: 0.5, height: 1.6,
    dmg: 18, structDmg: 10, attackCycle: 3.0, attackReach: 14, debutWave: 2, boss: false,
  },
  alpha: {
    type: "alpha", tier: "cunning", hp: 120, speed: 6.0, radius: 0.55, height: 1.5,
    dmg: 14, structDmg: 6, attackCycle: 0.8, attackReach: 1.4, debutWave: 3, boss: false,
  },
  breacher: {
    type: "breacher", tier: "feral", hp: 90, speed: 3.5, radius: 0.6, height: 1.8,
    dmg: 12, structDmg: 60, attackCycle: 1.4, attackReach: 1.5, debutWave: 4, boss: false,
  },
  shrike: {
    type: "shrike", tier: "cunning", hp: 55, speed: 6.8, radius: 0.4, height: 1.5,
    dmg: 12, structDmg: 4, attackCycle: 0.7, attackReach: 1.4, debutWave: 6, boss: false,
  },
  mauler: {
    type: "mauler", tier: "feral", hp: 320, speed: 3.8, radius: 0.9, height: 2.4,
    dmg: 35, structDmg: 40, attackCycle: 2.4, attackReach: 3.0, debutWave: 7, boss: false,
  },
  ironback: {
    type: "ironback", tier: "feral", hp: 55, speed: 5.5, radius: 0.45, height: 1.2,
    dmg: 10, structDmg: 5, attackCycle: 0.9, attackReach: 1.2, debutWave: 8, boss: false,
  },
  hexer: {
    type: "hexer", tier: "tactical", hp: 40, speed: 4.0, radius: 0.4, height: 1.8,
    dmg: 0, structDmg: 0, attackCycle: 1.0, attackReach: 0, debutWave: 9, boss: false,
  },
  stalker: {
    type: "stalker", tier: "cunning", hp: 60, speed: 6.0, radius: 0.45, height: 1.4,
    dmg: 14, structDmg: 4, attackCycle: 0.8, attackReach: 1.4, debutWave: 11, boss: false,
  },
  filcher: {
    type: "filcher", tier: "cunning", hp: 45, speed: 7.2, radius: 0.4, height: 1.3,
    dmg: 6, structDmg: 2, attackCycle: 1.0, attackReach: 1.2, debutWave: 11, boss: false,
  },
  sapper: {
    type: "sapper", tier: "tactical", hp: 110, speed: 3.2, radius: 0.6, height: 1.5,
    dmg: 10, structDmg: 20, attackCycle: 1.5, attackReach: 1.4, debutWave: 12, boss: false,
  },
  broodmother: {
    type: "broodmother", tier: "feral", hp: 260, speed: 3.0, radius: 0.9, height: 2.0,
    dmg: 16, structDmg: 12, attackCycle: 1.8, attackReach: 2.0, debutWave: 13, boss: false,
  },
  skitterling: {
    type: "skitterling", tier: "feral", hp: 10, speed: 7.0, radius: 0.25, height: 0.6,
    dmg: 4, structDmg: 1, attackCycle: 0.7, attackReach: 0.8, debutWave: 13, boss: false,
  },
  cracktusk: {
    type: "cracktusk", tier: "cunning", hp: 900, speed: 4.0, radius: 1.1, height: 2.6,
    dmg: 40, structDmg: 120, attackCycle: 2.6, attackReach: 3.2, debutWave: 5, boss: true,
  },
  shepherd: {
    type: "shepherd", tier: "tactical", hp: 700, speed: 3.6, radius: 0.7, height: 2.2,
    dmg: 0, structDmg: 0, attackCycle: 1.0, attackReach: 0, debutWave: 10, boss: true,
  },
  coalhide: {
    type: "coalhide", tier: "feral", hp: 2200, speed: 3.4, radius: 1.2, height: 2.8,
    dmg: 45, structDmg: 90, attackCycle: 2.6, attackReach: 3.2, debutWave: 15, boss: true,
  },
  packlord: {
    type: "packlord", tier: "tactical", hp: 3000, speed: 5.0, radius: 1.2, height: 2.8,
    dmg: 30, structDmg: 60, attackCycle: 1.4, attackReach: 2.4, debutWave: 20, boss: true,
  },
};

// Behavior tuning shared by the coordination rules in engine.ts.
export const BEHAVIOR = {
  lobberMinRange: 10, // m, backs away inside this
  lobberFlight: 1.2, // s, glob travel time
  lobberPuddleRadius: 1.5,
  lobberPuddleDps: 6,
  lobberPuddleTime: 3,
  breacherShieldArc: (120 * Math.PI) / 180, // frontal ranged block
  packMax: 8, // gnashers an alpha claims
  packClaimRadius: 12,
  packScatterTime: 5, // s of feral panic after the alpha dies
  alphaSpeedBonus: 0, // the alpha leads, the hexer speeds
  shrikeCircle: 4.5, // m, preferred orbit distance
  shrikeDodgeCos: Math.cos((15 * Math.PI) / 180), // aimed-at cone
  shrikeDodgeCooldown: 1.4, // s
  shrikeDodgeBurst: 6, // m/s sidestep speed for 0.3 s
  shrikeCommitWindow: 0.6, // s after a player attack starts
  hexerRange: 12, // m, tether reach
  hexerStandoff: 12, // m, keeps this far from characters
  hexerSpeedBonus: 0.2, // +20% pack speed
  hexerShieldHp: 80,
  hexerRetether: 2, // s between target picks
  stalkerPounceRange: 9, // m
  stalkerPounceSpeed: 11, // m/s during pounce
  stalkerIsolatedDist: 10, // m from nearest ally = isolated
  filcherStealTime: 2, // s at a store
  sapperDigTime: 6, // s of telegraphed digging
  sapperHoleTime: 20, // s the hole stays open
  broodSpawnEvery: 8, // s per pair of skitterlings
  broodSpawnBatch: 2,
  broodDeathBurst: 6,
  bloodScentRadius: 15, // m, converge when a structure drops under 50%
  ironbackFrontMult: 0.25, // frontal damage taken
  ironbackFrontArc: (100 * Math.PI) / 180,
  coalhideSeamMult: 2, // rear and flank seams
  coalhidePlateMult: 0.3,
  coalhideSeamArc: (255 * Math.PI) / 180, // everything outside the frontal plate
  cracktuskChargeSpeed: 12, // m/s
  cracktuskTelegraph: 1.8, // s
  cracktuskStun: 2, // s after hitting a wall
  cracktuskCooldown: 6, // s between charges
  shepherdSummonEvery: 10, // s
  shepherdSummonCount: 3,
  shepherdStandoff: 16, // m
  packlordHowlEvery: 20, // s
  packlordHowlWarn: 1, // s of warning before it lands
  packlordHowlBonus: 0.3, // +30% speed
  packlordHowlTime: 3, // s
  bossEscortBudgetFrac: 0.5, // milestone waves keep half their budget as escort
  bossRepeatHpMult: 1.35, // per boss cycle repeat
  maulerTelegraph: 1.2, // s
  maulerKnockback: 4, // m
  staggerTime: 0.8, // s, from knight heavies
  attackDamageDelay: 0.35, // s into the swing when damage lands
} as const;

// Endless scaling, applied per wave N on top of difficulty multipliers.
export function hpScale(wave: number): number {
  return 1 + 0.03 * Math.max(0, wave - 8);
}
export function speedScale(wave: number): number {
  return Math.min(1.15, 1 + 0.01 * Math.max(0, wave - 10));
}
export function dmgScale(wave: number): number {
  return 1 + 0.02 * Math.max(0, wave - 10);
}
