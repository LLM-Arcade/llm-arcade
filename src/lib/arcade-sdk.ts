// Arcade SDK bridge — the one postMessage protocol every game speaks.
//
// Track-B games (uploaded, self-contained HTML) run inside
// <iframe sandbox="allow-scripts"> and post messages to the parent:
//   { type: "ARCADE_READY" }
//   { type: "ARCADE_SCORE", score: number, stats?: Record<string, string|number> }
//   { type: "ARCADE_ACHIEVEMENT", id: string }   (validated & stored in Phase 3)
//   { type: "ARCADE_SAVE", blob: string }        (acted on in Phase 3)
//   { type: "ARCADE_LOAD" }                      (acted on in Phase 3)
//
// Track-A games (in-repo React components) receive the same callbacks as
// props via src/games/registry.ts — both tracks share one submission path.

import { useEffect, useRef, type RefObject } from "react";

export interface ArcadeScorePayload {
  score: number;
  stats?: Record<string, string | number>;
}

interface ArcadeBridgeHandlers {
  onReady?: () => void;
  onScore: (payload: ArcadeScorePayload) => void;
  onAchievement?: (id: string) => void;
}

/** Clamp an untrusted score to a non-negative integer under the game's cap. */
export const sanitizeScore = (raw: unknown, cap: number): number | null => {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  return Math.min(Math.floor(raw), cap);
};

const sanitizeStats = (raw: unknown): Record<string, string | number> | undefined => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 16)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key.slice(0, 40)] = value;
    else if (typeof value === "string") out[key.slice(0, 40)] = value.slice(0, 100);
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * Listens for SDK messages coming from a specific sandboxed iframe.
 * Messages from any other source are ignored; payloads are sanitized
 * before they reach the app.
 */
export function useArcadeBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  scoreCap: number,
  handlers: ArcadeBridgeHandlers,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (typeof data !== "object" || data === null || typeof data.type !== "string") return;

      switch (data.type) {
        case "ARCADE_READY":
          handlersRef.current.onReady?.();
          break;
        case "ARCADE_SCORE": {
          const score = sanitizeScore(data.score, scoreCap);
          if (score !== null) {
            handlersRef.current.onScore({ score, stats: sanitizeStats(data.stats) });
          }
          break;
        }
        case "ARCADE_ACHIEVEMENT":
          if (typeof data.id === "string" && data.id.length <= 64) {
            handlersRef.current.onAchievement?.(data.id);
          }
          break;
        // ARCADE_SAVE / ARCADE_LOAD are part of the protocol but the
        // platform starts persisting saves in Phase 3.
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef, scoreCap]);
}
