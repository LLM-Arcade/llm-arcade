import { Link } from "react-router-dom";
import AsciiRain from "@/components/arcade/AsciiRain";
import WaitlistForm from "@/components/arcade/WaitlistForm";
import SiteFooter from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/button";
import { Gamepad2, Joystick, Terminal, Rocket } from "lucide-react";

const teasers = [
  { icon: Joystick, era: "ARCADE-ERA", hue: "text-neon-cyan" },
  { icon: Gamepad2, era: "NES-ERA", hue: "text-neon-pink" },
  { icon: Terminal, era: "TERMINAL", hue: "text-neon-lime" },
];

const Landing = () => (
  <div className="min-h-screen bg-background">
    {/* Hero */}
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <AsciiRain className="absolute inset-0 h-full w-full" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <p
          className="fade-up mb-6 rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.25em] text-neon-cyan"
          style={{ animationDelay: "1.4s" }}
        >
          Insert coin soon
        </p>
        <h1
          className="fade-up font-display text-[40px] font-bold leading-none tracking-tight sm:text-[56px]"
          style={{ animationDelay: "1.6s" }}
        >
          NEON
          <span className="text-neon-violet text-glow-violet">ARCADE</span>
        </h1>
        <p
          className="fade-up mt-5 max-w-md text-lg text-muted-foreground"
          style={{ animationDelay: "1.8s" }}
        >
          30 games. Zero human-written code. Opening soon.
        </p>
        <div
          className="fade-up mt-8 flex w-full flex-col items-center gap-4"
          style={{ animationDelay: "2s" }}
        >
          <WaitlistForm />
          <Button
            asChild
            variant="ghost"
            className="rounded-full text-neon-cyan hover:bg-neon-cyan/10 hover:text-neon-cyan"
          >
            <Link to="/playtest">
              <Rocket className="mr-2 h-4 w-4" />
              Become a playtester
            </Link>
          </Button>
        </div>
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-xs text-muted-foreground">
        ▼ scroll
      </div>
    </section>

    {/* Teasers */}
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="mb-2 text-center font-display text-[28px] font-bold">
        What's in the cabinet?
      </h2>
      <p className="mb-10 text-center text-muted-foreground">
        Every game built end-to-end by an AI agent. Names redacted until opening night.
      </p>
      <div className="grid gap-6 sm:grid-cols-3">
        {teasers.map(({ icon: Icon, era, hue }) => (
          <div
            key={era}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all duration-150 hover:scale-[1.02] hover:glow-violet"
          >
            <div className="flex aspect-video items-center justify-center bg-secondary blur-[6px] transition-all duration-300 group-hover:blur-[3px]">
              <Icon className={`h-16 w-16 ${hue} opacity-60`} />
            </div>
            <div className="flex items-center justify-between p-4">
              <span className="font-display text-xl font-bold tracking-widest">???</span>
              <span className="rounded-sm border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">
                {era}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default Landing;
