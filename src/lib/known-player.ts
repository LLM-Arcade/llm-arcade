// Remembers that this browser has (or had) an account, so logged-out auth
// CTAs can say "Sign in" for returning players and "Sign up" for fresh
// visitors. Deliberately NOT cleared on sign-out.

const KEY = "na-known-player";

export const markKnownPlayer = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // storage unavailable (private mode) — harmless, CTAs default to sign-up
  }
};

export const isKnownPlayer = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Single source of truth for every logged-out auth CTA: known devices get
 * "Sign in" → /login, fresh devices get "Sign up" → /signup. Never hardcode
 * /login or /signup links in components — use this.
 */
export const authCta = (next?: string) => {
  const known = isKnownPlayer();
  return {
    known,
    verb: known ? "Sign in" : "Sign up",
    to:
      (known ? "/login" : "/signup") +
      (next ? `?next=${encodeURIComponent(next)}` : ""),
  };
};
