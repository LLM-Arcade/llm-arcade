import SiteFooter from "@/components/layout/SiteFooter";

/**
 * Post-launch Arcade Home. Placeholder until Phase 3
 * (Spotlight hero, rails, tickers) is built.
 */
const Home = () => (
  <div className="flex min-h-screen flex-col bg-background">
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        neon<span className="text-terra">arcade</span>
      </h1>
      <p className="mt-3 text-muted-foreground">
        The arcade floor is being wired up. Cabinets arriving shortly.
      </p>
    </main>
    <SiteFooter />
  </div>
);

export default Home;
