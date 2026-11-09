import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { isCloudflareBackend } from "@/lib/backend-config";
import { supabase } from "@/lib/legacy-supabase";

interface GameSocialSummary {
  favorite_count: number;
  is_favorite: boolean;
  rating_count: number;
  rating_average: number;
  player_rating: number | null;
}

export function useGameSocialSummary(gameId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["game-social-summary", gameId, user?.id ?? null],
    enabled: isCloudflareBackend,
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      const { data, error } = await supabase.rpc("get_game_social_summary", {
        p_game_id: gameId,
      });
      signal.throwIfAborted();
      if (error) throw error;
      return data as GameSocialSummary;
    },
  });
}
