import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/legacy-supabase";
import { markKnownPlayer } from "@/lib/known-player";
import { isCloudflareBackend } from "@/lib/backend-config";
import { arcadeData, arcadeRequest, type CloudflarePlayer } from "@/lib/arcade-api";
import { showError } from "@/utils/toast";
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/react";
import { setArcadeAccountTokenSource } from "@/lib/arcade-api";

export type Role = "player" | "playtester" | "moderator" | "admin";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string;
  role: Role;
  xp: number;
  level: number;
  streak_days: number;
  best_streak: number;
  last_play_date: string | null;
  created_at: string;
}

interface AuthContextValue {
  session: { user: Pick<User, "id" | "email"> } | null;
  user: Pick<User, "id" | "email"> | null;
  profile: Profile | null;
  /** true while the initial session or the signed-in user's profile loads */
  loading: boolean;
  signOut: () => Promise<void>;
  error?: string | null;
  refresh?: () => Promise<void>;
  isGuest?: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SupabaseAuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) markKnownPlayer();
      setSessionLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) markKnownPlayer();
      setSessionLoading(false);
      if (!newSession) {
        queryClient.removeQueries({ queryKey: ["profile"] });
      }
    });

    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    staleTime: 60_000,
  });

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile: profile ?? null,
    loading: sessionLoading || (!!userId && profileLoading),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const CloudflareAuthProvider = ({ children, getAccountToken, accountSignedIn = false, accountSignOut }: {
  children: ReactNode; getAccountToken?: () => Promise<string | null>;
  accountSignedIn?: boolean; accountSignOut?: () => Promise<void>;
}) => {
  const [player, setPlayer] = useState<CloudflarePlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const epoch = useRef(0);
  useLayoutEffect(() => setArcadeAccountTokenSource(getAccountToken), [getAccountToken]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = ++epoch.current;
    const initialize = async () => {
      if (accountSignedIn) await arcadeRequest("/auth/account", { method: "POST", body: "{}", signal });
      let data = await arcadeRequest<{ user: CloudflarePlayer } | null>("/auth/get-session", { signal });
      if (!data && !signal?.aborted && !accountSignedIn) {
        await arcadeRequest("/auth/guest", { method: "POST", body: "{}", signal });
        data = await arcadeRequest<{ user: CloudflarePlayer } | null>("/auth/get-session", { signal });
      }
      return data;
    };
    // Serialize first-visit creation across tabs where supported. The server
    // always derives score ownership from the cookie, never this UI state.
    const data = navigator.locks ? await navigator.locks.request("arcade-player-init", initialize) : await initialize();
    if (!signal?.aborted && current === epoch.current) {
      setPlayer(data?.user ?? null); setError(null);
      if (data?.user) markKnownPlayer();
    }
  }, [accountSignedIn]);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal)
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Sign-in is unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const user = player ? { id: player.id, email: player.email ?? undefined } : null;
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", player?.id], enabled: !!player,
    queryFn: async () => {
      const row = await arcadeData<CloudflarePlayer>("/me");
      return { id: row.id, username: row.username, display_name: row.name, avatar_url: row.image,
        bio: row.bio, role: row.role, xp: row.xp, level: row.level, streak_days: row.streak_days,
        best_streak: row.best_streak, last_play_date: row.last_play_date, created_at: row.createdAt } as Profile;
    }, staleTime: 60_000,
  });
  return <AuthContext.Provider value={{ user, session: user ? { user } : null, profile: profile ?? null, loading: loading || (!!player && profileLoading), error, refresh, isGuest: player?.isGuest,
    signOut: async () => {
      try {
        await arcadeRequest("/auth/sign-out", { method: "POST", body: "{}" });
        await accountSignOut?.();
        epoch.current++;
        setPlayer(null);
        queryClient.clear();
      } catch (error) { showError(error instanceof Error ? error.message : "Sign-out failed. Please retry."); }
    },
  }}>{children}</AuthContext.Provider>;
};

const ClerkLinkedAuthProvider = ({ children }: { children: ReactNode }) => {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const token = useCallback(async () => isLoaded && isSignedIn ? getToken() : null, [isLoaded, isSignedIn, getToken]);
  const leaveAccount = useCallback(async () => { await signOut(); }, [signOut]);
  return <CloudflareAuthProvider getAccountToken={token} accountSignedIn={Boolean(isLoaded && isSignedIn)}
    accountSignOut={isSignedIn ? leaveAccount : undefined}>{children}</CloudflareAuthProvider>;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  if (!isCloudflareBackend) return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return key ? <ClerkProvider publishableKey={key} signInUrl="/login" signUpUrl="/signup" afterSignOutUrl="/games">
    <ClerkLinkedAuthProvider>{children}</ClerkLinkedAuthProvider>
  </ClerkProvider> : <CloudflareAuthProvider>{children}</CloudflareAuthProvider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
