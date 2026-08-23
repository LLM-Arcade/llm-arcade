import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export type BadgeRarity = "bronze" | "silver" | "gold" | "neon";

const rarityStyles: Record<BadgeRarity, { ring: string; icon: string; label: string }> = {
  bronze: { ring: "border-[#B07B4F]", icon: "text-[#D9A272]", label: "text-[#D9A272]" },
  silver: { ring: "border-[#AEB6CC]", icon: "text-[#C9D0E3]", label: "text-[#C9D0E3]" },
  gold: { ring: "border-neon-amber", icon: "text-neon-amber", label: "text-neon-amber" },
  neon: {
    ring: "border-neon-pink shadow-[0_0_16px_hsl(var(--neon-pink)/0.5)]",
    icon: "text-neon-pink",
    label: "text-neon-pink",
  },
};

interface BadgeChipProps {
  name: string;
  rarity: BadgeRarity;
  icon: LucideIcon;
  className?: string;
}

const BadgeChip = ({ name, rarity, icon: Icon, className }: BadgeChipProps) => {
  const style = rarityStyles[rarity];
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center border-2 bg-card",
          style.ring,
        )}
        style={{
          clipPath:
            "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
        }}
      >
        <Icon className={cn("h-5 w-5", style.icon)} />
      </div>
      <div className="flex flex-col">
        <span className="font-display text-sm font-bold leading-tight">{name}</span>
        <span className={cn("text-xs uppercase tracking-widest", style.label)}>
          {rarity}
        </span>
      </div>
    </div>
  );
};

export default BadgeChip;
