import type { ComponentType, LazyExoticComponent } from "react";
import type { ArcadeScorePayload } from "@/lib/arcade-sdk";

// Props every Track-A (in-repo) game receives. Same semantics as the
// postMessage SDK spoken by Track-B uploads — one backend path for both.
export interface ArcadeGameProps {
  onScore: (payload: ArcadeScorePayload) => void;
  onAchievement: (id: string) => void;
}

// Track-A games register here keyed by slug, e.g.:
//   "munch-maze": lazy(() => import("./munch-maze/MunchMaze")),
// Phase 6 fills this in (Munch Maze → Rune & Ruin → Hyper Circuit → …).
export const gameRegistry: Record<
  string,
  LazyExoticComponent<ComponentType<ArcadeGameProps>>
> = {};
