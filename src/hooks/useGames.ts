import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Era } from "@/data/launch-lineup";

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
  created_by: string | null;
  created_at: string;
}

export const useGames = () =>
  useQuery({
    queryKey: ["games"],
    queryFn: async () => {
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
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data as Game | null) ?? null;
    },
  });
