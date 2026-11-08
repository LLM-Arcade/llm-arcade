import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/react";
import { useAuth } from "@/contexts/AuthContext";
import { safeNextPath } from "@/lib/safe-next";

const AccountLogin = () => {
  const { session, isGuest, profile, error } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"), window.location.origin);
  if (session && !isGuest) return <Navigate to={next} replace />;
  const configured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  return <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 py-10">
    <section className="w-full max-w-md text-center" aria-labelledby="account-title">
      <h1 id="account-title" className="font-display text-2xl font-extrabold">Keep your player card</h1>
      <p className="mt-3 text-sm text-muted-foreground">Guest play needs no email. Your public name is {profile ? `@${profile.username}` : "your username"}.</p>
      <p className="mt-2 text-sm text-muted-foreground">A guest card uses a 30-day cookie in this browser. Clearing cookies or switching devices can lose access; a username alone cannot recover it.</p>
      <p className="mt-2 text-sm text-muted-foreground">An optional email account helps you return across devices. New accounts can keep the current guest card; existing accounts keep their own history, and a separate guest card stays in this browser.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    </section>
    {configured ? location.pathname.startsWith("/signup")
      ? <SignUp routing="path" path="/signup" signInUrl="/login" forceRedirectUrl={next} />
      : <SignIn routing="path" path="/login" signUpUrl="/signup" forceRedirectUrl={next} />
      : <p className="w-full max-w-md rounded-xl bg-card p-5 text-center text-sm ring-1 ring-foreground/10">Clerk email sign-in is awaiting secure setup. Guest play and guest scores remain available.</p>}
    <Link to="/games" className="rounded-full bg-secondary px-5 py-3 text-sm font-medium">Keep playing as a guest</Link>
  </main>;
};
export default AccountLogin;
