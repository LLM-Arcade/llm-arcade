import { Link } from "react-router-dom";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";

/**
 * Post-launch Arcade Home. Placeholder until Phase 3
 * (Spotlight hero, rails, tickers) is built.
 */
const Home = () => (
  <div className="flex min-h-screen flex-col bg-background">
    <SiteHeader />
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="fade-up font-display text-4xl font-extrabold tracking-tight">
        neon<span className="text-terra">arcade</span>
      </h1>
      <p className="fade-up mt-3 text-muted-foreground" style={{ animationDelay: "60ms" }}>
        The arcade floor is being wired up — the first cabinet is live.
      </p>
      <Link
        to="/games"
        className="fade-up mt-6 rounded-full bg-primary px-7 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        style={{ animationDelay: "120ms" }}
      >
        Hit the game floor
      </Link>
    </main>
    <SiteFooter />
  </div>
);

export default Home;
