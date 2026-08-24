import { toast } from "sonner";
import { Trophy } from "lucide-react";

/** The one confetti-free "stamp" moment: an achievement unlock toast. */
export const showAchievementToast = (name: string, xp: number) =>
  toast.custom(
    () => (
      <div className="flex w-80 max-w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-lg ring-1 ring-foreground/10">
        <div
          className="stamp-in flex h-11 w-11 shrink-0 items-center justify-center border-2 border-mustard bg-mustard/15"
          style={{
            clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
          }}
        >
          <Trophy className="h-5 w-5 text-[#8F6400]" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
            ACHIEVEMENT UNLOCKED
          </p>
          <p className="truncate font-display text-sm font-bold text-foreground">{name}</p>
          {xp > 0 && (
            <p className="font-mono text-xs font-medium text-olive">+{xp} XP</p>
          )}
        </div>
      </div>
    ),
    { duration: 5000 },
  );
