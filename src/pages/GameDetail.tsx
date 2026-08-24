import { Link, useParams } from "react-router-dom";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import GamePlayer from "@/components/arcade/GamePlayer";
import LeaderboardPanel from "@/components/arcade/LeaderboardPanel";
import CommentsPanel from "@/components/arcade/CommentsPanel";
import RatingWidget from "@/components/arcade/RatingWidget";
import FavoriteButton from "@/components/arcade/FavoriteButton";
import AchievementsPanel from "@/components/progression/AchievementsPanel";
import { gameArt, useGame, useGames } from "@/hooks/useGames";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Gamepad2, Loader2 } from "lucide-react";

const tabTriggerClass =
  "rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm";

const GameDetail = () => {
  const { slug = "" } = useParams();
  const { data: game, isLoading } = useGame(slug);
  const { data: games } = useGames();

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <Gamepad2 className="h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
            This cabinet doesn't exist.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Maybe it hasn't been revealed yet — or it never will be.
          </p>
          <Link
            to="/games"
            className="mt-5 rounded-full bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to the floor
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const sameEra = games
    ?.filter((g) => g.era === game.era && g.id !== game.id)
    .slice(0, 3);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <Link
          to="/games"
          className="fade-up text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Game floor
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Main column */}
          <div className="fade-up min-w-0" style={{ animationDelay: "60ms" }}>
            <GamePlayer game={game} />

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-display text-3xl font-extrabold tracking-tight">
                {game.title}
              </h1>
              <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] tracking-widest text-muted-foreground">
                {game.era.toUpperCase()}-ERA
              </span>
              {game.genre && (
                <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] tracking-widest text-muted-foreground">
                  {game.genre.toUpperCase()}
                </span>
              )}
            </div>

            <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
              {game.description}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-olive/15 px-3 py-1 text-xs font-semibold text-olive">
                <Bot className="h-3.5 w-3.5" />
                Made with: {game.ai_credit}
              </span>
              <span className="font-mono text-xs tracking-widest text-muted-foreground">
                {game.play_count.toLocaleString()} PLAYS
              </span>
            </div>

            <Tabs defaultValue="leaderboard" className="mt-6">
              <TabsList className="h-auto rounded-full bg-secondary p-1">
                <TabsTrigger value="leaderboard" className={tabTriggerClass}>
                  Leaderboard
                </TabsTrigger>
                <TabsTrigger value="achievements" className={tabTriggerClass}>
                  Achievements
                </TabsTrigger>
                <TabsTrigger value="comments" className={tabTriggerClass}>
                  Comments
                </TabsTrigger>
                <TabsTrigger value="about" className={tabTriggerClass}>
                  About
                </TabsTrigger>
              </TabsList>
              <TabsContent value="leaderboard" className="mt-4">
                <LeaderboardPanel game={game} />
              </TabsContent>
              <TabsContent value="achievements" className="mt-4">
                <AchievementsPanel game={game} />
              </TabsContent>
              <TabsContent value="comments" className="mt-4">
                <CommentsPanel game={game} />
              </TabsContent>
              <TabsContent value="about" className="mt-4">
                <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10">
                  <div>
                    <h3 className="font-mono text-xs tracking-widest text-muted-foreground">
                      CONTROLS
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed">{game.controls}</p>
                  </div>
                  <div>
                    <h3 className="font-mono text-xs tracking-widest text-muted-foreground">
                      PROVENANCE
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed">
                      {game.track === "A"
                        ? `Built in-repo as a platform game by ${game.ai_credit}. Zero human-written code.`
                        : `Self-contained build by ${game.ai_credit}, submitted through the upload pipeline and run in an isolated sandbox. It talks to the platform through the Arcade SDK only.`}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-mono text-xs tracking-widest text-muted-foreground">
                      SCORING
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed">
                      Leaderboard metric: <span className="font-semibold">{game.score_label}</span>.
                      Scores save automatically when you're signed in — guests
                      can claim a run right after signing in.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <aside className="fade-up flex flex-col gap-4" style={{ animationDelay: "120ms" }}>
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10">
              <RatingWidget game={game} />
              <div className="my-4 h-px bg-border" />
              <FavoriteButton game={game} />
            </div>

            {sameEra && sameEra.length > 0 && (
              <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10">
                <h3 className="font-mono text-xs tracking-widest text-muted-foreground">
                  MORE FROM THE {game.era.toUpperCase()} ERA
                </h3>
                <div className="mt-3 flex flex-col gap-2">
                  {sameEra.map((g) => (
                    <Link
                      key={g.id}
                      to={`/game/${g.slug}`}
                      className="group flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-secondary/70"
                    >
                      <img
                        src={gameArt(g)}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 rounded-xl object-cover ring-1 ring-foreground/10"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{g.title}</p>
                        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                          {g.status === "published" ? "PLAYABLE" : "SOON"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default GameDetail;
