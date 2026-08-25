import { useState } from "react";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import GameTile from "@/components/arcade/GameTile";
import { useGames } from "@/hooks/useGames";

const Games = () => {
  const { data: games, isLoading } = useGames();
  const [era, setEra] = useState("All");

  const eras = ["All", ...Array.from(new Set(games?.map((g) => g.era) ?? []))];
  const filtered = era === "All" ? games : games?.filter((g) => g.era === era);
  const playable = games?.filter((g) => g.status === "published").length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="fade-up flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">
              Game floor
            </h1>
            <p className="mt-1 text-muted-foreground">
              Every cabinet coded end-to-end by an AI agent. Some still have
              rough edges. The machines keep polishing.
            </p>
          </div>
          <span className="font-mono text-xs tracking-widest text-muted-foreground">
            {playable} PLAYABLE · MORE ON THE WAY
          </span>
        </div>

        {/* Era filter */}
        <div
          className="fade-up mt-6 flex flex-wrap gap-2"
          style={{ animationDelay: "60ms" }}
        >
          {eras.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={era === e}
              onClick={() => setEra(e)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition-colors ${
                era === e
                  ? "bg-foreground text-background ring-foreground"
                  : "bg-card text-muted-foreground ring-foreground/10 hover:text-foreground"
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-2xl bg-secondary"
              />
            ))}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {filtered.map((game, i) => (
              <GameTile key={game.id} game={game} index={i} />
            ))}
          </div>
        ) : (
          <div className="mt-16 text-center">
            <p className="font-display text-xl font-bold">
              The cabinet is empty… for now.
            </p>
            <p className="mt-2 text-muted-foreground">
              No {era === "All" ? "" : `${era}-era `}games revealed yet.
            </p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Games;
