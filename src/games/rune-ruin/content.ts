// Rune & Ruin — bestiary, gear tables, and the board's glyph palette.
// All colors live here so the game reads as one deliberate terminal theme.

export interface MonsterDef {
  id: string;
  name: string;
  glyph: string;
  color: string;
  hp: number;
  atk: number;
  def: number;
  xp: number;
  minDepth: number;
  maxDepth: number;
  /** slow: acts every other turn · fast: two actions · erratic: 40% random step */
  trait?: "slow" | "fast" | "erratic";
}

export const BESTIARY: MonsterDef[] = [
  { id: "mole", name: "Burrow Mole", glyph: "m", color: "#B08D66", hp: 4, atk: 2, def: 0, xp: 3, minDepth: 1, maxDepth: 2 },
  { id: "beetle", name: "Husk Beetle", glyph: "b", color: "#93A26B", hp: 7, atk: 2, def: 2, xp: 4, minDepth: 1, maxDepth: 3, trait: "slow" },
  { id: "serpent", name: "Sallow Serpent", glyph: "s", color: "#C2AC50", hp: 7, atk: 3, def: 0, xp: 5, minDepth: 2, maxDepth: 4 },
  { id: "gnarl", name: "Gnarl", glyph: "g", color: "#BC7B41", hp: 12, atk: 4, def: 1, xp: 8, minDepth: 3, maxDepth: 6 },
  { id: "wisp", name: "Grave Wisp", glyph: "w", color: "#E6D9BB", hp: 9, atk: 4, def: 0, xp: 7, minDepth: 4, maxDepth: 7, trait: "erratic" },
  { id: "hound", name: "Marrow Hound", glyph: "h", color: "#C06A52", hp: 14, atk: 5, def: 1, xp: 11, minDepth: 5, maxDepth: 8, trait: "fast" },
  { id: "shade", name: "Cinder Shade", glyph: "S", color: "#9C8A78", hp: 13, atk: 6, def: 2, xp: 14, minDepth: 6, maxDepth: 9 },
  { id: "golem", name: "Ruin Golem", glyph: "G", color: "#A6AC94", hp: 26, atk: 7, def: 3, xp: 30, minDepth: 7, maxDepth: 999, trait: "slow" },
  { id: "wraith", name: "Vault Wraith", glyph: "W", color: "#EFE3C8", hp: 18, atk: 8, def: 2, xp: 22, minDepth: 9, maxDepth: 999 },
];

export interface GearDef {
  name: string;
  bonus: number;
}

export const WEAPONS: GearDef[] = [
  { name: "Oaken Cudgel", bonus: 1 },
  { name: "Bronze Sword", bonus: 2 },
  { name: "Iron Falx", bonus: 3 },
  { name: "Runed Axe", bonus: 4 },
  { name: "Sunsteel Blade", bonus: 5 },
];

export const ARMORS: GearDef[] = [
  { name: "Padded Jerkin", bonus: 1 },
  { name: "Leather Coat", bonus: 2 },
  { name: "Bronze Scale", bonus: 3 },
  { name: "Iron Plate", bonus: 4 },
];

/** Board palette — warm terminal on dark soil, zero blue anywhere. */
export const PALETTE = {
  board: "#2B2318",
  wall: "#6E5C48",
  floor: "#4E4335",
  dim: "#3D3529", // remembered-but-unseen tiles
  player: "#F6F1E7",
  stairs: "#F0E4CC",
  gold: "#D9A441",
  rune: "#D97A4E",
  tonic: "#97A86F",
  gear: "#C9BBA4",
} as const;
