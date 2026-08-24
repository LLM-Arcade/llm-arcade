import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { gameArt, type Game } from "@/hooks/useGames";

const GameTile = ({ game, index }: { game: Game; index: number }) => (
  <Link
    to={`/game/${game.slug}`}
    className="group fade-up relative overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10 transition-all duration-150 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    style={{ animationDelay: `${Math.min(index, 11) * 50}ms` }}
  >
    <img
      src={gameArt(game)}
      alt={game.title}
      loading="lazy"
      className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
    />
    {game.status === "published" ? (
      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest text-primary-foreground shadow-sm">
        <Play className="h-3 w-3 fill-current" />
        PLAY
      </span>
    ) : (
      <span className="absolute right-3 top-3 rounded-full bg-mustard px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest text-foreground shadow-sm">
        SOON
      </span>
    )}
    <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl bg-card/95 px-3.5 py-2.5 shadow-sm">
      <span className="truncate font-display text-sm font-bold">{game.title}</span>
      <span className="shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">
        {game.era.toUpperCase()}
      </span>
    </div>
  </Link>
);

export default GameTile;
