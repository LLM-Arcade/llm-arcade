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
  "hyper-circuit": lazy(() => import("./hyper-circuit/HyperCircuit")),
  "run-n-gunner": lazy(() => import("./run-n-gunner/RunNGunner")),
};
