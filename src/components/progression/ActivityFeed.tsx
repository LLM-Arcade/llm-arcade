import { Link } from "react-router-dom";
import { useActivity, type ActivityRow } from "@/hooks/useProgression";
import { timeAgo } from "@/lib/progression";
import { Crown, Medal, Trophy, TrendingUp, type LucideIcon } from "lucide-react";

const typeMeta: Record<ActivityRow["type"], { icon: LucideIcon; classes: string }> = {
  achievement: { icon: Trophy, classes: "bg-mustard/20 text-[#8F6400]" },
  badge: { icon: Medal, classes: "bg-terra/15 text-terra" },
  top_rank: { icon: Crown, classes: "bg-olive/15 text-olive" },
  level_up: { icon: TrendingUp, classes: "bg-secondary text-muted-foreground" },
};

const sentence = (event: ActivityRow) => {
  const game = event.games ? (
    <Link to={`/game/${event.games.slug}`} className="font-semibold hover:text-terra">
      {event.games.title}
    </Link>
  ) : null;

  switch (event.type) {
    case "achievement":
      return (
        <>
          unlocked <span className="font-semibold">{String(event.data.name ?? "an achievement")}</span>
          {game ? <> in {game}</> : null}
        </>
      );
    case "badge":
      return (
        <>
          earned the <span className="font-semibold">{String(event.data.name ?? "?")}</span> badge
        </>
      );
    case "top_rank":
      return (
        <>
          took <span className="font-semibold">#1</span>
          {game ? <> on {game}</> : null} with{" "}
          <span className="font-mono font-semibold tabular-nums">
            {Number(event.data.score ?? 0).toLocaleString()}
          </span>
        </>
      );
    case "level_up":
      return (
        <>
          reached <span className="font-semibold">level {String(event.data.level ?? "?")}</span>
        </>
      );
  }
};

interface ActivityFeedProps {
  /** Omit for the global feed */
  userId?: string;
  /** Show actor names (global feed) */
  showActor?: boolean;
  limit?: number;
}

const ActivityFeed = ({ userId, showActor = false, limit = 20 }: ActivityFeedProps) => {
  const { data: events } = useActivity(userId, limit);

  if (!events || events.length === 0) {
    return (
      <p className="rounded-2xl bg-secondary/60 px-5 py-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
        Quiet on the floor — activity shows up here as it happens.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {events.map((event) => {
        const meta = typeMeta[event.type];
        const Icon = meta.icon;
        return (
          <li
            key={event.id}
            className="flex items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 shadow-sm ring-1 ring-foreground/10"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.classes}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-sm leading-snug">
              {showActor && event.profiles && (
                <>
                  <Link
                    to={`/creator/${event.profiles.username}`}
                    className="font-semibold hover:text-terra"
                  >
                    @{event.profiles.username}
                  </Link>{" "}
                </>
              )}
              {sentence(event)}
            </p>
            <span className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground">
              {timeAgo(event.created_at).toUpperCase()}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

export default ActivityFeed;
