// Progression helpers. The level curve MUST mirror public.level_for_xp in the
// database: level = min(50, floor(sqrt(xp / 40)) + 1).

import {
  Award,
  Coins,
  Compass,
  Flame,
  Medal,
  Moon,
  Trophy,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const LEVEL_CAP = 50;

export const levelForXp = (xp: number): number =>
  Math.min(LEVEL_CAP, Math.floor(Math.sqrt(Math.max(xp, 0) / 40)) + 1);

/** Total XP required to reach a level. */
export const xpForLevel = (level: number): number => 40 * (level - 1) ** 2;

export const levelProgress = (xp: number) => {
  const level = levelForXp(xp);
  if (level >= LEVEL_CAP) return { level, pct: 1, into: 0, toNext: 0 };
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    pct: Math.min(1, (xp - floor) / (next - floor)),
    into: xp - floor,
    toNext: next - xp,
  };
};

const BADGE_ICONS: Record<string, LucideIcon> = {
  coins: Coins,
  compass: Compass,
  flame: Flame,
  trophy: Trophy,
  medal: Medal,
  moon: Moon,
  wrench: Wrench,
};

export const badgeIcon = (name: string): LucideIcon => BADGE_ICONS[name] ?? Award;

export const timeAgo = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
};
