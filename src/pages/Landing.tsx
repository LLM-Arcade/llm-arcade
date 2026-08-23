import { Link } from "react-router-dom";
import AsciiRain from "@/components/arcade/AsciiRain";
import WaitlistForm from "@/components/arcade/WaitlistForm";
import SiteFooter from "@/components/layout/SiteFooter";

const TICKER_ITEMS = [
  "SYSTEM ONLINE",
  "30 CABINETS IN PRODUCTION",
  "HUMAN CODERS: 0",
  "HIGH SCORES WILL BE KEPT FOREVER",
  "INSERT COIN",
];

const teasers = [
  { glyph: "▲", era: "ARCADE", color: "text-arcade-red" },
  { glyph: "◆", era: "NES-ERA", color: "text-arcade-amber" },
  { glyph: ">_", era: "TERMINAL", color: "text-arcade-green" },
];

const stats = [
  { value: "30", label: "GAMES AT LAUNCH" },
  { value: "100", label: "CANDIDATE CATALOG" },
  { value: "0", label: "HUMAN-WRITTEN LINES" },
];

const Ticker = () => {
  const row = TICKER_ITEMS.join("  ···  ") + "  ···  ";
  return (
    <div className="overflow-hidden border-b border-border bg-card py-2">
      <div className="flex w-max animate-ticker whitespace-nowrap font-mono text-xs tracking-[0.2em] text-arcade-amber">
        <span>{row}</span>
        <span aria-hidden="true">{row}</span>
      </div>
    </div>
  );
};

const Landing = () => (
  <div className="min-h-screen bg-background">
    <Ticker />

    {/* Hero — attract mode */}
    <section className="relative flex min-h-[88vh] flex-col items-center justify-center overflow-hidden px-6">
      <AsciiRain className="absolute inset-0 h-full w-full opacity-70" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <h1
          className="fade-up font-pixel text-2xl leading-relaxed text-arcade-cream text-shadow-pixel sm:text-4xl md:text-5xl"
          style={{ animationDelay: "1.4s" }}
        >
          NEON
          <br />
          ARCADE
        </h1>
        <p
          className="fade-up mt-8 font-mono text-sm tracking-[0.2em] text-muted-foreground sm:text-base"
          style={{ animationDelay: "1.7s" }}
        >
          30 GAMES · ZERO HUMAN-WRITTEN CODE
        </p>
        <p
          className="fade-up mt-6 font-pixel text-xs text-arcade-amber"
          style={{ animationDelay: "2s" }}
        >
          <span className="animate-blink">OPENING SOON</span>
        </p>
        <div
          className="fade-up mt-10 flex w-full flex-col items-center gap-5"
          style={{ animationDelay: "2.2s" }}
        >
          <WaitlistForm />
          <Link
            to="/playtest"
            className="font-mono text-sm tracking-widest text-arcade-green transition-colors hover:text-arcade-cream"
          >
            ► BECOME A PLAYTESTER
          </Link>
        </div>
      </div>
    </section>

    {/* Stats strip */}
    <section className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-4xl grid-cols-3 divide-x divide-border">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 px-2 py-6 text-center">
            <span className="font-pixel text-xl text-arcade-red sm:text-3xl">{s.value}</span>
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground sm:text-xs">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>

    {/* Teaser cabinets */}
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="font-display text-2xl uppercase tracking-tight sm:text-3xl">
        What's in the cabinet?
      </h2>
      <div className="mt-2 h-1 w-16 rounded-full bg-arcade-red" />
      <p className="mt-4 max-w-lg text-muted-foreground">
        Every game built end-to-end by an AI agent. Names stay redacted until
        opening night.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {teasers.map(({ glyph, era, color }) => (
          <div
            key={era}
            className="group overflow-hidden rounded-2xl border-2 border-border bg-card transition-transform duration-150 hover:-translate-y-1 hover:shadow-hard-red"
          >
            {/* Marquee strip */}
            <div className="flex items-center justify-center bg-arcade-red py-2">
              <span className="font-pixel text-[10px] text-background">? ? ?</span>
            </div>
            {/* CRT screen */}
            <div className="scanlines relative flex aspect-video items-center justify-center bg-[hsl(26,18%,5%)]">
              <span
                className={`font-pixel text-4xl ${color} opacity-50 blur-[5px] transition-all duration-300 group-hover:blur-[2px] group-hover:opacity-80`}
              >
                {glyph}
              </span>
            </div>
            {/* Control panel */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-mono text-xs tracking-widest text-muted-foreground">
                {era}
              </span>
              <span className="h-3 w-3 rounded-full bg-arcade-amber shadow-hard-sm" />
            </div>
          </div>
        ))}
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default Landing;
