import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SiteSettings {
  launched: boolean;
  spotlight_game_id: string | null;
  slow_mode_seconds: number;
}

export const useSiteSettings = () =>
  useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("launched, spotlight_game_id, slow_mode_seconds")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as SiteSettings;
    },
    staleTime: 60_000,
  });
