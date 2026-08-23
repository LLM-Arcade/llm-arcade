import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LeaderboardPeriod = "daily" | "weekly" | "all";

export interface LeaderboardRow {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  best_score: number;
  achieved_at: string;
}

const DAY_MS = 86_400_000;

const sinceFor = (period: LeaderboardPeriod): string | null => {
  if (period === "daily") return new Date(Date.now() - DAY_MS).toISOString();
  if (period === "weekly") return new Date(Date.now() - 7 * DAY_MS).toISOString();
  return null;
};

/** Best score per player (rolling 24h / 7d windows, or all-time). */
export const useLeaderboard = (gameId: string, period: LeaderboardPeriod) =>
  useQuery({
    queryKey: ["leaderboard", gameId, period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_leaderboard", {
        p_game_id: gameId,
        p_since: sinceFor(period),
      });
      if (error) throw error;
      return data as LeaderboardRow[];
    },
    staleTime: 15_000,
  });
