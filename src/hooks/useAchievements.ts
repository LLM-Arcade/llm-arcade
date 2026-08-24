import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { showAchievementToast } from "@/components/progression/AchievementToast";

export interface GameAchievement {
  id: string;
  slug: string;
  name: string;
  description: string;
  hint: string;
  xp: number;
  sort_order: number;
  unlock_count: number;
  player_count: number;
}

export const useGameAchievements = (gameId: string) =>
  useQuery({
    queryKey: ["game-achievements", gameId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_game_achievements", {
        p_game_id: gameId,
      });
      if (error) throw error;
      return data as GameAchievement[];
    },
    staleTime: 30_000,
  });

/** Map of achievement_id → unlocked_at for the signed-in user on one game. */
export const useMyUnlocks = (gameId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-unlocks", gameId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_achievements")
        .select("achievement_id, unlocked_at, achievements!inner(game_id)")
        .eq("user_id", user!.id)
        .eq("achievements.game_id", gameId);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        map[row.achievement_id as string] = row.unlocked_at as string;
      }
      return map;
    },
  });
};

interface UnlockResult {
  unlocked: boolean;
  name?: string;
  xp?: number;
  reason?: string;
}

/**
 * Server-validated unlock: the RPC checks the slug against the game's
 * approved manifest (achievements table) — games can't invent achievements.
 */
export const useUnlockAchievement = (gameId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const { data, error } = await supabase.rpc("unlock_achievement", {
        p_game_id: gameId,
        p_slug: slug,
      });
      if (error) throw error;
      return data as UnlockResult;
    },
    onSuccess: (result) => {
      if (!result?.unlocked) return;
      showAchievementToast(result.name ?? "Achievement", result.xp ?? 0);
      queryClient.invalidateQueries({ queryKey: ["game-achievements", gameId] });
      queryClient.invalidateQueries({ queryKey: ["my-unlocks", gameId] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
};
