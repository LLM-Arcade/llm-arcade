export class ArcadeApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

let accountTokenSource: (() => Promise<string | null>) | undefined;
export function setArcadeAccountTokenSource(source: (() => Promise<string | null>) | undefined) {
  accountTokenSource = source;
  return () => { if (accountTokenSource === source) accountTokenSource = undefined; };
}

export async function arcadeRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await accountTokenSource?.();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  const response = await fetch("/api" + path, {
    ...options, credentials: "same-origin",
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    headers,
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ArcadeApiError(response.status,
    typeof value?.error === "string" ? value.error : "The arcade service is unavailable. Please try again.");
  return value as T;
}
export const arcadeData = async <T>(path: string, options?: RequestInit) =>
  (await arcadeRequest<{ data: T }>(path, options)).data;
export const arcadePost = <T>(path: string, value: unknown) =>
  arcadeData<T>(path, { method: "POST", body: JSON.stringify(value) });

// Capture playerId from the originating UI/hook. Pending mutations can outlive
// an account transition; the server rejects a changed principal instead of
// assigning that old run/unlock to the current token's player.
export const savePlayerScore = (playerId: string, run: { game_id: string; run_id: string; score: number; stats?: Record<string, unknown> | null }) =>
  arcadePost("/scores", { ...run, expected_player_id: playerId });

export const unlockPlayerAchievement = <T>(playerId: string, gameId: string, slug: string) =>
  arcadePost<T>("/community/rpc", { name: "unlock_achievement", args: { p_game_id: gameId, p_slug: slug, p_expected_player_id: playerId } });

export interface CloudflarePlayer {
  id: string; username: string; name: string; email: string | null;
  emailVerified: boolean; image: string | null; role: "player" | "playtester" | "moderator" | "admin";
  xp: number; level: number; createdAt: string; bio: string;
  streak_days: number; best_streak: number; last_play_date: string | null;
  isGuest?: boolean;
}
