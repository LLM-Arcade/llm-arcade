import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export type BadgeRarity = "bronze" | "silver" | "gold" | "neon";

const rarityStyles: Record<BadgeRarity, { ring: string; icon: string; label: string }> = {
  bronze: { ring: "border-[#B07B4F]", icon: "text-[#8C5A33]", label: "text-[#8C5A33]" },
  silver: { ring: "border-[#A9A399]", icon: "text-[#6F6A61]", label: "text-[#6F6A61]" },
  gold: { ring: "border-mustard", icon: "text-[#8F6400]", label: "text-[#8F6400]" },
  neon: { ring: "border-terra shadow-sm", icon: "text-terra", label: "text-terra" },
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
        <span className="text-sm font-semibold leading-tight">{name}</span>
        <span className={cn("font-mono text-[10px] uppercase tracking-widest", style.label)}>
          {rarity}
        </span>
      </div>
    </div>
  );
};

export default BadgeChip;
