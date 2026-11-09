import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/legacy-supabase";
import { isCloudflareBackend } from "@/lib/backend-config";
import { useAuth } from "@/contexts/AuthContext";
import { authCta } from "@/lib/known-player";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showError, showSuccess } from "@/utils/toast";
import { Check, Loader2, X } from "lucide-react";
import { format } from "date-fns";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

type UsernameState = "unchanged" | "invalid" | "checking" | "available" | "taken" | "error";

const roleChipClass: Record<string, string> = {
  admin: "bg-terra/10 text-terra",
  moderator: "bg-olive/15 text-olive",
  playtester: "bg-mustard/25 text-[#8F6400]",
  player: "bg-secondary text-muted-foreground",
};

const Settings = () => {
  const { user, profile, loading, signOut, isGuest } = useAuth();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [usernameState, setUsernameState] = useState<UsernameState>("unchanged");
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);

  // Hydrate the form once the profile arrives
  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio);
    setUsernameState("unchanged");
  }, [profile]);

  // Debounced username availability check
  useEffect(() => {
    if (!profile) return;
    const candidate = username.trim().toLowerCase();
    if (candidate === profile.username) {
      setUsernameState("unchanged");
      return;
    }
    if (!USERNAME_RE.test(candidate)) {
      setUsernameState("invalid");
      return;
    }
    setUsernameState("checking");
    // The cleanup can't abort an in-flight request, so a stale response
    // must not overwrite the verdict for a newer candidate.
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", candidate)
          .maybeSingle();
        if (stale) return;
        if (error) setUsernameState("error");
        else if (data === null) setUsernameState("available");
        else setUsernameState(typeof data?.id === "string" ? "taken" : "error");
      } catch {
        if (!stale) setUsernameState("error");
      }
    }, 450);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [username, profile, availabilityAttempt]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: username.trim().toLowerCase(),
          display_name: displayName.trim() || null,
          bio: bio.trim(),
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user!.id] });
      showSuccess("Profile saved.");
    },
    onError: (error: { code?: string }) => {
      showError(
        error.code === "23505"
          ? "That username was just taken — try another."
          : "Couldn't save your profile. Try again.",
      );
    },
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to={authCta("/settings").to} replace />;
  if (!profile) return null;

  const usernameBlocked = usernameState !== "unchanged" && usernameState !== "available";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="fade-up font-display text-3xl font-extrabold tracking-tight">
          Settings
        </h1>

        {/* Profile card */}
        <section
          className="fade-up mt-6 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-foreground/10"
          style={{ animationDelay: "60ms" }}
        >
          <h2 className="font-mono text-xs tracking-widest text-muted-foreground">
            PROFILE
          </h2>

          <div className="mt-5 flex flex-col gap-5">
            <div>
              <label htmlFor="username" className="text-sm font-semibold">
                Username
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-muted-foreground">@</span>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => {
                    const value = e.target.value.toLowerCase();
                    const candidate = value.trim();
                    setUsername(value);
                    if (value !== username) {
                      setUsernameState(candidate === profile.username ? "unchanged" : USERNAME_RE.test(candidate) ? "checking" : "invalid");
                    }
                  }}
                  aria-describedby="username-status"
                  maxLength={20}
                  className="h-11 rounded-full border-border bg-background px-5 font-mono text-sm"
                />
              </div>
              <p id="username-status" aria-live="polite" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                {usernameState === "unchanged" && (
                  <span className="text-muted-foreground">
                    3–20 characters: a–z, 0–9, underscores.
                  </span>
                )}
                {usernameState === "checking" && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking…
                  </span>
                )}
                {usernameState === "available" && (
                  <span className="inline-flex items-center gap-1.5 text-olive">
                    <Check className="h-3 w-3" /> Available
                  </span>
                )}
                {usernameState === "taken" && (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <X className="h-3 w-3" /> Already taken
                  </span>
                )}
                {usernameState === "invalid" && (
                  <span className="text-destructive">
                    Lowercase letters, numbers and underscores only (3–20).
                  </span>
                )}
                {usernameState === "error" && (
                  <>
                    <span className="text-destructive">Couldn't check availability.</span>
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-terra focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      onClick={() => {
                        setUsernameState("checking");
                        setAvailabilityAttempt((attempt) => attempt + 1);
                      }}
                    >
                      Retry
                    </button>
                  </>
                )}
              </p>
            </div>

            <div>
              <label htmlFor="displayName" className="text-sm font-semibold">
                {isCloudflareBackend ? "Private player name" : "Display name"}
              </label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
                placeholder={isCloudflareBackend ? "Private player name" : "How your name appears on boards"}
                className="mt-1.5 h-11 rounded-full border-border bg-background px-5"
              />
            </div>

            {isCloudflareBackend && <p className="text-sm text-muted-foreground">Only your username appears publicly. Your bio is public if you add one; avoid personal details.</p>}
            <div>
              <label htmlFor="bio" className="text-sm font-semibold">
                Bio
              </label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="A line or two for your profile."
                className="mt-1.5 rounded-2xl border-border bg-background px-5 py-3"
              />
              <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
                {bio.length}/300
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Avatar uploads & profile cosmetics unlock with the progression
                phase.
              </p>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || usernameBlocked}
                className="h-11 shrink-0 rounded-full bg-primary px-6 font-semibold hover:bg-primary/90"
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* Account card */}
        <section
          className="fade-up mt-4 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-foreground/10"
          style={{ animationDelay: "120ms" }}
        >
          <h2 className="font-mono text-xs tracking-widest text-muted-foreground">
            ACCOUNT
          </h2>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate font-medium">{user.email || "Guest card · no email collected"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd>
                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-[10px] tracking-widest ${roleChipClass[profile.role]}`}
                >
                  {profile.role.toUpperCase()}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Player since</dt>
              <dd className="font-medium">
                {format(new Date(profile.created_at), "MMM d, yyyy")}
              </dd>
            </div>
          </dl>
          {isGuest && <p className="mt-4 text-sm text-muted-foreground">This guest card uses a 30-day cookie in this browser. Clearing cookies, switching browsers or changing devices can lose access. A username alone cannot recover it. Optional email sign-in can keep a new account linked to this card.</p>}
          {!isGuest && <Button
            variant="outline"
            onClick={() => void signOut()}
            className="mt-5 h-10 rounded-full border-border font-medium text-muted-foreground hover:text-foreground"
          >
            Sign out
          </Button>}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Settings;
