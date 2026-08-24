import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { authCta } from "@/lib/known-player";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/utils/toast";
import { Loader2, MessageCircle, Reply, Trash2 } from "lucide-react";
import type { Game } from "@/hooks/useGames";

interface CommentRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
}

const roleChip: Record<string, { label: string; className: string }> = {
  admin: { label: "ADMIN", className: "bg-terra/10 text-terra" },
  moderator: { label: "MOD", className: "bg-olive/15 text-olive" },
  playtester: { label: "PLAYTESTER", className: "bg-mustard/25 text-[#8F6400]" },
};

const CommentsPanel = ({ game }: { game: Game }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const { data: comments, isLoading } = useQuery({
    queryKey: ["comments", game.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, user_id, parent_id, body, created_at, profiles(username, display_name, avatar_url, role)")
        .eq("game_id", game.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as CommentRow[];
    },
  });

  const post = useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId: string | null }) => {
      const { error } = await supabase.from("comments").insert({
        game_id: game.id,
        user_id: user!.id,
        parent_id: parentId,
        body,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["comments", game.id] });
      if (vars.parentId) {
        setReplyDraft("");
        setReplyTo(null);
      } else {
        setDraft("");
      }
    },
    onError: () => showError("Couldn't post your comment. Try again."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", game.id] }),
    onError: () => showError("Couldn't delete the comment."),
  });

  const armDelete = (id: string) => {
    if (armedDelete === id) {
      remove.mutate(id);
      setArmedDelete(null);
    } else {
      setArmedDelete(id);
      setTimeout(() => setArmedDelete((cur) => (cur === id ? null : cur)), 3000);
    }
  };

  const roots = comments?.filter((c) => !c.parent_id) ?? [];
  const repliesFor = (id: string) => comments?.filter((c) => c.parent_id === id) ?? [];

  const CommentItem = ({ comment, isReply }: { comment: CommentRow; isReply?: boolean }) => {
    const p = comment.profiles;
    const chip = p ? roleChip[p.role] : undefined;
    const isCreator = game.created_by !== null && comment.user_id === game.created_by;
    return (
      <div className={`flex gap-3 ${isReply ? "ml-10 mt-3" : ""}`}>
        <Avatar className="h-8 w-8 shrink-0 ring-1 ring-foreground/10">
          <AvatarImage src={p?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-secondary text-xs font-bold">
            {(p?.username[0] ?? "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">
              {p?.display_name || p?.username || "former player"}
            </span>
            {isCreator && (
              <span className="rounded-full bg-terra px-2 py-0.5 font-mono text-[9px] tracking-widest text-primary-foreground">
                CREATOR
              </span>
            )}
            {chip && (
              <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] tracking-widest ${chip.className}`}>
                {chip.label}
              </span>
            )}
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatDistanceToNowStrict(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {comment.body}
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            {!isReply && user && (
              <button
                type="button"
                onClick={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id);
                  setReplyDraft("");
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Reply className="h-3.5 w-3.5" /> Reply
              </button>
            )}
            {user?.id === comment.user_id && (
              <button
                type="button"
                onClick={() => armDelete(comment.id)}
                className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                  armedDelete === comment.id
                    ? "text-destructive"
                    : "text-muted-foreground hover:text-destructive"
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {armedDelete === comment.id ? "Really delete?" : "Delete"}
              </button>
            )}
          </div>

          {replyTo === comment.id && user && (
            <div className="mt-3 flex flex-col gap-2">
              <Textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                maxLength={1000}
                rows={2}
                autoFocus
                placeholder={`Reply to @${p?.username ?? "player"}…`}
                className="rounded-2xl border-border bg-background px-4 py-2.5 text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyTo(null)}
                  className="rounded-full text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!replyDraft.trim() || post.isPending}
                  onClick={() => post.mutate({ body: replyDraft.trim(), parentId: comment.id })}
                  className="rounded-full bg-primary font-semibold hover:bg-primary/90"
                >
                  Reply
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10 sm:p-5">
      {/* Composer */}
      {user ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={`Talk strategy on ${game.title}…`}
            className="rounded-2xl border-border bg-background px-4 py-3 text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {draft.length > 800 ? `${draft.length}/1000` : ""}
            </span>
            <Button
              disabled={!draft.trim() || post.isPending}
              onClick={() => post.mutate({ body: draft.trim(), parentId: null })}
              className="rounded-full bg-primary px-5 font-semibold hover:bg-primary/90"
            >
              {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/70 px-4 py-3">
          <p className="text-sm font-medium text-muted-foreground">
            {authCta().verb} to join the conversation.
          </p>
          <Button
            asChild
            size="sm"
            className="shrink-0 rounded-full bg-primary font-semibold hover:bg-primary/90"
          >
            <Link to={authCta(`/game/${game.slug}`).to}>{authCta().verb}</Link>
          </Button>
        </div>
      )}

      {/* Thread */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : roots.length === 0 ? (
        <div className="py-10 text-center">
          <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            No comments yet — set the tone.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {roots.map((comment) => (
            <div key={comment.id}>
              <CommentItem comment={comment} />
              {repliesFor(comment.id).map((reply) => (
                <CommentItem key={reply.id} comment={reply} isReply />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentsPanel;
