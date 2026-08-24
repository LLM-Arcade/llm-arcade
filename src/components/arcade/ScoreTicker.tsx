import { useRecentScores } from "@/hooks/useProgression";
import { timeAgo } from "@/lib/progression";

const TickerItem = ({
  title,
  username,
  score,
  label,
  when,
}: {
  title: string;
  username: string;
  score: number;
  label: string;
  when: string;
}) => (
  <span className="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap px-5 font-mono text-xs tracking-wider">
    <span className="font-bold text-terra">{title.toUpperCase()}</span>
    <span className="text-muted-foreground">@{username}</span>
    <span className="font-bold tabular-nums">
      {score.toLocaleString()} {label.toUpperCase()}
    </span>
    <span className="text-muted-foreground">{when.toUpperCase()}</span>
    <span aria-hidden className="pl-5 text-border">
      ◆
    </span>
  </span>
);

/** Horizontal marquee of the latest scores across the arcade. */
const ScoreTicker = () => {
  const { data: scores } = useRecentScores();

  if (!scores || scores.length === 0) {
    return (
      <div className="rounded-full bg-card px-5 py-2.5 text-center font-mono text-xs tracking-widest text-muted-foreground shadow-sm ring-1 ring-foreground/10">
        LIVE SCORES LAND HERE THE MOMENT THEY'RE POSTED
      </div>
    );
  }

  const items = scores
    .filter((s) => s.games && s.profiles)
    .map((s) => (
      <TickerItem
        key={s.id}
        title={s.games!.title}
        username={s.profiles!.username}
        score={s.score}
        label={s.games!.score_label}
        when={timeAgo(s.created_at)}
      />
    ));

  const animate = items.length >= 5;

  return (
    <div
      className="overflow-hidden rounded-full bg-card py-2.5 shadow-sm ring-1 ring-foreground/10"
      aria-label="Latest scores"
    >
      {animate ? (
        <div className="ticker-track flex w-max">
          {items}
          {scores
            .filter((s) => s.games && s.profiles)
            .map((s) => (
              <TickerItem
                key={`${s.id}-dup`}
                title={s.games!.title}
                username={s.profiles!.username}
                score={s.score}
                label={s.games!.score_label}
                when={timeAgo(s.created_at)}
              />
            ))}
        </div>
      ) : (
        <div className="flex overflow-x-auto">{items}</div>
      )}
    </div>
  );
};

export default ScoreTicker;
