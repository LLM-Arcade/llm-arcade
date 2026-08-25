// Wave budgets, composition bands, spawn pacing, and milestone naming.

import type { GloamType } from "./types.ts";

export const WAVE = {
  quietTime: 4, // s of embers-only silence after the last kill
  intermissionBase: 25, // s
  intermissionPerDistrict: 5, // s per open district
  intermissionCap: 45, // s
  hornLead: 3, // s between the horn and the first spawn
  concurrencyCap: 32, // live Gloam at once, perf-bound and pressure-bound
  trickleFloorLate: 1.2, // s, wave 21+
} as const;

export function waveBudget(wave: number): number {
  if (wave <= 20) {
    return Math.round((40 + 20 * wave + 2.0 * wave * wave) / 5) * 5;
  }
  return Math.round(waveBudget(20) * Math.pow(1.12, wave - 20));
}

export function trickleInterval(wave: number): number {
  // 7.0 s at wave 1 easing toward the floor; the flood thickens, it never
  // fire-hoses.
  const floor = wave >= 21 ? WAVE.trickleFloorLate : 1.8;
  const t = 7.0 - 0.45 * (wave - 1);
  return Math.max(floor, t);
}

export const POINT_COST: Partial<Record<GloamType, number>> = {
  gnasher: 10,
  lobber: 25,
  alpha: 30,
  breacher: 30,
  shrike: 35,
  mauler: 80,
  ironback: 18,
  hexer: 35,
  stalker: 30,
  filcher: 30,
  sapper: 45,
  broodmother: 60,
};

// Composition bands: fraction of budget per group, spent in listed order,
// remainder into gnashers. A type only spawns once its debut wave arrives.
export interface Band {
  fromWave: number;
  weights: Partial<Record<GloamType, number>>;
}

export const BANDS: Band[] = [
  { fromWave: 1, weights: { lobber: 0.15 } },
  { fromWave: 3, weights: { lobber: 0.15, alpha: 0.12 } },
  { fromWave: 4, weights: { lobber: 0.2, breacher: 0.15, alpha: 0.1 } },
  {
    fromWave: 7,
    weights: { lobber: 0.15, breacher: 0.12, mauler: 0.08, alpha: 0.1, shrike: 0.1 },
  },
  {
    fromWave: 11,
    weights: {
      lobber: 0.1, breacher: 0.1, mauler: 0.1, alpha: 0.08, shrike: 0.08,
      ironback: 0.1, hexer: 0.08, stalker: 0.06, filcher: 0.05, sapper: 0.05,
    },
  },
  {
    fromWave: 14,
    weights: {
      lobber: 0.1, breacher: 0.1, mauler: 0.12, alpha: 0.08, shrike: 0.08,
      ironback: 0.08, hexer: 0.08, stalker: 0.06, filcher: 0.05, sapper: 0.05,
      broodmother: 0.08,
    },
  },
];

export function bandFor(wave: number): Band {
  let best = BANDS[0];
  for (const b of BANDS) if (wave >= b.fromWave) best = b;
  return best;
}

export type BossType = "cracktusk" | "shepherd" | "coalhide" | "packlord";

export const BOSS_CYCLE: BossType[] = ["cracktusk", "shepherd", "coalhide", "packlord"];

export function bossForWave(wave: number): { boss: BossType; cycle: number } | null {
  if (wave % 5 !== 0) return null;
  const idx = wave / 5 - 1; // wave 5 -> 0
  return { boss: BOSS_CYCLE[idx % 4], cycle: Math.floor(idx / 4) };
}

export const MILESTONE_NAMES: Record<BossType, string> = {
  cracktusk: "Cracktusk",
  shepherd: "The Shepherd's Flock",
  coalhide: "Coalhide's March",
  packlord: "The Packlord",
};

const DEEP_NAMES = [
  "Deepnight",
  "The Ash Count",
  "Ninth Bell",
  "The Ember Toll",
  "Cold Vigil",
  "The Long Count",
];

export function milestoneName(wave: number, pick: (n: number) => number): string | null {
  const b = bossForWave(wave);
  if (!b) return null;
  if (b.cycle === 0) return MILESTONE_NAMES[b.boss];
  return `${DEEP_NAMES[pick(DEEP_NAMES.length)]}: ${MILESTONE_NAMES[b.boss]}`;
}
