import type { QueryClient } from "@tanstack/react-query";
import type { CloudflarePlayer } from "./arcade-api";

export const profileQueryKey = (playerId: string | undefined, identity: string) => ["profile", playerId, identity] as const;

export const profileFromPlayer = (row: CloudflarePlayer) => ({
  id: row.id, username: row.username, display_name: row.name, avatar_url: row.image,
  bio: row.bio, role: row.role, xp: row.xp, level: row.level,
  streak_days: row.streak_days, best_streak: row.best_streak,
  last_play_date: row.last_play_date, created_at: row.createdAt,
});

export function cacheServerPlayer(queryClient: QueryClient, row: CloudflarePlayer, identity: string) {
  queryClient.setQueryData(profileQueryKey(row.id, identity), profileFromPlayer(row));
}

export function clearAuthQueryCache(queryClient: QueryClient) {
  // Cancelling first prevents a previous principal's late query result from
  // repopulating private entries after the cache is cleared.
  void queryClient.cancelQueries();
  queryClient.clear();
}

/** Identifies a Clerk principal/session locally; the server still verifies JWTs. */
export function clerkIdentityKey(userId?: string | null, sessionId?: string | null): string {
  return userId && sessionId ? JSON.stringify(["clerk", userId, sessionId]) : "guest";
}

/** A consistency guard, not JWT verification or an authorization decision. */
export function clerkTokenMatchesIdentity(token: string, userId: string, sessionId: string): boolean {
  try {
    if (token.length > 16384) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const raw = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, character => character.charCodeAt(0))));
    return claims?.sub === userId && claims?.sid === sessionId;
  } catch { return false; }
}

/** Prevent an old refresh or unmounted provider from publishing account data. */
export function createAuthRequestGuard() {
  let generation = 0;
  let active = true;
  return {
    begin: () => ++generation,
    snapshot: () => generation,
    current: (requestGeneration: number) => active && requestGeneration === generation,
    invalidate: () => { generation++; },
    activate: () => { active = true; },
    dispose: () => { active = false; generation++; },
  };
}
