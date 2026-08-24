import { Link } from "react-router-dom";
import LevelRing from "@/components/progression/LevelRing";
import { useAuth } from "@/contexts/AuthContext";
import { authCta } from "@/lib/known-player";
import { levelProgress, LEVEL_CAP } from "@/lib/progression";
import { Flame } from "lucide-react";

/** "Your streak" card for the Arcade Home right rail. */
const StreakCard = () => {
  const { user, profile } = useAuth();

  if (!user || !profile) {
    const cta = authCta("/");
    return (
      <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10">
        <h3 className="font-mono text-xs tracking-widest text-muted-foreground">YOUR STREAK</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {cta.verb} to earn XP, keep a daily play streak, and collect badges.
        </p>
        <Link
          to={cta.to}
          className="mt-3.5 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {cta.verb}
        </Link>
      </div>
    );
  }

  const { level, pct, toNext } = levelProgress(profile.xp);

  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10">
      <div className="flex items-center gap-4">
        <LevelRing
          xp={profile.xp}
          avatarUrl={profile.avatar_url}
          fallback={profile.username[0] ?? "?"}
          size={64}
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{profile.display_name || profile.username}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {profile.xp.toLocaleString()} XP
            {level < LEVEL_CAP && ` · ${toNext.toLocaleString()} TO LV ${level + 1}`}
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div
          className="h-full rounded-full bg-terra transition-all"
          style={{ width: `${Math.max(4, pct * 100)}%` }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary/70 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Flame className={`h-4 w-4 ${profile.streak_days > 0 ? "text-terra" : "text-muted-foreground"}`} />
          {profile.streak_days > 0
            ? `${profile.streak_days}-day streak`
            : "No streak yet"}
        </span>
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
          BEST {profile.best_streak}d
        </span>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        Post one score a day to keep the flame lit.
      </p>
    </div>
  );
};

export default StreakCard;
