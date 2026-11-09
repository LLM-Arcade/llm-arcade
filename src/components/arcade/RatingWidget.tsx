import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/legacy-supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useGameSocialSummary } from "@/hooks/useGameSocialSummary";
import { isCloudflareBackend } from "@/lib/backend-config";
import { showError } from "@/utils/toast";
import { Star } from "lucide-react";
import type { Game } from "@/hooks/useGames";

interface RatingRow {
  user_id: string;
  rating: number;
}

const RatingWidget = ({ game }: { game: Game }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(0);
  const { data: summary } = useGameSocialSummary(game.id);

  const { data: ratings } = useQuery({
    queryKey: ["ratings", game.id],
    enabled: !isCloudflareBackend,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ratings")
        .select("user_id, rating")
        .eq("game_id", game.id);
      if (error) throw error;
      return data as RatingRow[];
    },
  });

  const count = isCloudflareBackend ? summary?.rating_count ?? 0 : ratings?.length ?? 0;
  const average = isCloudflareBackend
    ? summary?.rating_average ?? 0
    : count ? ratings!.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  const mine = isCloudflareBackend
    ? user ? summary?.player_rating : undefined
    : user ? ratings?.find((r) => r.user_id === user.id)?.rating : undefined;

  const rate = useMutation({
    mutationFn: async (rating: number) => {
      const { error } = await supabase.from("ratings").upsert({
        game_id: game.id,
        user_id: user!.id,
        rating,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: [isCloudflareBackend ? "game-social-summary" : "ratings", game.id],
    }),
    onError: () => showError("Couldn't save your rating."),
  });

  const displayed = hovered || mine || Math.round(average);

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-muted-foreground">RATING</p>
      <div
        className="mt-2 flex items-center gap-1"
        onMouseLeave={() => setHovered(0)}
        role="radiogroup"
        aria-label={`Rate ${game.title}`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={mine === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHovered(n)}
            onClick={() => {
              if (!user) {
                showError("Sign in to rate games.");
                return;
              }
              rate.mutate(n);
            }}
            className="rounded-full p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={`h-6 w-6 transition-colors ${
                n <= displayed
                  ? "fill-mustard text-mustard"
                  : "text-border"
              }`}
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {count === 0 ? (
          "No ratings yet"
        ) : (
          <>
            <span className="font-mono font-bold text-foreground">
              {average.toFixed(1)}
            </span>{" "}
            · {count} rating{count > 1 ? "s" : ""}
          </>
        )}
        {mine && <span className="ml-1.5 text-olive">· you rated {mine}★</span>}
      </p>
    </div>
  );
};

export default RatingWidget;
