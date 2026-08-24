import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { authCta } from "@/lib/known-player";
import { useGameAchievements, useMyUnlocks } from "@/hooks/useAchievements";
import type { Game } from "@/hooks/useGames";
import { Loader2, Lock, Trophy } from "lucide-react";

const hexClip = {
  clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
};

const globalPct = (unlocks: number, players: number): string | null => {
  if (players <= 0) return null;
  const pct = (unlocks / players) * 100;
  if (pct === 0) return "No one has this yet";
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}% of players have this`;
};

const AchievementsPanel = ({ game }: { game: Game }) => {
  const { user } = useAuth();
  const { data: achievements, isLoading } = useGameAchievements(game.id);
  const { data: myUnlocks } = useMyUnlocks(game.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl bg-card py-16 shadow-sm ring-1 ring-foreground/10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!achievements || achievements.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-foreground/10">
        <Trophy className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">No achievements wired up yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This cabinet's manifest hasn't been approved — check back soon.
        </p>
      </div>
    );
  }

  const unlockedCount = achievements.filter((a) => myUnlocks?.[a.id]).length;

  return (
    <div className="flex flex-col gap-3">
      {user ? (
        <p className="font-mono text-xs tracking-widest text-muted-foreground">
          {unlockedCount} / {achievements.length} UNLOCKED
        </p>
      ) : (
        <p className="rounded-xl bg-mustard/15 px-4 py-2.5 text-sm font-medium">
          <Link to={authCta(`/game/${game.slug}`).to} className="font-semibold underline underline-offset-2 hover:text-terra">
            {authCta().verb}
          </Link>{" "}
          to track your unlocks — achievements earned as a guest aren't recorded.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {achievements.map((a) => {
          const unlockedAt = myUnlocks?.[a.id];
          const pct = globalPct(a.unlock_count, a.player_count);
          return (
            <div
              key={a.id}
              className={`flex items-start gap-3.5 rounded-2xl p-4 shadow-sm ring-1 ring-foreground/10 ${
                unlockedAt ? "bg-card" : "bg-secondary/50"
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center border-2 ${
                  unlockedAt
                    ? "border-mustard bg-mustard/15"
                    : "border-border bg-muted"
                }`}
                style={hexClip}
              >
                {unlockedAt ? (
                  <Trophy className="h-5 w-5 text-[#8F6400]" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className={`font-semibold ${unlockedAt ? "" : "text-muted-foreground"}`}>
                    {a.name}
                  </p>
                  <span className="font-mono text-[10px] tracking-widest text-olive">
                    +{a.xp} XP
                  </span>
                </div>
                <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                  {unlockedAt ? a.description || a.hint : a.hint}
                </p>
                <p className="mt-1.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                  {unlockedAt
                    ? `UNLOCKED ${new Date(unlockedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      }).toUpperCase()}`
                    : (pct ?? "Awaiting its first player").toUpperCase()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AchievementsPanel;
