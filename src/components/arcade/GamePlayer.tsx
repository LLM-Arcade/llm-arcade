import ArcadeImage from "@/components/arcade/ArcadeImage";
import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/legacy-supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useArcadeBridge, sanitizeScore, type ArcadeScorePayload } from "@/lib/arcade-sdk";
import { authCta } from "@/lib/known-player";
import { gameRegistry } from "@/games/registry";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useUnlockAchievement } from "@/hooks/useAchievements";
import { gameArt, type Game } from "@/hooks/useGames";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { showError, showSuccess } from "@/utils/toast";
import { Check, Loader2, Maximize, Minimize, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { isCloudflareBackend } from "@/lib/backend-config";
import { arcadeData, arcadePost, savePlayerScore, ArcadeApiError } from "@/lib/arcade-api";
import { captureAchievementIntent, captureScoreIntent, type ScoreIntent } from "@/lib/player-intent";

type Phase = "idle" | "loading" | "playing" | "over";
type SubmitState = "idle" | "saving" | "saved" | "held" | "rate_limited" | "error";

const HELD_SCORE_TTL_MS = 30 * 60_000;

const heldKey = (slug: string) => `held-score:${slug}`;

const GamePlayer = ({ game }: { game: Game }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<ArcadeScorePayload | null>(null);
  const [runPb, setRunPb] = useState<number | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [frameKey, setFrameKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scoredRunRef = useRef(false);
  const runIdRef = useRef<string>(crypto.randomUUID());

  const TrackAGame = gameRegistry[game.slug];

  // Personal best (before this run — snapshotted into runPb at game over)
  const { data: personalBest } = useQuery({
    queryKey: ["personal-best", game.id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (isCloudflareBackend) return (await arcadeData<{ score: number | null }>(`/games/${encodeURIComponent(game.id)}/personal-best`)).score;
      const { data, error } = await supabase
        .from("scores")
        .select("score")
        .eq("game_id", game.id)
        .eq("user_id", user!.id)
        .order("score", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? (data.score as number) : null;
    },
  });

  const { data: weeklyBoard } = useLeaderboard(game.id, "weekly");
  const weeklyRank =
    user && weeklyBoard
      ? weeklyBoard.findIndex((r) => r.user_id === user.id) + 1
      : 0;

  const unlock = useUnlockAchievement(game.id);
  const handleAchievement = (id: string) => {
    // A guest card or signed-in account owns its manifest-validated unlocks.
    if (user) unlock.mutate(captureAchievementIntent(user.id, game.id, id));
  };

  const submit = useMutation({
    mutationFn: async (intent: ScoreIntent) => {
      if (isCloudflareBackend) {
        await savePlayerScore(intent.playerId, { game_id: intent.gameId, run_id: intent.runId, score: intent.score, stats: intent.stats ?? null });
        return;
      }
      const { error } = await supabase.from("scores").insert({
        game_id: intent.gameId,
        user_id: intent.playerId,
        score: intent.score,
        stats: intent.stats ?? null,
      });
      if (error) throw error;
    },
    onMutate: (intent) => {
      if (intent.runId === runIdRef.current && intent.gameId === game.id && intent.playerId === user?.id) setSubmitState("saving");
    },
    onSuccess: (_result, intent) => {
      if (intent.runId === runIdRef.current && intent.gameId === game.id && intent.playerId === user?.id) setSubmitState("saved");
      queryClient.invalidateQueries({ queryKey: ["leaderboard", intent.gameId] });
      queryClient.invalidateQueries({ queryKey: ["personal-best", intent.gameId] });
      // Progression side effects (XP, streak, badges) happen in a DB trigger
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["recent-scores"] });
    },
    onError: (error: Error, intent) => {
      if (intent.runId !== runIdRef.current || intent.gameId !== game.id || intent.playerId !== user?.id) return;
      if ((error instanceof ArcadeApiError && error.status === 429) || error.message.toLowerCase().includes("security")) {
        setSubmitState("rate_limited");
      } else {
        setSubmitState("error");
      }
    },
  });

  const handleGameOver = (payload: ArcadeScorePayload) => {
    // The SDK contract is one ARCADE_SCORE per run. The iframe stays live
    // under the game-over overlay, so a buggy or hostile cabinet could
    // keep posting scores; only the first one counts.
    if (scoredRunRef.current) return;
    scoredRunRef.current = true;
    setRun(payload);
    setRunPb(personalBest ?? null);
    setPhase("over");
    if (payload.score <= 0) return;

    if (user) {
      submit.mutate(captureScoreIntent(user.id, game.id, runIdRef.current, payload));
    } else {
      // Guest interception: hold the run, submit right after sign-in.
      const existing = sessionStorage.getItem(heldKey(game.slug));
      let best = payload;
      let heldRunId = runIdRef.current;
      if (existing) {
        try {
          const prev = JSON.parse(existing) as { score?: number; run_id?: string };
          if (typeof prev.score === "number" && prev.score > payload.score) {
            best = { ...payload, score: prev.score };
            if (prev.run_id && /^[0-9a-f-]{36}$/i.test(prev.run_id)) heldRunId = prev.run_id;
          }
        } catch {
          // ignore corrupt held data
        }
      }
      sessionStorage.setItem(
        heldKey(game.slug),
        JSON.stringify({ ...best, at: Date.now(), run_id: heldRunId }),
      );
      setSubmitState("held");
    }
  };

  // Claim a held guest run once the user is signed in
  useEffect(() => {
    if (!user) return;
    const raw = sessionStorage.getItem(heldKey(game.slug));
    if (!raw) return;
    try {
      const held = JSON.parse(raw) as { score?: unknown; stats?: unknown; at?: unknown; run_id?: unknown };
      const score = sanitizeScore(held.score, game.score_cap);
      if (
        score === null ||
        score <= 0 ||
        typeof held.at !== "number" ||
        Date.now() - held.at > HELD_SCORE_TTL_MS
      ) {
        sessionStorage.removeItem(heldKey(game.slug));
        return;
      }
      const heldRunId = typeof held.run_id === "string" && /^[0-9a-f-]{36}$/i.test(held.run_id) ? held.run_id : crypto.randomUUID();
      submit.mutate(
        captureScoreIntent(user.id, game.id, heldRunId, { score, stats: held.stats }),
        { onSuccess: () => {
          // A newer held run may have replaced this entry while the save was
          // queued. Do not erase that newer run, or change the active run ID.
          if (sessionStorage.getItem(heldKey(game.slug)) === raw) sessionStorage.removeItem(heldKey(game.slug));
          showSuccess("Score claimed — you're on the board.");
        } },
      );
    } catch {
      // ignore corrupt held data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, game.slug]);

  useArcadeBridge(iframeRef, game.score_cap, {
    onReady: () => setPhase((p) => (p === "loading" ? "playing" : p)),
    onScore: handleGameOver,
    onAchievement: handleAchievement,
  });

  // If a game never sends ARCADE_READY, assume it's playing after 5s
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = setTimeout(() => setPhase("playing"), 5000);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const start = () => {
    setRun(null);
    setSubmitState("idle");
    scoredRunRef.current = false;
    runIdRef.current = crypto.randomUUID();
    setFrameKey((k) => k + 1);
    setPhase(TrackAGame ? "playing" : "loading");
    if (isCloudflareBackend) void arcadePost(`/games/${encodeURIComponent(game.id)}/play`, {}).catch(() => {});
    else void supabase.rpc("increment_play_count", { p_game_id: game.id });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      wrapperRef.current?.requestFullscreen?.().catch(() => {
        showError("Fullscreen isn't available here.");
      });
    }
  };

  // Desktop gets a viewport-scaled stage so the cabinet is the page's hero
  // instead of a fixed 520px box on every monitor.
  const heightClass = isFullscreen
    ? "h-full"
    : "h-[420px] sm:h-[520px] lg:h-[min(74vh,820px)]";

  // ---- Coming soon: poster only ----
  if (game.status !== "published") {
    return (
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-foreground/10">
        <ArcadeImage
          src={gameArt(game)}
          alt={game.title}
          className="h-[320px] w-full object-cover sm:h-[420px]"
        />
        <div className="absolute inset-x-4 bottom-4 rounded-xl bg-card/95 px-5 py-4 shadow-sm">
          <span className="rounded-full bg-mustard px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest">
            IN PRODUCTION
          </span>
          <p className="mt-2 text-sm font-medium">
            This cabinet is still being wired up. Rate it, favorite it, and
            talk strategy below — it counts.
          </p>
        </div>
      </div>
    );
  }

  const delta = run && runPb !== null ? run.score - runPb : null;
  const claimCta = authCta(`/game/${game.slug}`);

  return (
    <div
      ref={wrapperRef}
      className="relative flex flex-col justify-center overflow-hidden rounded-2xl bg-foreground ring-1 ring-foreground/10"
    >
      <div className={`relative w-full ${heightClass}`}>
        {phase === "idle" ? (
          <>
            <ArcadeImage
              src={gameArt(game)}
              alt={game.title}
              className="h-full w-full object-cover opacity-80"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-foreground/40 p-4">
              <Button
                onClick={start}
                autoFocus
                className="h-14 gap-2.5 rounded-full bg-primary px-8 font-display text-lg font-bold shadow-lg hover:bg-primary/90"
              >
                <Play className="h-5 w-5 fill-current" />
                PLAY
              </Button>
              <p className="max-w-xs text-center text-xs font-medium text-background/90">
                {game.controls}
              </p>
            </div>
          </>
        ) : TrackAGame ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-background/70" />
              </div>
            }
          >
            <TrackAGame
              key={frameKey}
              onScore={(p) => {
                const score = sanitizeScore(p.score, game.score_cap);
                if (score !== null) handleGameOver({ ...p, score });
              }}
              onAchievement={handleAchievement}
            />
          </Suspense>
        ) : game.html_path ? (
          <iframe
            key={frameKey}
            ref={iframeRef}
            src={game.html_path}
            sandbox="allow-scripts"
            title={game.title}
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-background/80">
            This cabinet is missing its game file — the operators have been
            notified.
          </div>
        )}

        {phase === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/50">
            <Loader2 className="h-7 w-7 animate-spin text-background" />
          </div>
        )}

        {/* Game-over overlay */}
        {phase === "over" && run && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xs rounded-2xl bg-card p-6 text-center shadow-lg">
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                RUN OVER
              </p>
              <p className="mt-1.5 font-mono text-5xl font-bold tabular-nums">
                {run.score.toLocaleString()}
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
                {game.score_label.toUpperCase()}
              </p>

              {user && run.score > 0 && (
                <p
                  className={`mt-3 text-sm font-semibold ${
                    delta === null
                      ? "text-olive"
                      : delta > 0
                        ? "text-olive"
                        : "text-muted-foreground"
                  }`}
                >
                  {delta === null
                    ? "First recorded run — welcome aboard."
                    : delta > 0
                      ? `New personal best (+${delta.toLocaleString()})`
                      : `${delta === 0 ? "Matched" : `−${Math.abs(delta).toLocaleString()} vs`} your best of ${runPb!.toLocaleString()}`}
                </p>
              )}

              <div className="mt-2 min-h-5 text-sm font-medium">
                {run.score <= 0 ? (
                  <span className="text-muted-foreground">
                    Zero-{game.score_label.toLowerCase()} runs stay between us.
                  </span>
                ) : submitState === "saving" ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving score…
                  </span>
                ) : submitState === "saved" ? (
                  <span className="inline-flex items-center gap-1.5 text-olive">
                    <Check className="h-4 w-4" />
                    {weeklyRank > 0 ? `Saved · #${weeklyRank} this week` : "Saved to the board"}
                  </span>
                ) : submitState === "rate_limited" ? (
                  <span className="text-muted-foreground">
                    Easy there — scores save once every 10 s. This run wasn't
                    recorded.
                  </span>
                ) : submitState === "error" ? (
                  <span className="text-destructive">Couldn't save this run.</span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {!user && run.score > 0 && (
                  <Button
                    onClick={() => navigate(claimCta.to)}
                    className="h-11 w-full rounded-full bg-primary font-semibold hover:bg-primary/90"
                  >
                    {claimCta.verb} to claim this score
                  </Button>
                )}
                <Button
                  onClick={start}
                  autoFocus={!!user || run.score <= 0}
                  variant={!user && run.score > 0 ? "outline" : "default"}
                  className={`h-11 w-full gap-2 rounded-full font-semibold ${
                    !user && run.score > 0
                      ? "border-border"
                      : "bg-primary hover:bg-primary/90"
                  }`}
                >
                  <RotateCcw className="h-4 w-4" />
                  Play again
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Frame controls */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
        {game.track === "B" && (
          <Tooltip>
            <TooltipTrigger className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm">
              <ShieldCheck className="h-4 w-4" />
              <span className="sr-only">Sandboxed game</span>
            </TooltipTrigger>
            <TooltipContent className="rounded-xl">
              Uploaded game — runs in an isolated sandbox.
            </TooltipContent>
          </Tooltip>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm transition-colors hover:bg-foreground/80"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

export default GamePlayer;
