// Gem Columns level data. DOM-free so the node harness imports it directly.
// Family ids 0..4 are the gems-set-a.png columns and 5..9 the gems-set-b.png
// columns, in sheet order. Every one of the ten identities appears in at
// least one level set.

export const GEM_FAMILIES = [
  "crescent-oval",
  "sunburst-lozenge",
  "spiral-cabochon",
  "leaf-prism",
  "compass-square",
  "zigzag-shard",
  "droplet-heart",
  "eye-tablet",
  "flame-teardrop",
  "wave-star",
] as const;

export type GemFamily = (typeof GEM_FAMILIES)[number];

export interface LevelDef {
  id: string;
  name: string;
  /** Index into well-surrounds.png and environment-strip.png. */
  panel: 0 | 1 | 2;
  /** Six family ids this level draws triads from. */
  families: number[];
  /** Gems cleared to advance. */
  quota: number;
  /** Cells per second at the start of the level. */
  fall: number;
  /** Cells per second added for every rampEvery gems cleared here. */
  fallRamp: number;
  rampEvery: number;
  maxFall: number;
  clearSlug: string;
  ornament: "foundry-ornament" | "conservatory-ornament" | "archive-ornament";
}

export const LEVELS: LevelDef[] = [
  {
    id: "artisan-foundry",
    name: "ARTISAN FOUNDRY",
    panel: 0,
    families: [0, 1, 2, 3, 4, 5],
    quota: 30,
    fall: 1.1,
    fallRamp: 0.12,
    rampEvery: 10,
    maxFall: 2.4,
    clearSlug: "foundry-clear",
    ornament: "foundry-ornament",
  },
  {
    id: "conservatory",
    name: "CONSERVATORY",
    panel: 1,
    families: [3, 4, 5, 6, 7, 8],
    quota: 33,
    fall: 1.5,
    fallRamp: 0.15,
    rampEvery: 10,
    maxFall: 3.1,
    clearSlug: "conservatory-clear",
    ornament: "conservatory-ornament",
  },
  {
    id: "archaeological-archive",
    name: "ARCHAEOLOGICAL ARCHIVE",
    panel: 2,
    families: [0, 2, 6, 7, 8, 9],
    quota: 36,
    fall: 2,
    fallRamp: 0.18,
    rampEvery: 10,
    maxFall: 3.8,
    clearSlug: "archive-clear",
    ornament: "archive-ornament",
  },
];
