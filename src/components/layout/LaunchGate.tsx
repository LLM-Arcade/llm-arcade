import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Landing from "@/pages/Landing";

/**
 * Pre-launch gate: guests see the Coming Soon landing until
 * site_settings.launched is flipped. Any signed-in player gets the real
 * Arcade Home with a preview banner — the floor is already open to them.
 */
const LaunchGate = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading: authLoading } = useAuth();

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

  if (isLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="animate-pulse font-display text-xl font-extrabold tracking-tight text-muted-foreground">
          neon<span className="text-terra">arcade</span>
        </p>
      </div>
    );
  }

  if (data?.launched) return <>{children}</>;

  if (profile) {
    return (
      <>
        <div className="bg-mustard py-1.5 text-center font-mono text-[10px] font-medium tracking-widest text-foreground">
          PRE-LAUNCH PREVIEW · SCORES &amp; STREAKS ALREADY COUNT
        </div>
        {children}
      </>
    );
  }

  return <Landing />;
};

export default LaunchGate;
