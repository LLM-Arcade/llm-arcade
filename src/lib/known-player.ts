// Remembers that this browser has (or had) an account, so the login page
// can default to "sign in" for returning players and "create account" for
// fresh visitors. Deliberately NOT cleared on sign-out.

const KEY = "na-known-player";

export const markKnownPlayer = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // storage unavailable (private mode) — harmless, login defaults to signup
  }
};

export const isKnownPlayer = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
