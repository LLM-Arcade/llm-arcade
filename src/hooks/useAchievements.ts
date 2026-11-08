import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/legacy-supabase";
import { useAuth } from "@/contexts/AuthContext";
import { showAchievementToast } from "@/components/progression/AchievementToast";
import { isCloudflareBackend } from "@/lib/backend-config";
import { unlockPlayerAchievement } from "@/lib/arcade-api";
import type { AchievementIntent } from "@/lib/player-intent";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (intent: AchievementIntent) => {
      if (isCloudflareBackend) {
        return unlockPlayerAchievement<UnlockResult>(intent.playerId, intent.gameId, intent.slug);
      }
      const { data, error } = await supabase.rpc("unlock_achievement", {
        p_game_id: intent.gameId,
        p_slug: intent.slug,
      });
      if (error) throw error;
      return data as UnlockResult;
    },
    onSuccess: (result, intent) => {
      if (!result?.unlocked) return;
      if (intent.playerId === user?.id && intent.gameId === gameId) showAchievementToast(result.name ?? "Achievement", result.xp ?? 0);
      queryClient.invalidateQueries({ queryKey: ["game-achievements", intent.gameId] });
      queryClient.invalidateQueries({ queryKey: ["my-unlocks", intent.gameId] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
};
