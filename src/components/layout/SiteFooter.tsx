import { Link } from "react-router-dom";
import { MadeWithDyad } from "@/components/made-with-dyad";

const SiteFooter = () => (
  <footer className="border-t border-border">
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
      <p className="font-pixel text-[10px] text-arcade-cream">
        NEON<span className="text-arcade-red">ARCADE</span>
      </p>
      <nav className="flex items-center gap-6 font-mono text-xs tracking-widest text-muted-foreground">
        <Link to="/faq" className="transition-colors hover:text-arcade-amber">
          FAQ
        </Link>
        <Link to="/playtest" className="transition-colors hover:text-arcade-amber">
          PLAYTEST
        </Link>
      </nav>
      <MadeWithDyad />
    </div>
  </footer>
);

export default SiteFooter;
