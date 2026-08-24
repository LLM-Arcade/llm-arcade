import { Link } from "react-router-dom";
import WaitlistForm from "@/components/arcade/WaitlistForm";
import SiteFooter from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bot, Trophy, Upload } from "lucide-react";
import {
  LAUNCH_LINEUP,
  TOTAL_LAUNCH_GAMES,
  gameArtPath,
  type RevealedGame,
} from "@/data/launch-lineup";

const facts = [
  { icon: Bot, text: "Every game coded end-to-end by an AI agent" },
  { icon: Trophy, text: "High scores, achievements & streaks that stick" },
  { icon: Upload, text: "Upload your own AI-built game after launch" },
];

const GameCard = ({ game, index }: { game: RevealedGame; index: number }) => (
  <div
    className={`group fade-up relative overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10 transition-all duration-150 hover:-translate-y-1 hover:shadow-lg ${
      game.featured ? "col-span-2 row-span-2" : ""
    }`}
    style={{ animationDelay: `${120 + index * 60}ms` }}
  >
    <img
      src={gameArtPath(game.slug)}
      alt={game.alt}
      loading="lazy"
      className="aspect-square h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
    />
    <span className="absolute right-3 top-3 rounded-full bg-mustard px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest text-foreground shadow-sm">
      SOON
    </span>
    <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl bg-card/95 px-3.5 py-2.5 shadow-sm">
      <span className={`truncate font-display font-bold ${game.featured ? "text-lg" : "text-sm"}`}>
        {game.title}
      </span>
      <span className="shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">
        {game.era.toUpperCase()}
      </span>
    </div>
  </div>
);

const Landing = () => (
  <div className="min-h-screen bg-background">
    {/* Header */}
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/brand/logo-mark.png"
            alt="Neon Arcade logo"
            className="h-9 w-9 rounded-full shadow-sm ring-1 ring-foreground/10"
          />
          <p className="font-display text-xl font-extrabold tracking-tight">
            neon<span className="text-terra">arcade</span>
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
            <Link to="/login">Sign in</Link>
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
          30 games. Zero human-written code. High scores that matter.
        </p>
        <div id="waitlist" className="fade-up scroll-mt-24 pt-1" style={{ animationDelay: "180ms" }}>
          <WaitlistForm />
        </div>
      </section>

      {/* Game wall */}
      <section className="pb-4">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight">The launch lineup</h2>
          <span className="font-mono text-xs tracking-widest text-muted-foreground">
            {LAUNCH_LINEUP.length} OF {TOTAL_LAUNCH_GAMES} REVEALED
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {LAUNCH_LINEUP.map((game, i) => (
            <GameCard key={game.slug} game={game} index={i} />
          ))}

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
              <p className="font-display text-3xl font-extrabold text-terra">100</p>
              <p className="mt-1 text-sm font-medium leading-snug text-foreground">
                games in the candidate catalog. 30 make opening night.
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

export default Landing;
