import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { safeNextPath } from "@/lib/safe-next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isKnownPlayer } from "@/lib/known-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trophy } from "lucide-react";

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

type Mode = "signin" | "signup";

const GOOGLE_DISABLED_COPY =
  "Google sign-in isn't switched on for this arcade yet — use email below. (Operators: enable the Google provider in the Supabase dashboard.)";

const Login = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  // Mode comes from the route: /signup = sign-up, /login = sign-in.
  const mode: Mode = location.pathname === "/signup" ? "signup" : "signin";

  const next = useMemo(() => safeNextPath(params.get("next"), window.location.origin), [params]);

  const hasHeldScore = useMemo(
    () => Object.keys(sessionStorage).some((k) => k.startsWith("held-score:")),
    [],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate(next, { replace: true });
  }, [session, navigate, next]);

  // Switching between /login and /signup keeps the component mounted —
  // clear stale messages when the mode changes.
  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [mode]);

  // Fresh browsers default to sign-up (session-8 decision): hitting /login
  // on a device that never held a session redirects to /signup — unless the
  // player explicitly chose "Sign in" via the toggle link (location state).
  const choseSignin = Boolean(
    (location.state as { manual?: boolean } | null)?.manual,
  );
  if (mode === "signin" && !choseSignin && !isKnownPlayer()) {
    return (
      <Navigate
        to={{ pathname: "/signup", search: location.search }}
        replace
      />
    );
  }

  const signInWithGoogle = async () => {
    setError(null);
    // supabase-js builds the authorize URL client-side and navigates straight
    // to it, so a disabled provider only fails AFTER leaving the app (raw
    // JSON error page). Grab the URL without redirecting and probe it first
    // so we can fail in-app instead.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + next,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      setError(GOOGLE_DISABLED_COPY);
      return;
    }
    try {
      const probe = await fetch(data.url, { redirect: "manual" });
      if (probe.status === 400) {
        setError(GOOGLE_DISABLED_COPY);
        return;
      }
    } catch {
      // Probe blocked (network/CORS) — proceed; worst case is the old behavior.
    }
    window.location.assign(data.url);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "Wrong email or password."
            : error.message,
        );
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin + next },
      });
      if (error) setError(error.message);
      else if (!data.session) {
        setNotice("Almost there — click the link we just emailed you, then come back.");
      }
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="fade-up w-full max-w-sm rounded-2xl bg-card p-7 shadow-sm ring-1 ring-foreground/10 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/assets/brand/logo-mark.png"
            alt="LLM Arcade logo"
            className="h-12 w-12 rounded-full shadow-sm ring-1 ring-foreground/10"
          />
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Join the arcade"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to your player card."
              : "Free player card — claim scores, climb boards, keep streaks."}
          </p>
        </div>

        {hasHeldScore && (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-mustard/20 px-4 py-3 text-sm font-medium">
            <Trophy className="h-4 w-4 shrink-0 text-[#8F6400]" />
            Your run is safe — {mode === "signin" ? "sign in" : "create your account"} to claim the score.
          </div>
        )}

        <Button
          type="button"
          onClick={signInWithGoogle}
          variant="outline"
          className="mt-6 h-11 w-full gap-2.5 rounded-full border-border bg-background font-semibold hover:bg-secondary"
        >
          <GoogleMark />
          Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
            OR EMAIL
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="h-11 rounded-full border-border bg-background px-5"
          />
          <Input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="h-11 rounded-full border-border bg-background px-5"
          />

          {error && (
            <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-xl bg-olive/15 px-4 py-2.5 text-sm font-medium text-olive">
              {notice}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-full bg-primary font-semibold hover:bg-primary/90"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "signin" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <Link
          to={{
            pathname: mode === "signin" ? "/signup" : "/login",
            search: location.search,
          }}
          state={{ manual: true }}
          className="mt-4 block w-full text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {mode === "signin" ? (
            <>
              New here? <span className="text-terra">Create an account</span>
            </>
          ) : (
            <>
              Already a player? <span className="text-terra">Sign in</span>
            </>
          )}
        </Link>
      </div>

      <Link
        to="/"
        className="mt-6 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to the arcade
      </Link>
    </div>
  );
};

export default Login;
