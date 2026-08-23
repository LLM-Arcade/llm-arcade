import { Link } from "react-router-dom";
import { MadeWithDyad } from "@/components/made-with-dyad";

const SiteFooter = () => (
  <footer className="border-t border-border/60">
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
      <p className="font-display text-sm font-bold tracking-wide">
        NEON<span className="text-neon-cyan">ARCADE</span>
      </p>
      <nav className="flex items-center gap-6 text-sm text-muted-foreground">
        <Link to="/faq" className="transition-colors hover:text-neon-cyan">
          FAQ
        </Link>
        <Link to="/playtest" className="transition-colors hover:text-neon-cyan">
          Playtest
        </Link>
      </nav>
      <MadeWithDyad />
    </div>
  </footer>
);

export default SiteFooter;
