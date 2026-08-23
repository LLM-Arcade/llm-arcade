import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { showError } from "@/utils/toast";
import { Heart } from "lucide-react";
import type { Game } from "@/hooks/useGames";

const FavoriteButton = ({ game }: { game: Game }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites } = useQuery({
    queryKey: ["favorites", game.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("user_id")
        .eq("game_id", game.id);
      if (error) throw error;
      return data as { user_id: string }[];
    },
  });

  const count = favorites?.length ?? 0;
  const mine = !!user && !!favorites?.some((f) => f.user_id === user.id);

  const toggle = useMutation({
    mutationFn: async () => {
      if (mine) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("game_id", game.id)
          .eq("user_id", user!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ game_id: game.id, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites", game.id] }),
    onError: () => showError("Couldn't update your favorites."),
  });

  return (
    <button
      type="button"
      aria-pressed={mine}
      onClick={() => {
        if (!user) {
          showError("Sign in to favorite games.");
          return;
        }
        toggle.mutate();
      }}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-all ${
        mine
          ? "bg-terra/10 text-terra ring-terra/40"
          : "text-muted-foreground ring-foreground/10 hover:text-foreground"
      }`}
    >
      <Heart
        className={`h-4 w-4 transition-transform ${
          mine ? "scale-110 fill-terra text-terra" : ""
        }`}
      />
      {mine ? "Favorited" : "Favorite"}
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </button>
  );
};

export default FavoriteButton;
