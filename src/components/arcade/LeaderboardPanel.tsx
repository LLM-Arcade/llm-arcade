import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useLeaderboard, type LeaderboardPeriod } from "@/hooks/useLeaderboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import type { Game } from "@/hooks/useGames";

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "all", label: "All-time" },
];

// top-3 medallions: gold / silver / bronze — warm, not metallic-gaudy
const medallions = [
  "bg-mustard text-foreground",
  "bg-[#C9C2B4] text-foreground",
  "bg-[#C89B72] text-foreground",
];

const LeaderboardPanel = ({ game }: { game: Game }) => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const { data: rows, isLoading } = useLeaderboard(game.id, period);

  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors ${
                period === p.id
                  ? "bg-foreground text-background ring-foreground"
                  : "text-muted-foreground ring-foreground/10 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="hidden font-mono text-[10px] tracking-widest text-muted-foreground sm:block">
          {game.score_label.toUpperCase()}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="py-10 text-center">
          <p className="font-display text-lg font-bold">Nobody on the board yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            First score takes the crown.
          </p>
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-1">
          {rows.map((row, i) => {
            const isYou = user?.id === row.user_id;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                  isYou ? "bg-terra/5 ring-1 ring-terra/40" : "hover:bg-secondary/60"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                    i < 3 ? medallions[i] : "text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <Avatar className="h-8 w-8 ring-1 ring-foreground/10">
                  <AvatarImage src={row.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-secondary text-xs font-bold">
                    {row.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {row.display_name || row.username}
                    {isYou && (
                      <span className="ml-2 rounded-full bg-terra px-2 py-0.5 font-mono text-[9px] tracking-widest text-primary-foreground">
                        YOU
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    @{row.username}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold tabular-nums">
                    {row.best_score.toLocaleString()}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(row.achieved_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-4 text-center font-mono text-[10px] tracking-wider text-muted-foreground">
        DAILY &amp; WEEKLY ARE ROLLING 24H / 7D WINDOWS
      </p>
    </div>
  );
};

export default LeaderboardPanel;
