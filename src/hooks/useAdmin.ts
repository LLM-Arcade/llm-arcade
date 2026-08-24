// Admin dashboard data + mutations. Every write goes through a SECURITY
// DEFINER RPC that re-checks the admin role server-side — the client role
// grant here is only convenience, never the security boundary.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Game } from "@/hooks/useGames";
import type { GameSubmission } from "@/hooks/useSubmissions";
import type { Role } from "@/contexts/AuthContext";
import { showError, showSuccess } from "@/utils/toast";

export type AdminSubmission = GameSubmission & {
  profiles: { username: string } | null;
};

export const usePendingSubmissions = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin-submissions"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_submissions")
        .select("*, profiles:user_id(username)")
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      return data as AdminSubmission[];
    },
  });

export const useAdminGames = () =>
  useQuery({
    queryKey: ["admin-games"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .order("status")
        .order("title");
      if (error) throw error;
      return data as Game[];
    },
  });

export interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: Role;
  xp: number;
  level: number;
  created_at: string;
}

export const useAdminUsers = (search: string) =>
  useQuery({
    queryKey: ["admin-users", search],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, role, xp, level, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (search.trim()) query = query.ilike("username", `%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as AdminUser[];
    },
  });

export interface PlaytestApplication {
  id: string;
  name: string;
  email: string;
  devices: string[];
  hours_per_week: string;
  favorite_eras: string[];
  status: "pending" | "approved" | "declined";
  created_at: string;
}

export const usePlaytestApplications = () =>
  useQuery({
    queryKey: ["admin-playtest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playtest_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PlaytestApplication[];
    },
  });

export const useWaitlist = () =>
  useQuery({
    queryKey: ["admin-waitlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist")
        .select("email, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as { email: string; created_at: string }[];
    },
  });

/** Wraps an admin RPC call in a mutation with toasts + cache invalidation. */
const useAdminRpc = <TArgs,>(
  rpc: (args: TArgs) => Promise<string | null>,
  invalidate: string[][],
  successMessage: (result: string | null) => string,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rpc,
    onSuccess: (result) => {
      showSuccess(successMessage(result));
      for (const key of invalidate) queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error: Error) => showError(error.message),
  });
};

export const useReviewSubmission = () =>
  useAdminRpc(
    async (args: { id: string; approve: boolean; note: string }) => {
      const { error } = await supabase.rpc("admin_review_submission", {
        p_submission_id: args.id,
        p_approve: args.approve,
        p_note: args.note,
      });
      if (error) throw error;
      return args.approve ? "approved" : "rejected";
    },
    [["admin-submissions"], ["admin-games"], ["games"], ["game"], ["my-submissions"]],
    (r) => (r === "approved" ? "Approved — the cabinet is live." : "Rejected with reason."),
  );

export const useWipeScores = () =>
  useAdminRpc(
    async (args: { gameId: string }) => {
      const { data, error } = await supabase.rpc("admin_wipe_scores", {
        p_game_id: args.gameId,
      });
      if (error) throw error;
      return String(data ?? 0);
    },
    [["admin-games"], ["leaderboard"], ["recent-scores"]],
    (count) => `Wiped ${count} score${count === "1" ? "" : "s"}.`,
  );

export const useSetRole = () =>
  useAdminRpc(
    async (args: { userId: string; role: Role }) => {
      const { error } = await supabase.rpc("admin_set_role", {
        p_user_id: args.userId,
        p_role: args.role,
      });
      if (error) throw error;
      return args.role;
    },
    [["admin-users"]],
    (role) => `Role updated to ${role}.`,
  );

export const useUpdateGame = () =>
  useAdminRpc(
    async (args: { gameId: string; status?: string; featured?: boolean }) => {
      const { error } = await supabase.rpc("admin_update_game", {
        p_game_id: args.gameId,
        p_status: args.status ?? null,
        p_featured: args.featured ?? null,
      });
      if (error) throw error;
      return null;
    },
    [["admin-games"], ["games"]],
    () => "Game updated.",
  );

export const useSetSpotlight = () =>
  useAdminRpc(
    async (args: { gameId: string | null }) => {
      const { error } = await supabase.rpc("admin_set_spotlight", {
        p_game_id: args.gameId,
      });
      if (error) throw error;
      return args.gameId;
    },
    [["site-settings"]],
    (id) => (id ? "Spotlight set." : "Spotlight cleared — back to automatic."),
  );

export const useSetLaunched = () =>
  useAdminRpc(
    async (args: { launched: boolean }) => {
      const { error } = await supabase.rpc("admin_set_launched", {
        p_launched: args.launched,
      });
      if (error) throw error;
      return String(args.launched);
    },
    [["site-settings"]],
    (v) => (v === "true" ? "The arcade is OPEN. 🎉" : "Gate closed — back to pre-launch."),
  );

export const useReviewPlaytest = () =>
  useAdminRpc(
    async (args: { id: string; approve: boolean }) => {
      const { data, error } = await supabase.rpc("admin_review_playtest", {
        p_application_id: args.id,
        p_approve: args.approve,
      });
      if (error) throw error;
      return String(data ?? "");
    },
    [["admin-playtest"], ["admin-users"]],
    (result) =>
      result.startsWith("approved (no account")
        ? "Approved — they haven't signed up yet, grant the role once they do."
        : result === "approved"
          ? "Approved — playtester role granted."
          : "Application declined.",
  );
