import ArcadeImage from "@/components/arcade/ArcadeImage";
// Admin games management: status, featured, spotlight picker, score wipes.

import {
  useAdminGames,
  useSetSpotlight,
  useUpdateGame,
  useWipeScores,
} from "@/hooks/useAdmin";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { gameArt, type Game } from "@/hooks/useGames";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Eraser, Loader2, Sparkles } from "lucide-react";

const GameRow = ({ game, isSpotlight }: { game: Game; isSpotlight: boolean }) => {
  const updateGame = useUpdateGame();
  const setSpotlight = useSetSpotlight();
  const wipe = useWipeScores();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3.5 shadow-sm ring-1 ring-foreground/10">
      <ArcadeImage
        src={gameArt(game)}
        alt=""
        loading="lazy"
        className="h-12 w-12 rounded-xl object-cover ring-1 ring-foreground/10"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">
          {game.title}
          <span className="ml-2 font-mono text-[10px] font-normal tracking-widest text-muted-foreground">
            {game.era.toUpperCase()} · TRACK {game.track}
          </span>
        </p>
        <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
          {game.play_count.toLocaleString()} plays · cap {game.score_cap.toLocaleString()}
        </p>
      </div>

      <Select
        value={game.status}
        onValueChange={(status) => updateGame.mutate({ gameId: game.id, status })}
      >
        <SelectTrigger className="h-9 w-36 rounded-full border-border bg-card font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="coming_soon" className="rounded-lg font-mono text-xs">COMING SOON</SelectItem>
          <SelectItem value="published" className="rounded-lg font-mono text-xs">PUBLISHED</SelectItem>
          <SelectItem value="archived" className="rounded-lg font-mono text-xs">ARCHIVED</SelectItem>
        </SelectContent>
      </Select>

      <label className="flex items-center gap-1.5">
        <Switch
          checked={game.featured}
          onCheckedChange={(featured) => updateGame.mutate({ gameId: game.id, featured })}
          className="data-[state=checked]:bg-terra"
        />
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground">FEAT</span>
      </label>

      <Button
        variant={isSpotlight ? "default" : "outline"}
        size="sm"
        disabled={game.status !== "published" && !isSpotlight}
        onClick={() => setSpotlight.mutate({ gameId: isSpotlight ? null : game.id })}
        className={`h-9 gap-1.5 rounded-full text-xs font-semibold ${
          isSpotlight
            ? "bg-mustard text-foreground hover:bg-mustard/80"
            : "border-border"
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isSpotlight ? "Spotlight ✓" : "Spotlight"}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={wipe.isPending}
            className="h-9 gap-1.5 rounded-full border-destructive/40 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {wipe.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eraser className="h-3.5 w-3.5" />
            )}
            Wipe scores
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Wipe every score on {game.title}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deletes the entire leaderboard for this game. XP already granted
              stays granted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => wipe.mutate({ gameId: game.id })}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Wipe the board
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const GamesPanel = () => {
  const { data: games, isLoading } = useAdminGames();
  const { data: settings } = useSiteSettings();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-muted-foreground">
        Spotlight overrides the automatic featured/most-played pick on the
        Arcade Home hero. Click an active spotlight to clear it.
      </p>
      {(games ?? []).map((game) => (
        <GameRow
          key={game.id}
          game={game}
          isSpotlight={settings?.spotlight_game_id === game.id}
        />
      ))}
    </div>
  );
};

export default GamesPanel;
