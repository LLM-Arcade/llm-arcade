import BadgeChip from "@/components/arcade/BadgeChip";
import { useUserBadges } from "@/hooks/useProgression";
import { badgeIcon, timeAgo } from "@/lib/progression";

/** Horizontally scrollable shelf of a player's earned badges. */
const BadgeCase = ({ userId }: { userId: string }) => {
  const { data: badges } = useUserBadges(userId);

  if (!badges || badges.length === 0) {
    return (
      <p className="rounded-2xl bg-secondary/60 px-5 py-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
        The badge case is empty — badges land the moment they're earned.
      </p>
    );
  }

  return (
    <div className="flex gap-6 overflow-x-auto rounded-2xl bg-card px-5 py-4 shadow-sm ring-1 ring-foreground/10">
      {badges.map((b) => (
        <div
          key={b.badge_slug}
          className="shrink-0"
          title={`${b.badges.description}${b.detail ? ` — ${b.detail}` : ""} (${timeAgo(b.earned_at)})`}
        >
          <BadgeChip
            name={b.badges.name}
            rarity={b.badges.rarity}
            icon={badgeIcon(b.badges.icon)}
          />
        </div>
      ))}
    </div>
  );
};

export default BadgeCase;
