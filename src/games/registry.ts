import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { ArcadeScorePayload } from "@/lib/arcade-sdk";

// Props every Track-A (in-repo) game receives. Same semantics as the
// postMessage SDK spoken by Track-B uploads — one backend path for both.
export interface ArcadeGameProps {
  onScore: (payload: ArcadeScorePayload) => void;
  onAchievement: (id: string) => void;
}

// Track-A games register here keyed by slug.
// Phase 6 build order: Munch Maze → Rune & Ruin → Hyper Circuit → …
export const gameRegistry: Record<
  string,
  LazyExoticComponent<ComponentType<ArcadeGameProps>>
> = {
  "munch-maze": lazy(() => import("./munch-maze/MunchMaze")),
  "rune-ruin": lazy(() => import("./rune-ruin/RuneRuin")),
  "starfall-squadron": lazy(() => import("./starfall-squadron/StarfallSquadron")),
  // Stand-in art throughout; the DB row stays coming_soon until art
  // regeneration.
  "hyper-circuit": lazy(() => import("./hyper-circuit/HyperCircuit")),
  // Stand-in art as well; coming_soon until its sheets are generated.
  "run-n-gunner": lazy(() => import("./run-n-gunner/RunNGunner")),
  "the-undervault": lazy(() => import("./the-undervault/TheUndervault")),
  "kickflip-city": lazy(() => import("./kickflip-city/KickflipCity")),
  "sky-defense": lazy(() => import("./sky-defense/SkyDefense")),
  "gem-columns": lazy(() => import("./gem-columns/GemColumns")),
  brickstorm: lazy(() => import("./brickstorm/Brickstorm")),
  // Grid-logic cabinet: no sprites — the clues are the picture.
  flagstone: lazy(() => import("./flagstone/Flagstone")),
  // The 3D flagship: co-op horde defense, keyboard only.
  lastwatch: lazy(() => import("./lastwatch/Lastwatch")),
};
