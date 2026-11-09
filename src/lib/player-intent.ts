type ScorePayload = { score: number; stats?: unknown };

function snapshotStats(stats: unknown): Readonly<Record<string, string | number>> | undefined {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return undefined;
  const entries: [string, string | number][] = [];
  for (const [key, value] of Object.entries(stats).slice(0, 16)) {
    if (typeof value === "number" && Number.isFinite(value)) entries.push([key.slice(0, 40), value]);
    else if (typeof value === "string") entries.push([key.slice(0, 40), value.slice(0, 100)]);
  }
  return entries.length ? Object.freeze(Object.fromEntries(entries)) : undefined;
}

/** Freeze the UI's intent before TanStack can pause or queue its mutation. */
export function captureScoreIntent(playerId: string, gameId: string, runId: string, payload: ScorePayload) {
  return Object.freeze({ playerId, gameId, runId, score: payload.score, stats: snapshotStats(payload.stats) });
}

export function captureAchievementIntent(playerId: string, gameId: string, slug: string) {
  return Object.freeze({ playerId, gameId, slug });
}

export type ScoreIntent = ReturnType<typeof captureScoreIntent>;
export type AchievementIntent = ReturnType<typeof captureAchievementIntent>;
