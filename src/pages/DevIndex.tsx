// Dev-only cabinet index at /dev: every Track-A game in the registry,
// playable whether or not its DB row is published. This is the browsing
// surface for local playtests; production never mounts it.

import { Link } from "react-router-dom";
import { gameRegistry } from "@/games/registry";
import { Gamepad2 } from "lucide-react";

const TRACK_B = [
  { slug: "trailbound", path: "/games/trailbound.html" },
  { slug: "rockbuster", path: "/games/rockbuster.html" },
  { slug: "boulder-rush", path: "/games/boulder-rush.html" },
  { slug: "flap-hero", path: "/games/flap-hero.html" },
];

const DevIndex = () => (
  <div className="mx-auto max-w-4xl px-4 py-8">
    <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
      <Gamepad2 className="h-6 w-6 text-terra" />
      Dev playtest floor
    </h1>
    <p className="mt-1 text-sm text-muted-foreground">
      Every cabinet in the build, published or not. Local builds only.
    </p>

    <h2 className="mt-6 font-mono text-xs tracking-widest text-muted-foreground">
      TRACK A · IN-REPO ENGINES
    </h2>
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Object.keys(gameRegistry).map((slug) => (
        <Link
          key={slug}
          to={`/dev/${slug}`}
          className="rounded-xl bg-card px-4 py-3 text-sm font-semibold shadow-sm ring-1 ring-foreground/10 transition-colors hover:bg-secondary/70"
        >
          {slug}
        </Link>
      ))}
    </div>

    <h2 className="mt-6 font-mono text-xs tracking-widest text-muted-foreground">
      TRACK B · SELF-CONTAINED FILES
    </h2>
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {TRACK_B.map((g) => (
        <a
          key={g.slug}
          href={g.path}
          className="rounded-xl bg-card px-4 py-3 text-sm font-semibold shadow-sm ring-1 ring-foreground/10 transition-colors hover:bg-secondary/70"
        >
          {g.slug}
        </a>
      ))}
    </div>
  </div>
);

export default DevIndex;
