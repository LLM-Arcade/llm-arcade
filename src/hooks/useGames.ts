import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/legacy-supabase";
import { gameArtPath, type Era } from "@/data/launch-lineup";
import { isCloudflareBackend } from "@/lib/backend-config";
import { arcadeData, ArcadeApiError } from "@/lib/arcade-api";

export interface Game {
  id: string;
  slug: string;
  title: string;
  era: Era;
  genre: string;
  description: string;
  controls: string;
  ai_credit: string;
  track: "A" | "B";
  status: "coming_soon" | "published" | "archived";
  featured: boolean;
  play_count: number;
  score_label: string;
  score_cap: number;
  html_path: string | null;
  art_url: string | null;
  created_by: string | null;
  created_at: string;
}

/** Key art: Storage-hosted for uploaded games, /assets convention otherwise. */
export const gameArt = (game: Pick<Game, "slug" | "art_url">) =>
  game.art_url ?? gameArtPath(game.slug);

export const useGames = () =>
  useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      if (isCloudflareBackend) return (await arcadeData<Game[]>("/games")).map(game => ({ ...game, featured: Boolean(game.featured) }));
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .neq("status", "archived")
        .order("status", { ascending: false }) // published before coming_soon
        .order("featured", { ascending: false })
        .order("title");
      if (error) throw error;
      return data as Game[];
    },
    staleTime: 60_000,
  });

export const useGame = (slug: string) =>
  useQuery({
    queryKey: ["game", slug],
    queryFn: async () => {
      if (isCloudflareBackend) {
        try {
          const game = await arcadeData<Game>("/games/" + encodeURIComponent(slug));
          return { ...game, featured: Boolean(game.featured) };
        } catch (error) {
          if (error instanceof ArcadeApiError && error.status === 404) return null;
          throw error;
        }
      }
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data as Game | null) ?? null;
    },
  });
