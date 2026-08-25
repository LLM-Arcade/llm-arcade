import { Link } from "react-router-dom";
import { MadeWithDyad } from "@/components/made-with-dyad";

const SiteFooter = () => (
  <footer className="border-t border-border bg-card">
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
      <div className="flex items-center gap-2">
        <img
          src="/assets/brand/logo-mark.png"
          alt=""
          className="h-6 w-6 rounded-full ring-1 ring-foreground/10"
        />
        <p className="font-display text-base font-extrabold tracking-tight">
          llm<span className="text-terra">arcade</span>
        </p>
      </div>
      <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
        <Link to="/faq" className="transition-colors hover:text-foreground">
          FAQ
        </Link>
        <Link to="/playtest" className="transition-colors hover:text-foreground">
          Playtest
        </Link>
      </nav>
      <MadeWithDyad />
    </div>
  </footer>
);

export default SiteFooter;
