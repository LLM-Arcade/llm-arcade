// Dev-only playtest shell for Track-A cabinets whose DB row is still
// coming_soon. Mounted at /dev/:slug behind import.meta.env.DEV.

import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { gameRegistry } from "@/games/registry";
import NotFound from "./NotFound";

const DevGame = () => {
  const { slug } = useParams();
  const Game = slug ? gameRegistry[slug] : undefined;
  if (!Game) return <NotFound />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="mb-3 font-mono text-[11px] tracking-widest text-muted-foreground">
        DEV PLAYTEST · {slug}
      </p>
      <div className="relative h-[420px] overflow-hidden rounded-2xl bg-foreground ring-1 ring-foreground/10 sm:h-[520px]">
        <Suspense fallback={null}>
          <Game
            onScore={(payload) => console.log("[dev] score", payload)}
            onAchievement={(id) => console.log("[dev] achievement", id)}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default DevGame;
