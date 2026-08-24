// /admin — operator dashboard (spec §4.10, Phase 4 scope):
// Review queue · Games · Players · Signups · Site. Chat log and seasons
// arrive with their phases.

import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import ReviewQueue from "@/components/admin/ReviewQueue";
import GamesPanel from "@/components/admin/GamesPanel";
import UsersPanel from "@/components/admin/UsersPanel";
import SignupsPanel from "@/components/admin/SignupsPanel";
import SitePanel from "@/components/admin/SitePanel";
import { usePendingSubmissions } from "@/hooks/useAdmin";
import { Loader2 } from "lucide-react";

const SECTIONS = ["Review queue", "Games", "Players", "Signups", "Site"] as const;
type Section = (typeof SECTIONS)[number];

const Admin = () => {
  const { profile, loading } = useAuth();
  const [section, setSection] = useState<Section>("Review queue");
  const isAdmin = profile?.role === "admin";
  const { data: pending } = usePendingSubmissions(isAdmin);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="fade-up">
          <p className="font-mono text-xs tracking-widest text-muted-foreground">
            OPERATOR CONSOLE
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Admin
          </h1>
        </div>

        <div
          className="fade-up -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
          style={{ animationDelay: "60ms" }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={section === s}
              onClick={() => setSection(s)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                section === s
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
              {s === "Review queue" && (pending?.length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-terra px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">
                  {pending!.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="fade-up mt-6" style={{ animationDelay: "120ms" }}>
          {section === "Review queue" && <ReviewQueue />}
          {section === "Games" && <GamesPanel />}
          {section === "Players" && <UsersPanel />}
          {section === "Signups" && <SignupsPanel />}
          {section === "Site" && <SitePanel />}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Admin;
