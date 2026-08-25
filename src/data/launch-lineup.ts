// Revealed games shown on the pre-launch landing wall.
// Key art lives at public/assets/games/<slug>.png (square, AI-generated).
// This seeds the real game registry in Phase 2 (src/games/registry.ts).

export type Era =
  | "Arcade"
  | "Atari"
  | "NES"
  | "SNES"
  | "Genesis"
  | "Amiga"
  | "DOS"
  | "PS1"
  | "Mobile"
  | "Original";

export const ERAS: Era[] = [
  "Arcade",
  "Atari",
  "NES",
  "SNES",
  "Genesis",
  "Amiga",
  "DOS",
  "PS1",
  "Mobile",
  "Original",
];

export interface RevealedGame {
  slug: string;
  title: string;
  era: Era;
  alt: string;
  featured?: boolean;
}


export const LAUNCH_LINEUP: RevealedGame[] = [
  {
    slug: "starfall-squadron",
    title: "Starfall Squadron",
    era: "Arcade",
    alt: "Alien squadron descending toward a lone fighter ship",
    featured: true,
  },
  { slug: "munch-maze", title: "Munch Maze", era: "Arcade", alt: "Round creature eating seeds in a hedge maze" },
  { slug: "rune-ruin", title: "Rune & Ruin", era: "Original", alt: "Torchlit stone stairwell descending past a glowing runestone" },
  { slug: "brickstorm", title: "Brickstorm", era: "Arcade", alt: "Ball smashing through a wall of bricks" },
  { slug: "rockbuster", title: "Rockbuster", era: "Arcade", alt: "Spaceship drifting among tumbling asteroids" },
  { slug: "boulder-rush", title: "Boulder Rush", era: "DOS", alt: "Miner digging tunnels past boulders and gems" },
  { slug: "hyper-circuit", title: "Hyper Circuit", era: "SNES", alt: "Hover car racing toward a sunset horizon" },
  { slug: "the-undervault", title: "The Undervault", era: "Original", alt: "Torch-lit dungeon staircase descending into darkness" },
  { slug: "flap-hero", title: "Flap Hero", era: "Mobile", alt: "Plump bird flying between tall pillars" },
  { slug: "sky-defense", title: "Sky Defense", era: "Arcade", alt: "Counter-rockets rising to intercept falling missiles over cities" },
  { slug: "gem-columns", title: "Gem Columns", era: "Genesis", alt: "Columns of gems falling and stacking in a pit" },
  { slug: "kickflip-city", title: "Kickflip City", era: "PS1", alt: "Skateboarder mid-kickflip over a stair rail" },
  { slug: "trailbound", title: "Trailbound", era: "DOS", alt: "Covered wagon crossing the plains toward mountains" },
];

export const gameArtPath = (slug: string) => `/assets/games/${slug}.png`;
