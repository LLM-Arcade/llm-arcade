// Admin review queue: pending submissions with sandbox preview, manifest
// diff against the currently approved achievement set, and
// approve / reject-with-reason (spec §4.10).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  usePendingSubmissions,
  useReviewSubmission,
  type AdminSubmission,
} from "@/hooks/useAdmin";
import { storagePublicUrl } from "@/hooks/useSubmissions";
import { timeAgo } from "@/lib/progression";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Check, Loader2, MonitorPlay, X } from "lucide-react";

const checkChip = (ok: boolean, label: string) => (
  <span
    key={label}
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider ${
      ok ? "bg-olive/15 text-olive" : "bg-secondary text-muted-foreground"
    }`}
  >
    {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
    {label}
  </span>
);

/** Diff the submitted manifest against the game's approved achievements. */
const ManifestDiff = ({ sub }: { sub: AdminSubmission }) => {
  const { data: current } = useQuery({
    queryKey: ["game-achievements-raw", sub.game_id],
    enabled: !!sub.game_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select("slug, name, hint, xp")
        .eq("game_id", sub.game_id!);
      if (error) throw error;
      return data as { slug: string; name: string; hint: string; xp: number }[];
    },
  });

  const currentBySlug = new Map((current ?? []).map((a) => [a.slug, a]));
  const manifestSlugs = new Set(sub.manifest.map((m) => m.slug));
  const removed = (current ?? []).filter((a) => !manifestSlugs.has(a.slug));

  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
        MANIFEST {sub.game_id ? "DIFF" : `· ${sub.manifest.length} ACHIEVEMENTS (ALL NEW)`}
      </p>
      <div className="mt-1.5 flex flex-col gap-1">
        {sub.manifest.map((entry) => {
          const prev = currentBySlug.get(entry.slug);
          const state = !sub.game_id || !prev
            ? "added"
            : prev.name !== entry.name || prev.hint !== entry.hint || prev.xp !== entry.xp
              ? "changed"
              : "same";
          return (
            <div key={entry.slug} className="flex items-baseline gap-2 text-sm">
              <span
                className={`w-5 shrink-0 text-center font-mono text-xs font-bold ${
                  state === "added"
                    ? "text-olive"
                    : state === "changed"
                      ? "text-terra"
                      : "text-muted-foreground/50"
                }`}
              >
                {state === "added" ? "+" : state === "changed" ? "~" : "="}
              </span>
              <span className="font-medium">{entry.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {entry.slug} · {entry.xp} XP
              </span>
            </div>
          );
        })}
        {removed.map((a) => (
          <div key={a.slug} className="flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 text-center font-mono text-xs font-bold text-destructive">
              −
            </span>
            <span className="font-medium line-through opacity-60">{a.name}</span>
            <span className="font-mono text-[10px] text-destructive/80">
              removed — existing unlocks will be deleted
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SubmissionCard = ({ sub }: { sub: AdminSubmission }) => {
  const [previewing, setPreviewing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const review = useReviewSubmission();

  const checklist = sub.checklist ?? { ready: false, score: false, achievement: false, save: false };

  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="font-display text-lg font-bold">{sub.title}</p>
        <span className="font-mono text-xs text-muted-foreground">
          /{sub.slug} · v{sub.version} · {sub.era} ·{" "}
          {sub.game_id ? "NEW VERSION" : "NEW CABINET"} · by @
          {sub.profiles?.username ?? "unknown"} · {timeAgo(sub.created_at)}
        </span>
      </div>

      {sub.description && (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {sub.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span><span className="text-muted-foreground">AI credit:</span> {sub.ai_credit}</span>
        <span><span className="text-muted-foreground">Controls:</span> {sub.controls || "—"}</span>
        <span className="font-mono text-xs">
          cap {sub.score_cap.toLocaleString()} · label "{sub.score_label}"
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {checkChip(checklist.ready, "READY")}
        {checkChip(checklist.score, "SCORE")}
        {checkChip(checklist.achievement, "ACHIEVEMENT")}
        {checkChip(checklist.save, "SAVE")}
      </div>

      <ManifestDiff sub={sub} />

      {previewing && (
        <div className="mt-4 overflow-hidden rounded-2xl bg-foreground ring-1 ring-foreground/10">
          <iframe
            src={storagePublicUrl(sub.html_path)}
            sandbox="allow-scripts"
            title={`Preview: ${sub.title}`}
            className="h-[400px] w-full border-0"
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setPreviewing((p) => !p)}
          className="h-10 gap-2 rounded-full border-border font-semibold"
        >
          <MonitorPlay className="h-4 w-4" />
          {previewing ? "Close preview" : "Preview in sandbox"}
        </Button>

        {sub.art_path && (
          <img
            src={storagePublicUrl(sub.art_path)}
            alt="Submitted key art"
            className="h-10 w-10 rounded-xl object-cover ring-1 ring-foreground/10"
          />
        )}

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={review.isPending}
            className="h-10 rounded-full border-destructive/40 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Reject…
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={review.isPending}
                className="h-10 gap-2 rounded-full bg-olive font-semibold text-primary-foreground hover:bg-olive/90"
              >
                {review.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">
                  Publish {sub.title}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This puts the cabinet on the floor immediately, seeds its{" "}
                  {sub.manifest.length} manifest achievement
                  {sub.manifest.length === 1 ? "" : "s"} as the approved set,
                  and awards the Creator badge on a first approval.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => review.mutate({ id: sub.id, approve: true, note: "" })}
                  className="rounded-full bg-olive text-primary-foreground hover:bg-olive/90"
                >
                  Approve & publish
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Reject {sub.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The creator sees this reason verbatim in My Uploads — be specific
            about what to fix.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Score event fires mid-run instead of at game over; art uses trademarked characters."
            rows={4}
            maxLength={500}
            className="rounded-xl border-border"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              className="h-10 rounded-full border-border font-semibold"
            >
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length < 5 || review.isPending}
              onClick={() =>
                review.mutate(
                  { id: sub.id, approve: false, note: reason.trim() },
                  { onSuccess: () => setRejectOpen(false) },
                )
              }
              className="h-10 rounded-full bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90"
            >
              Reject with reason
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ReviewQueue = () => {
  const { data: submissions, isLoading } = usePendingSubmissions(true);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!submissions || submissions.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-foreground/10">
        <p className="font-display text-lg font-bold">Queue's clear</p>
        <p className="mt-1 text-sm text-muted-foreground">
          New submissions land here for sandbox preview and manifest review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {submissions.map((sub) => (
        <SubmissionCard key={sub.id} sub={sub} />
      ))}
    </div>
  );
};

export default ReviewQueue;
