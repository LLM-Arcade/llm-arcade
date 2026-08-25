// Shared types for the Lastwatch sim. Everything here is DOM-free and
// deterministic; the render layer and harness both consume these shapes.

export type Difficulty = "ember" | "long" | "forlorn";
export type ClassId = "knight" | "archer" | "mage";
export type IntelTier = "feral" | "cunning" | "tactical";

export type GloamType =
  | "gnasher"
  | "lobber"
  | "alpha"
  | "breacher"
  | "shrike"
  | "mauler"
  | "ironback"
  | "hexer"
  | "stalker"
  | "filcher"
  | "sapper"
  | "broodmother"
  | "skitterling"
  | "cracktusk"
  | "shepherd"
  | "coalhide"
  | "packlord";

export type RoomId =
  | "treeline"
  | "causeway"
  | "gateyard"
  | "rampart"
  | "stairW"
  | "stairE"
  | "outsideW"
  | "outsideE"
  | "outsideS"
  | "armory"
  | "wellcourt"
  | "hall"
  | "undercroft";

export type DoorId =
  | "arch"
  | "causeway-mouth"
  | "sap"
  | "postern"
  | "armory-rubble"
  | "well-rubble"
  | "hall-door-w"
  | "hall-door-e"
  | "hall-windows"
  | "armory-breach"
  | "stairw-lo"
  | "stairw-hi"
  | "staire-lo"
  | "staire-hi"
  | "undercroft-stair"
  | "sapper-hole";

export type DistrictId = "armory" | "wellcourt" | "hall" | "undercroft";

export type StructureId =
  | "watchfire"
  | "bar-arch"
  | "bar-sap"
  | "bar-postern"
  | "bar-hall-windows"
  | "bar-armory-breach";

export type StationId =
  | "ledger"
  | "racks"
  | "whetstone"
  | "well"
  | "herb-bed"
  | "hearth"
  | "armor-stand"
  | "cache";

export type WeaponId =
  // knight
  | "worn-sword"
  | "arming-sword"
  | "war-axe"
  | "maul"
  | "halberd"
  // archer
  | "worn-shortbow"
  | "longbow"
  | "warbow"
  | "crossbow"
  | "repeater"
  // mage
  | "ash-wand"
  | "oak-staff"
  | "kiln-staff"
  | "hearth-staff"
  | "cinder-rod";

export type Quality = "worn" | "standard" | "fine" | "masterwork";
export type ArmorId = "padded" | "jack" | "mail" | "plate";
export type ArrowType = "broadhead" | "bodkin" | "ember";
export type CommandId = "defend-arch" | "hold-ground" | "follow" | "regroup";

export type UpgradeLine =
  | "plate-line"
  | "guard-line"
  | "fervor-line"
  | "draw-line"
  | "quiver-line"
  | "traps-line"
  | "attune-line"
  | "focus-line"
  | "mending-line";

export interface WeaponInstance {
  id: WeaponId;
  quality: Quality;
}

// Per-tick control intent. Human input maps here in the shell; the partner
// AI and the harness bots produce the same shape, so all three drive
// characters identically.
export interface InputState {
  forward: number; // -1..1
  strafe: number; // -1..1, +1 is rightward
  yaw: number; // radians, 0 faces +x, counterclockwise
  pitch: number; // radians, + is up
  sprint: boolean;
  primary: boolean; // held
  secondary: boolean; // held
  skill: boolean; // held; engine edge-detects
  interact: boolean; // held (revive, stations, rubble, horn)
  bandage: boolean; // held; engine edge-detects
  cycleAmmo: boolean; // held; engine edge-detects
  command: CommandId | null; // non-null for one tick on wheel release
}

export function emptyInput(): InputState {
  return {
    forward: 0,
    strafe: 0,
    yaw: 0,
    pitch: 0,
    sprint: false,
    primary: false,
    secondary: false,
    skill: false,
    interact: false,
    bandage: false,
    cycleAmmo: false,
    command: null,
  };
}

export type SfxName =
  | "step-knight"
  | "step-light"
  | "swing"
  | "swing-heavy"
  | "melee-hit"
  | "clang-block"
  | "guard-break"
  | "bow-draw"
  | "bow-release"
  | "arrow-hit"
  | "dagger"
  | "crossbow"
  | "repeater"
  | "bolt-cast"
  | "bolt-hit"
  | "beam"
  | "mend"
  | "burn-field"
  | "trap-place"
  | "trap-trigger"
  | "taunt"
  | "snarl"
  | "lob"
  | "glob-splat"
  | "mauler-roar"
  | "mauler-slam"
  | "hexer-tether"
  | "stalker-screech"
  | "shrike-hiss"
  | "filcher-jingle"
  | "sapper-thud"
  | "sapper-breach"
  | "brood-pulse"
  | "skitter"
  | "pack-howl"
  | "structure-hit"
  | "structure-break"
  | "watchfire-hit"
  | "watchfire-fall"
  | "rubble-open"
  | "station-use"
  | "purchase"
  | "denied"
  | "down-sting"
  | "revive-channel"
  | "revive-done"
  | "wave-horn"
  | "wave-clear"
  | "boss-stinger"
  | "howl-warning"
  | "achievement";

export type BarkPool =
  | "run-start"
  | "wave-clear"
  | "type-debut"
  | "pack-split"
  | "hexer-spawn"
  | "filcher-raid"
  | "sapper-dig"
  | "stalker-overhead"
  | "mauler-telegraph"
  | "barricade-low"
  | "player-down"
  | "revive-done"
  | "partner-retreat"
  | "partner-heal"
  | "intermission"
  | "district-open"
  | "boss-down"
  | "deep-waves"
  | "player-low";

export type GameEvent =
  | { type: "sfx"; sound: SfxName }
  | { type: "bark"; pool: BarkPool; line: string }
  | { type: "achievement"; slug: string }
  | { type: "wave-start"; wave: number; name: string | null }
  | { type: "wave-clear"; wave: number }
  | { type: "district-open"; district: DistrictId }
  | {
      type: "gameover";
      score: number;
      stats: Record<string, string | number>;
      recap: string;
    };

export type Phase = "combat" | "quiet" | "intermission" | "gameover";

export interface DifficultyMods {
  valorMult: number;
  dropMult: number;
  priceMult: number;
  cacheEvery: number; // waves between cache restocks
  hpMult: number;
  dmgMult: number;
  scoreMult: number;
  intelBoost: boolean; // select ferals become cunning, coordination 2 waves early
}

export const DIFFICULTY: Record<Difficulty, DifficultyMods> = {
  ember: {
    valorMult: 1.5,
    dropMult: 1.5,
    priceMult: 0.9,
    cacheEvery: 4,
    hpMult: 0.8,
    dmgMult: 0.75,
    scoreMult: 0.75,
    intelBoost: false,
  },
  long: {
    valorMult: 1.0,
    dropMult: 1.0,
    priceMult: 1.0,
    cacheEvery: 5,
    hpMult: 1.0,
    dmgMult: 1.0,
    scoreMult: 1.0,
    intelBoost: false,
  },
  forlorn: {
    valorMult: 0.8,
    dropMult: 0.6,
    priceMult: 1.15,
    cacheEvery: 6,
    hpMult: 1.15,
    dmgMult: 1.25,
    scoreMult: 1.35,
    intelBoost: true,
  },
};

export const TICK_RATE = 60; // sim ticks per second
export const DT = 1 / TICK_RATE;
