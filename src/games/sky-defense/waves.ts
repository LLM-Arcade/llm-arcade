// Sky Defense region and threat tables. DOM-free with relative .ts imports so
// scripts/harness/sky-defense.mjs runs the identical simulation under node.
//
// Every threat name here comes from the art manifest's fictional vocabulary.
// The cabinet never uses real weapon words anywhere in code, copy, or SQL.

/** How a family moves. The engine turns one of these into sway and drift. */
export type MotionStyle =
  | "straight"
  | "sway"
  | "drift"
  | "home"
  | "orbit"
  | "swarm"
  | "diagonal";

export interface ThreatFamily {
  id: string;
  name: string;
  points: number;
  /** Descent px/s before the region speed multiplier. */
  speed: number;
  motion: MotionStyle;
  /** Region health removed when it reaches the ground. */
  impact: number;
  /** Threats created by one spawn slot; only the wind-up swarm exceeds one. */
  units: number;
  /** True for the ember mine, which bursts again where it died. */
  detonates: boolean;
}

/**
 * Indexed 0..7 in the threats.png motion/damage pair order, so a family index
 * is also its sprite pair index. Reordering this breaks the art mapping.
 */
export const FAMILIES: readonly ThreatFamily[] = [
  { id: "seed-pod", name: "Seed Pod", points: 40, speed: 55, motion: "straight", impact: 12, units: 1, detonates: false },
  { id: "clockwork-kite", name: "Clockwork Kite", points: 60, speed: 70, motion: "sway", impact: 12, units: 1, detonates: false },
  { id: "ember-mine", name: "Ember Mine", points: 80, speed: 45, motion: "straight", impact: 14, units: 1, detonates: true },
  { id: "balloon-decoy", name: "Balloon Decoy", points: 20, speed: 30, motion: "drift", impact: 0, units: 1, detonates: false },
  { id: "beetle-drone", name: "Beetle Drone", points: 70, speed: 85, motion: "home", impact: 12, units: 1, detonates: false },
  { id: "orbiting-mask", name: "Orbiting Mask", points: 90, speed: 60, motion: "orbit", impact: 14, units: 1, detonates: false },
  { id: "wind-up-swarm", name: "Wind-Up Swarm", points: 15, speed: 75, motion: "swarm", impact: 6, units: 3, detonates: false },
  { id: "leaf-sail-skiff", name: "Leaf-Sail Skiff", points: 120, speed: 130, motion: "diagonal", impact: 16, units: 1, detonates: false },
] as const;

export const POD = 0;
export const KITE = 1;
export const MINE = 2;
export const BALLOON = 3;
export const BEETLE = 4;
export const MASK = 5;
export const SWARM = 6;
export const SKIFF = 7;

export interface WaveDef {
  /** Family indexes this wave draws from. */
  families: readonly number[];
  /** Spawn slots, not threats: one swarm slot puts three units in the sky. */
  count: number;
  /** Seconds the slots are scattered across, from the wave's first frame. */
  spread: number;
}

/** props-ui cell used for a building at its four fixed ground positions. */
export type BuildingKind = "house" | "bridge" | "observatory";

export interface RegionDef {
  name: string;
  /** Achievement fired when the region is held. */
  clearSlug: string;
  /** Flat sky fill. No gradients anywhere in this cabinet. */
  sky: string;
  /** Horizon sheet for this region; the slicer owns its source rects. */
  panel: 0 | 1 | 2;
  speedMul: number;
  /** Four buildings, left to right, on the fixed ground positions. */
  buildings: readonly [BuildingKind, BuildingKind, BuildingKind, BuildingKind];
  waves: readonly WaveDef[];
}

export const REGIONS: readonly RegionDef[] = [
  {
    name: "Desert Relay",
    clearSlug: "relay-held",
    sky: "#F4E6C1",
    panel: 0,
    speedMul: 1.0,
    buildings: ["house", "house", "house", "house"],
    waves: [
      { families: [POD, KITE], count: 5, spread: 8 },
      { families: [POD, KITE, BALLOON], count: 6, spread: 9 },
      { families: [POD, KITE, MINE, BALLOON], count: 7, spread: 11 },
    ],
  },
  {
    name: "River City",
    clearSlug: "river-guardian",
    sky: "#EFE6D2",
    panel: 1,
    speedMul: 1.15,
    buildings: ["house", "bridge", "bridge", "house"],
    waves: [
      { families: [POD, KITE, BEETLE], count: 7, spread: 11 },
      { families: [POD, MINE, BALLOON, BEETLE], count: 8, spread: 12 },
      { families: [KITE, BEETLE, SWARM], count: 9, spread: 13 },
      { families: [POD, KITE, MINE, BEETLE, SWARM], count: 10, spread: 15 },
    ],
  },
  {
    name: "Mountain Observatory",
    clearSlug: "observatory-held",
    sky: "#E8D9B8",
    panel: 2,
    speedMul: 1.3,
    buildings: ["house", "observatory", "observatory", "house"],
    waves: [
      { families: [POD, KITE, BEETLE, MASK], count: 8, spread: 12 },
      { families: [KITE, MINE, MASK, SKIFF], count: 9, spread: 13 },
      { families: [POD, BEETLE, SWARM, SKIFF], count: 10, spread: 15 },
      { families: [KITE, MINE, MASK, SWARM, SKIFF], count: 11, spread: 16 },
      { families: [POD, KITE, MINE, BALLOON, BEETLE, MASK, SWARM, SKIFF], count: 12, spread: 18 },
    ],
  },
] as const;
