import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { levelProgress } from "@/lib/progression";

interface LevelRingProps {
  xp: number;
  avatarUrl: string | null;
  fallback: string;
  /** Outer diameter in px */
  size?: number;
}

/** Avatar wrapped in a level-progress ring with a level chip. */
const LevelRing = ({ xp, avatarUrl, fallback, size = 88 }: LevelRingProps) => {
  const { level, pct } = levelProgress(xp);
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const inset = Math.round(size * 0.11);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="hsl(var(--terra))"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      <Avatar
        className="absolute"
        style={{ inset, width: size - inset * 2, height: size - inset * 2 }}
      >
        <AvatarImage src={avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="bg-terra font-display font-bold text-primary-foreground">
          {fallback.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-background shadow-sm">
        LV {level}
      </span>
    </div>
  );
};

export default LevelRing;
