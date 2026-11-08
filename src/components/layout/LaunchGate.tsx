import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import Landing from "@/pages/Landing";
import { isCloudflareBackend } from "@/lib/backend-config";

/**
 * Pre-launch gate: guests see the Coming Soon landing until
 * site_settings.launched is flipped. Any signed-in player gets the real
 * Arcade Home with a preview banner — the floor is already open to them.
 */
const LaunchGate = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading: authLoading } = useAuth();
  const { data, isLoading } = useSiteSettings();

  if (isLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="animate-pulse font-display text-xl font-extrabold tracking-tight text-muted-foreground">
          llm<span className="text-terra">arcade</span>
        </p>
      </div>
    );
  }

  if (data?.launched) return <>{children}</>;

  if (profile) {
    return (
      <>
        <div className="bg-mustard py-1.5 text-center font-mono text-[10px] font-medium tracking-widest text-foreground">
          {isCloudflareBackend ? "RECOVERY PREVIEW · NEW SCORES SAVE TO YOUR PLAYER CARD" : "PRE-LAUNCH PREVIEW · SCORES & STREAKS ALREADY COUNT"}
        </div>
        {children}
      </>
    );
  }

  return <Landing />;
};

export default LaunchGate;
