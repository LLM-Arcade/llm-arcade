import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Landing from "@/pages/Landing";

/**
 * Pre-launch gate: shows the Coming Soon landing until
 * site_settings.launched is flipped. Role/playtester bypass
 * arrives with the auth phase.
 */
const LaunchGate = ({ children }: { children: React.ReactNode }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("launched")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="animate-pulse font-pixel text-sm text-muted-foreground">
          NEON<span className="text-arcade-red">ARCADE</span>
        </p>
      </div>
    );
  }

  if (!data?.launched) return <Landing />;

  return <>{children}</>;
};

export default LaunchGate;
