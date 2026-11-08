// Creator side of the upload pipeline: my submissions + the submit mutation
// (uploads files to the public `games` Storage bucket, then inserts a
// pending game_submissions row for the admin review queue).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/legacy-supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Era } from "@/data/launch-lineup";

export interface ManifestEntry {
  slug: string;
  name: string;
  hint: string;
  xp: number;
}

export interface SubmissionChecklist {
  ready: boolean;
  score: boolean;
  achievement: boolean;
  save: boolean;
}

export interface SubmissionMeta {
  slug: string;
  title: string;
  era: Era;
  genre: string;
  description: string;
  controls: string;
  ai_credit: string;
  score_label: string;
  score_cap: number;
}

export interface GameSubmission extends SubmissionMeta {
  id: string;
  user_id: string;
  game_id: string | null;
  manifest: ManifestEntry[];
  checklist: SubmissionChecklist;
  html_path: string;
  art_path: string | null;
  version: number;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
}

export const storagePublicUrl = (path: string) =>
  supabase.storage.from("games").getPublicUrl(path).data.publicUrl;

export const useMySubmissions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-submissions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_submissions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as GameSubmission[];
    },
  });
};

export interface SubmitGamePayload {
  meta: SubmissionMeta;
  manifest: ManifestEntry[];
  checklist: SubmissionChecklist;
  htmlFile: File;
  artFile: File | null;
  /** Set when this is a new version of an existing published game */
  gameId: string | null;
  version: number;
}

export const useSubmitGame = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SubmitGamePayload) => {
      const uid = user!.id;
      const stamp = Date.now();
      const base = `${uid}/${payload.meta.slug}-v${payload.version}-${stamp}`;

      const htmlPath = `${base}.html`;
      const { error: htmlError } = await supabase.storage
        .from("games")
        .upload(htmlPath, payload.htmlFile, { contentType: "text/html" });
      if (htmlError) throw htmlError;

      let artPath: string | null = null;
      if (payload.artFile) {
        const ext = payload.artFile.name.split(".").pop()?.toLowerCase() ?? "png";
        artPath = `${base}-art.${ext}`;
        const { error: artError } = await supabase.storage
          .from("games")
          .upload(artPath, payload.artFile, { contentType: payload.artFile.type });
        if (artError) throw artError;
      }

      const { error } = await supabase.from("game_submissions").insert({
        user_id: uid,
        game_id: payload.gameId,
        ...payload.meta,
        manifest: payload.manifest,
        checklist: payload.checklist,
        html_path: htmlPath,
        art_path: artPath,
        version: payload.version,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-submissions"] });
    },
  });
};
