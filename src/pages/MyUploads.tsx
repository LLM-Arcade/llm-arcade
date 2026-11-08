// /uploads — creator's submission history: status chips, rejection reasons
// verbatim, and "Upload new version" (re-enters review).

import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { authCta } from "@/lib/known-player";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import { useMySubmissions, type GameSubmission } from "@/hooks/useSubmissions";
import { timeAgo } from "@/lib/progression";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Plus, RefreshCcw } from "lucide-react";

const statusChip: Record<GameSubmission["status"], string> = {
  pending: "bg-mustard text-foreground",
  approved: "bg-olive text-primary-foreground",
  rejected: "bg-destructive text-destructive-foreground",
};

const MyUploads = () => {
  const { user, loading, isGuest } = useAuth();
  const navigate = useNavigate();
  const { data: submissions, isLoading } = useMySubmissions();

  if (!loading && (!user || isGuest)) {
    return <Navigate to={authCta("/uploads").to} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <div className="fade-up flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-widest text-muted-foreground">
              THE ASSEMBLY LINE
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              My uploads
            </h1>
          </div>
          <Button asChild className="h-11 gap-2 rounded-full bg-primary px-5 font-semibold hover:bg-primary/90">
            <Link to="/upload">
              <Plus className="h-4 w-4" />
              Upload a game
            </Link>
          </Button>
        </div>

        <div className="fade-up mt-6 flex flex-col gap-3" style={{ animationDelay: "80ms" }}>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !submissions || submissions.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-foreground/10">
              <p className="font-display text-lg font-bold">Nothing on the line yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Build a self-contained HTML game that speaks the Arcade SDK,
                run it through the test flight, and it lands in the review
                queue.
              </p>
            </div>
          ) : (
            submissions.map((sub) => (
              <div
                key={sub.id}
                className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span
                    className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest ${statusChip[sub.status]}`}
                  >
                    {sub.status.toUpperCase()}
                  </span>
                  <p className="font-display text-lg font-bold">{sub.title}</p>
                  <span className="font-mono text-xs text-muted-foreground">
                    /{sub.slug} · v{sub.version} · {timeAgo(sub.created_at)}
                  </span>
                </div>

                {sub.status === "rejected" && sub.review_note && (
                  <div className="mt-3 rounded-xl bg-destructive/10 px-4 py-3">
                    <p className="font-mono text-[10px] tracking-widest text-destructive">
                      REJECTION REASON
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">{sub.review_note}</p>
                  </div>
                )}

                <div className="mt-3.5 flex flex-wrap gap-2">
                  {sub.status === "approved" && sub.game_id && (
                    <Button
                      asChild
                      variant="outline"
                      className="h-9 gap-1.5 rounded-full border-border text-sm font-semibold"
                    >
                      <Link to={`/game/${sub.slug}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        View cabinet
                      </Link>
                    </Button>
                  )}
                  {sub.status !== "pending" && (
                    <Button
                      variant="outline"
                      onClick={() => navigate("/upload", { state: { from: sub } })}
                      className="h-9 gap-1.5 rounded-full border-border text-sm font-semibold"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                      {sub.status === "approved" ? "Upload new version" : "Fix & resubmit"}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default MyUploads;
