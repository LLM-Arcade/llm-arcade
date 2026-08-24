// Admin signups panel: playtest applications (approve → playtester role +
// badge via trigger) and the waitlist with CSV export.

import {
  usePlaytestApplications,
  useReviewPlaytest,
  useWaitlist,
} from "@/hooks/useAdmin";
import { timeAgo } from "@/lib/progression";
import { Button } from "@/components/ui/button";
import { Check, Download, Loader2, X } from "lucide-react";

const statusChip: Record<string, string> = {
  pending: "bg-mustard text-foreground",
  approved: "bg-olive text-primary-foreground",
  declined: "bg-secondary text-muted-foreground",
};

const exportCsv = (rows: { email: string; created_at: string }[]) => {
  // Quote fields defensively; emails are validated but stay untrusted input
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = ["email,signed_up_at", ...rows.map((r) => `${esc(r.email)},${esc(r.created_at)}`)].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "neon-arcade-waitlist.csv";
  a.click();
  URL.revokeObjectURL(url);
};

const SignupsPanel = () => {
  const { data: applications, isLoading: appsLoading } = usePlaytestApplications();
  const { data: waitlist, isLoading: waitlistLoading } = useWaitlist();
  const review = useReviewPlaytest();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="font-mono text-xs tracking-widest text-muted-foreground">
          PLAYTEST APPLICATIONS
        </h2>
        <div className="mt-2.5 flex flex-col gap-2">
          {appsLoading ? (
            <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-muted-foreground" />
          ) : !applications || applications.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-foreground/10">
              No applications yet.
            </p>
          ) : (
            applications.map((app) => (
              <div
                key={app.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {app.name}{" "}
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {app.email}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                    {app.devices.join(" · ") || "no devices"} · {app.hours_per_week || "?"} h/wk ·{" "}
                    {app.favorite_eras.join(", ") || "no era prefs"} · {timeAgo(app.created_at)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest ${statusChip[app.status] ?? statusChip.pending}`}
                >
                  {app.status.toUpperCase()}
                </span>
                {app.status === "pending" && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: app.id, approve: true })}
                      className="h-9 gap-1 rounded-full bg-olive text-xs font-semibold text-primary-foreground hover:bg-olive/90"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: app.id, approve: false })}
                      className="h-9 gap-1 rounded-full border-border text-xs font-semibold text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs tracking-widest text-muted-foreground">
            WAITLIST {waitlist ? `· ${waitlist.length}` : ""}
          </h2>
          {waitlist && waitlist.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportCsv(waitlist)}
              className="h-9 gap-1.5 rounded-full border-border text-xs font-semibold"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
        </div>
        <div className="mt-2.5 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10">
          {waitlistLoading ? (
            <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin text-muted-foreground" />
          ) : !waitlist || waitlist.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              Nobody on the list yet.
            </p>
          ) : (
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {waitlist.map((row) => (
                <div key={row.email} className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-mono text-xs">{row.email}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {timeAgo(row.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SignupsPanel;
