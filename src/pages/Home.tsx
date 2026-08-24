import { Link } from "react-router-dom";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import GameTile from "@/components/arcade/GameTile";
import ScoreTicker from "@/components/arcade/ScoreTicker";
import StreakCard from "@/components/progression/StreakCard";
import ActivityFeed from "@/components/progression/ActivityFeed";
import { useGames, type Game } from "@/hooks/useGames";
import { gameArtPath } from "@/data/launch-lineup";
import { Play } from "lucide-react";

const Rail = ({ title, games }: { title: string; games: Game[] }) => {
  if (games.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">{title}</h2>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {games.map((game, i) => (
          <div key={game.id} className="w-40 shrink-0 snap-start sm:w-44">
            <GameTile game={game} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
};

/** Post-launch Arcade Home (visible pre-launch to gate-bypass roles). */
const Home = () => {
  const { data: games } = useGames();

  const published = (games ?? []).filter((g) => g.status === "published");
  const comingSoon = (games ?? []).filter((g) => g.status === "coming_soon");
  const spotlight =
    [...published].sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) || b.play_count - a.play_count,
    )[0] ?? null;
  const floorRail = published.filter((g) => g.id !== spotlight?.id);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {/* Spotlight hero */}
        {spotlight && (
          <section className="fade-up overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10">
            <div className="grid md:grid-cols-[1.1fr_minmax(0,1fr)]">
              <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
                <span className="w-fit rounded-full bg-mustard px-3 py-1 font-mono text-[10px] font-medium tracking-widest">
                  THIS WEEK'S SPOTLIGHT
                </span>
                <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {spotlight.title}
                </h1>
                <p className="max-w-md leading-relaxed text-muted-foreground">
                  {spotlight.description}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <Link
                    to={`/game/${spotlight.slug}`}
                    className="inline-flex h-12 items-center gap-2.5 rounded-full bg-primary px-7 font-display text-base font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Play now
                  </Link>
                  <span className="font-mono text-xs tracking-widest text-muted-foreground">
                    {spotlight.era.toUpperCase()}-ERA · {spotlight.play_count.toLocaleString()} PLAYS
                  </span>
                </div>
              </div>
              <Link
                to={`/game/${spotlight.slug}`}
                className="group relative block min-h-[240px] md:min-h-[320px]"
              >
                <img
                  src={gameArtPath(spotlight.slug)}
                  alt={spotlight.title}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                />
              </Link>
            </div>
          </section>
        )}

        {/* Live scores */}
        <div className="fade-up mt-4" style={{ animationDelay: "80ms" }}>
          <ScoreTicker />
        </div>

        <div
          className="fade-up mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"
          style={{ animationDelay: "160ms" }}
        >
          {/* Rails */}
          <div className="flex min-w-0 flex-col gap-8">
            <Rail title="ON THE FLOOR NOW" games={floorRail.length ? floorRail : published} />
            <Rail title="IN PRODUCTION" games={comingSoon} />
            <div>
              <Link
                to="/games"
                className="inline-block rounded-full bg-secondary px-6 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary/70"
              >
                Browse the full floor →
              </Link>
            </div>
          </div>

          {/* Right rail */}
          <aside className="flex flex-col gap-5">
            <StreakCard />
            <div>
              <h2 className="mb-2.5 font-mono text-xs tracking-widest text-muted-foreground">
                FLOOR ACTIVITY
              </h2>
              <ActivityFeed showActor limit={8} />
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Home;
