// Step 3 of the upload wizard: boots the uploaded HTML in the exact
// production sandbox (allow-scripts only, srcDoc = opaque origin) and
// listens for Arcade SDK events to drive the acceptance checklist.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, CircleDashed, RotateCcw, TriangleAlert, X } from "lucide-react";
import type { SubmissionChecklist } from "@/hooks/useSubmissions";

export interface TestFlightResult extends SubmissionChecklist {
  invalidSlugs: string[];
  lastScore: number | null;
}

const EMPTY: TestFlightResult = {
  ready: false,
  score: false,
  achievement: false,
  save: false,
  invalidSlugs: [],
  lastScore: null,
};

const Row = ({
  ok,
  warn,
  label,
  detail,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail?: string;
}) => (
  <div className="flex items-center gap-2.5 py-1.5">
    {ok ? (
      <Check className="h-4 w-4 shrink-0 text-olive" />
    ) : warn ? (
      <TriangleAlert className="h-4 w-4 shrink-0 text-terra" />
    ) : (
      <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
    )}
    <span className={`text-sm font-medium ${ok ? "" : "text-muted-foreground"}`}>
      {label}
    </span>
    {detail && (
      <span className="ml-auto font-mono text-[10px] tracking-wider text-muted-foreground">
        {detail}
      </span>
    )}
  </div>
);

const TestFlight = ({
  html,
  manifestSlugs,
  onResult,
}: {
  html: string;
  manifestSlugs: string[];
  onResult: (result: TestFlightResult) => void;
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [result, setResult] = useState<TestFlightResult>(EMPTY);
  const [frameKey, setFrameKey] = useState(0);

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const slugsRef = useRef(manifestSlugs);
  slugsRef.current = manifestSlugs;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (typeof data !== "object" || data === null || typeof data.type !== "string") return;

      setResult((prev) => {
        const next = { ...prev, invalidSlugs: [...prev.invalidSlugs] };
        switch (data.type) {
          case "ARCADE_READY":
            next.ready = true;
            break;
          case "ARCADE_SCORE":
            if (typeof data.score === "number" && Number.isFinite(data.score)) {
              next.score = true;
              next.lastScore = Math.floor(data.score);
            }
            break;
          case "ARCADE_ACHIEVEMENT": {
            const id = typeof data.id === "string" ? data.id.slice(0, 64) : "";
            if (!id) break;
            if (slugsRef.current.includes(id)) {
              next.achievement = true;
            } else if (!next.invalidSlugs.includes(id)) {
              next.invalidSlugs.push(id);
            }
            break;
          }
          case "ARCADE_SAVE":
            next.save = true;
            break;
          default:
            return prev;
        }
        return next;
      });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    onResultRef.current(result);
  }, [result]);

  const restart = () => {
    setResult(EMPTY);
    setFrameKey((k) => k + 1);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative overflow-hidden rounded-2xl bg-foreground ring-1 ring-foreground/10">
        <iframe
          key={frameKey}
          ref={iframeRef}
          srcDoc={html}
          sandbox="allow-scripts"
          title="Test flight"
          className="h-[360px] w-full border-0 sm:h-[440px]"
        />
        <button
          type="button"
          onClick={restart}
          className="absolute right-3 top-3 flex h-8 items-center gap-1.5 rounded-full bg-foreground/60 px-3 font-mono text-[10px] tracking-widest text-background backdrop-blur-sm transition-colors hover:bg-foreground/80"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          RESTART
        </button>
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
          SDK CHECKLIST
        </p>
        <div className="mt-2 divide-y divide-border">
          <Row ok={result.ready} label="Game loaded (ARCADE_READY)" />
          <Row
            ok={result.score}
            label="Score event received"
            detail={result.lastScore !== null ? String(result.lastScore) : undefined}
          />
          <Row
            ok={result.achievement}
            warn={result.invalidSlugs.length > 0}
            label={
              manifestSlugs.length === 0
                ? "Achievement event (no manifest)"
                : "Achievement event valid"
            }
          />
          <Row ok={result.save} label="Save-data event (optional)" />
        </div>

        {result.invalidSlugs.length > 0 && (
          <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <X className="h-3.5 w-3.5" />
              Unknown achievement slugs fired:
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-destructive/90">
              {result.invalidSlugs.join(", ")}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              These aren't in your manifest — the platform will ignore them.
              Add them in step 1 or fix the game.
            </p>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Play until the run ends — a real score event is required. Same
          sandbox as production: scripts only, no origin, no storage.
        </p>
      </div>
    </div>
  );
};

export default TestFlight;
