import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/legacy-supabase";
import { isCloudflareBackend } from "@/lib/backend-config";
import { arcadeData } from "@/lib/arcade-api";
import { useAuth, type Profile } from "@/contexts/AuthContext";
import type { BadgeRarity } from "@/components/arcade/BadgeChip";

export interface UserBadgeRow {
  badge_slug: string;
  detail: string;
  earned_at: string;
  badges: {
    slug: string;
    name: string;
    description: string;
    rarity: BadgeRarity;
    icon: string;
    sort_order: number;
  };
}

export interface TopScoreRow {
  game_id: string;
  slug: string;
  title: string;
  best_score: number;
  achieved_at: string;
  rank: number;
}

export interface ActivityRow {
  id: string;
  user_id: string;
  type: "achievement" | "badge" | "top_rank" | "level_up";
  game_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  games: { slug: string; title: string } | null;
}

export interface UserUnlockRow {
  unlocked_at: string;
  achievements: {
    name: string;
    xp: number;
    games: { slug: string; title: string } | null;
  };
}

export interface TickerScore {
  id: string;
  score: number;
  created_at: string;
  profiles: { username: string } | null;
  games: { slug: string; title: string; score_label: string } | null;
}

export const useProfileByUsername = (username: string) =>
  useQuery({
    queryKey: ["creator-profile", username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
  });

export const useUserBadges = (userId: string | undefined) =>
  useQuery({
    queryKey: ["user-badges", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_badges")
        .select("badge_slug, detail, earned_at, badges(slug, name, description, rarity, icon, sort_order)")
        .eq("user_id", userId!);
      if (error) throw error;
      const rows = (data ?? []) as unknown as UserBadgeRow[];
      return rows.sort((a, b) => a.badges.sort_order - b.badges.sort_order);
    },
  });

export const useUserTopScores = (userId: string | undefined) =>
  useQuery({
    queryKey: ["user-top-scores", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_top_scores", {
        p_user_id: userId!,
      });
      if (error) throw error;
      return data as TopScoreRow[];
    },
  });

export const useUserUnlocks = (userId: string | undefined) =>
  useQuery({
    queryKey: ["user-unlocks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_achievements")
        .select("unlocked_at, achievements(name, xp, games(slug, title))")
        .eq("user_id", userId!)
        .order("unlocked_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as UserUnlockRow[];
    },
  });

/** Activity feed — pass a userId for one profile, omit for the global feed. */
export const useActivity = (userId?: string, limit = 20) =>
  useQuery({
    queryKey: ["activity", userId ?? "global", limit],
    queryFn: async () => {
      let query = supabase
        .from("activity_events")
        .select(
          "*, profiles(username, display_name, avatar_url), games(slug, title)",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (userId) query = query.eq("user_id", userId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ActivityRow[];
    },
    staleTime: 15_000,
  });

export const useRecentScores = (limit = 14) =>
  useQuery({
    queryKey: ["recent-scores", limit],
    queryFn: async () => {
      if (isCloudflareBackend) return (await arcadeData<TickerScore[]>("/recent-scores")).slice(0, limit);
      const { data, error } = await supabase
        .from("scores")
        .select("id, score, created_at, profiles(username), games(slug, title, score_label)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as TickerScore[];
    },
    staleTime: 15_000,
  });

export const useFollowCounts = (userId: string | undefined) =>
  useQuery({
    queryKey: ["follow-counts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [followers, following] = await Promise.all([
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("followee_id", userId!),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", userId!),
      ]);
      if (followers.error) throw followers.error;
      if (following.error) throw following.error;
      return { followers: followers.count ?? 0, following: following.count ?? 0 };
    },
  });

export const useIsFollowing = (targetId: string | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-following", user?.id, targetId],
    enabled: !!user && !!targetId && user.id !== targetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user!.id)
        .eq("followee_id", targetId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
};

export const useToggleFollow = (targetId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (isFollowing: boolean) => {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user!.id)
          .eq("followee_id", targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: user!.id, followee_id: targetId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["is-following"] });
      queryClient.invalidateQueries({ queryKey: ["follow-counts", targetId] });
    },
  });
};
