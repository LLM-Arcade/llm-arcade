import { Link } from "react-router-dom";
import WaitlistForm from "@/components/arcade/WaitlistForm";
import SiteFooter from "@/components/layout/SiteFooter";
import GameTile from "@/components/arcade/GameTile";
import { useGames } from "@/hooks/useGames";
import { authCta } from "@/lib/known-player";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bot, Trophy, Upload } from "lucide-react";

const facts = [
  { icon: Bot, text: "Every game coded end-to-end by an AI agent" },
  { icon: Trophy, text: "High scores, achievements & streaks that stick" },
  { icon: Upload, text: "Upload your own AI-built game after launch" },
];

const Landing = () => {
  const { data: games, isLoading } = useGames();
  const playable = (games ?? []).filter((g) => g.status === "published").slice(0, 6);
  return (
  <div className="min-h-screen bg-background">
    {/* Header */}
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/brand/logo-mark.png"
            alt="LLM Arcade logo"
            className="h-9 w-9 rounded-full shadow-sm ring-1 ring-foreground/10"
          />
          <p className="font-display text-xl font-extrabold tracking-tight">
            llmarcade<span className="text-terra">.fun</span>
          </p>
        </div>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="rounded-full font-medium text-muted-foreground hover:text-foreground">
            <Link to="/games">Games</Link>
          </Button>
          <Button asChild variant="ghost" className="hidden rounded-full font-medium text-muted-foreground hover:text-foreground sm:inline-flex">
            <Link to="/faq">FAQ</Link>
          </Button>
          <Button asChild variant="ghost" className="hidden rounded-full font-medium text-muted-foreground hover:text-foreground sm:inline-flex">
            <Link to="/playtest">Playtest</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full font-medium text-muted-foreground hover:text-foreground">
            <Link to={authCta().to}>{authCta().verb}</Link>
          </Button>
          <Button asChild className="rounded-full bg-primary font-semibold hover:bg-primary/90">
            <a href="#waitlist">Get updates</a>
          </Button>
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="flex flex-col gap-5 py-10 sm:py-14 lg:max-w-3xl">
        <p className="fade-up font-mono text-xs tracking-[0.2em] text-olive">
          OPENING SOON
        </p>
        <h1
          className="fade-up font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
          style={{ animationDelay: "60ms" }}
        >
          An arcade built entirely by&nbsp;
          <span className="text-terra">machines.</span>
        </h1>
        <p className="fade-up text-lg text-muted-foreground" style={{ animationDelay: "120ms" }}>
          Zero human-written code. High scores that matter.
        </p>
        <p
          className="fade-up font-mono text-xs tracking-wide text-muted-foreground/80"
          style={{ animationDelay: "150ms" }}
        >
          Early days: some cabinets still have rough edges while the machines
          keep polishing.
        </p>
        <div id="waitlist" className="fade-up scroll-mt-24 pt-1" style={{ animationDelay: "180ms" }}>
          <WaitlistForm />
        </div>
      </section>

      {/* Playable tonight: live rows only, straight into the games */}
      <section className="pb-4">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight">On the floor tonight</h2>
          <Link
            to="/games"
            className="group inline-flex items-center gap-1.5 font-mono text-xs tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            THE WHOLE FLOOR
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-2xl bg-secondary" />
              ))
            : playable.map((game, i) => <GameTile key={game.id} game={game} index={i} />)}

          {/* Playtest tile */}
          <Link
            to="/playtest"
            className="group fade-up relative flex flex-col justify-between overflow-hidden rounded-2xl bg-olive p-5 shadow-sm transition-all duration-150 hover:-translate-y-1 hover:shadow-lg"
            style={{ animationDelay: "600ms" }}
          >
            <span className="font-mono text-[10px] tracking-widest text-background/80">
              LIMITED SEATS
            </span>
            <div>
              <p className="font-display text-xl font-bold leading-snug text-background">
                Play everything before launch
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-background/85">
                Become a playtester
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </p>
            </div>
          </Link>

          {/* Catalog tile */}
          <div
            className="fade-up flex flex-col justify-between rounded-2xl bg-secondary p-5 shadow-sm ring-1 ring-foreground/5"
            style={{ animationDelay: "660ms" }}
          >
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
              THE VAULT
            </span>
            <div>
              <p className="font-display text-3xl font-extrabold text-terra">MORE</p>
              <p className="mt-1 text-sm font-medium leading-snug text-foreground">
                games in the pipeline. Cabinets land when they pass playtest.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Facts strip */}
      <section className="my-12 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {facts.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5"
          >
            <div className="rounded-full bg-secondary p-2.5">
              <Icon className="h-4 w-4 text-terra" />
            </div>
            <p className="text-sm font-medium leading-relaxed">{text}</p>
          </div>
        ))}
      </section>
    </main>

      <SiteFooter />
    </div>
  );
};

export default Landing;
