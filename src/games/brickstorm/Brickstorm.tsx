// Brickstorm Track-A shell. rAF loop drives the engine, drains its event
// queue into sfx / achievements / score, and mirrors HUD values into React
// state only when they change.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, H, TUNE, W } from "./engine";
import { draw } from "./render";
import { loadSprites, type BrickstormSprites } from "./sprites";
import { isMuted, setMuted, sfx } from "./audio";
import { ArrowLeft, ArrowRight, Pause, Play, Rocket, Volume2, VolumeX } from "lucide-react";

const powerChips = (eng: Engine): string => {
  const on: string[] = [];
  if (eng.time < eng.expandUntil) on.push("EXPAND");
  if (eng.time < eng.slowUntil) on.push("SLOW");
  if (eng.time < eng.fireUntil) on.push("FIRE");
  if (eng.time < eng.stickyUntil) on.push("STICKY");
  if (eng.time < eng.multiUntil) on.push("x2");
  if (eng.shield) on.push("SHIELD");
  return on.join(" ");
};

const Brickstorm = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) {
    engineRef.current = new Engine();
    // dev playtest lever: lets a console autopilot drive the cabinet
    if (import.meta.env.DEV) {
      (window as unknown as { __bs?: Engine }).__bs = engineRef.current;
    }
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<BrickstormSprites | null>(null);
  const keysRef = useRef({ left: false, right: false, launch: false });
  const padRef = useRef({ left: false, right: false, launch: false });
  const pointerRef = useRef<number | null>(null);
  const tapRef = useRef(0);
  const pausedRef = useRef(false);
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };

  const [ready, setReady] = useState(false);
  const [spriteError, setSpriteError] = useState(false);
  const [paused, setPaused] = useState(false);
  pausedRef.current = paused;
  const [muted, setMutedState] = useState(isMuted);
  const [hud, setHud] = useState({
    score: 0,
    board: "",
    loop: 0,
    lives: TUNE.lives as number,
    powers: "",
    phase: "serve" as Engine["phase"],
  });

  const coarse = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  useEffect(() => {
    let alive = true;
    loadSprites()
      .then((s) => {
        if (!alive) return;
        spritesRef.current = s;
        setReady(true);
      })
      .catch(() => {
        if (alive) setSpriteError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = true;

    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;
      const eng = engineRef.current;

      if (!pausedRef.current) {
        const k = keysRef.current;
        const pad = padRef.current;
        eng.input.dir = (k.left || pad.left ? -1 : 0) + (k.right || pad.right ? 1 : 0);
        eng.input.pointerX = pointerRef.current;
        eng.input.launch = k.launch || pad.launch || tapRef.current > 0;
        if (tapRef.current > 0) tapRef.current--;
        eng.update(dt);
        for (const event of eng.drainEvents()) {
          switch (event.type) {
            case "sfx":
              sfx[event.sound]();
              break;
            case "achievement":
              callbacksRef.current.onAchievement(event.slug);
              break;
            case "gameover":
              callbacksRef.current.onScore({ score: event.score, stats: event.stats });
              break;
          }
        }
      }

      draw(ctx, eng, spritesRef.current!);

      const powers = powerChips(eng);
      const board = eng.board.name;
      setHud((h) =>
        h.score === eng.score &&
        h.board === board &&
        h.loop === eng.loop &&
        h.lives === eng.lives &&
        h.powers === powers &&
        h.phase === eng.phase
          ? h
          : { score: eng.score, board, loop: eng.loop, lives: eng.lives, powers, phase: eng.phase },
      );

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  useEffect(() => {
    const set = (code: string, down: boolean): boolean => {
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          keysRef.current.left = down;
          if (down) pointerRef.current = null;
          return true;
        case "ArrowRight":
        case "KeyD":
          keysRef.current.right = down;
          if (down) pointerRef.current = null;
          return true;
        case "Space":
        case "KeyW":
        case "ArrowUp":
          keysRef.current.launch = down;
          return true;
      }
      return false;
    };
    const onDown = (e: KeyboardEvent) => {
      if (set(e.code, true)) {
        e.preventDefault();
        return;
      }
      if (e.code === "KeyP" || e.code === "Escape") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.code === "KeyM") {
        setMutedState((m) => {
          setMuted(!m);
          return !m;
        });
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (set(e.code, false)) e.preventDefault();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    const onHide = () => {
      const phase = engineRef.current.phase;
      if (document.hidden && phase !== "gameover") setPaused(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const toggleMute = () => {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
  };

  const trackPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    pointerRef.current = ((e.clientX - rect.left) / rect.width) * W;
  };

  const padProps = (key: keyof typeof padRef.current) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      padRef.current[key] = true;
    },
    onPointerUp: () => {
      padRef.current[key] = false;
    },
    onPointerCancel: () => {
      padRef.current[key] = false;
    },
  });

  return (
    <div className="flex h-full w-full touch-none select-none flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:text-xs">
        <span className="tabular-nums">SCORE {hud.score.toLocaleString()}</span>
        <span className="hidden rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] sm:inline">
          {hud.loop > 0 ? `LOOP ${hud.loop + 1} · ${hud.board}` : hud.board}
        </span>
        {hud.powers && (
          <span className="rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] text-mustard">
            {hud.powers}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="tracking-normal text-terra" aria-label={`${hud.lives} lives`}>
            {"●".repeat(Math.max(0, Math.min(TUNE.maxLives, hud.lives)))}
          </span>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-background/80 transition-colors hover:bg-background/10"
            aria-label={paused ? "Resume (P)" : "Pause (P)"}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-8 w-8 items-center justify-center rounded-full text-background/80 transition-colors hover:bg-background/10"
            aria-label={muted ? "Unmute (M)" : "Mute (M)"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </span>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2 pt-1"
        style={{ containerType: "size" }}
      >
        <canvas
          ref={canvasRef}
          width={W * 2}
          height={H * 2}
          onPointerMove={trackPointer}
          onPointerDown={(e) => {
            trackPointer(e);
            tapRef.current = 2;
          }}
          className="block h-auto max-h-full max-w-full rounded-xl ring-1 ring-background/10"
          style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(100cqh * ${W / H}))` }}
        />

        {!ready && (
          <p className="absolute font-mono text-[11px] tracking-widest text-background/60">
            {spriteError ? "ART FAILED TO LOAD · RELOAD TO RETRY" : "OPENING THE WORKSHOP…"}
          </p>
        )}

        {ready && hud.phase === "serve" && !paused && (
          <p className="pointer-events-none absolute bottom-[18%] font-mono text-[11px] tracking-widest text-background/80">
            SPACE OR TAP TO LAUNCH
          </p>
        )}

        {ready && hud.phase === "board-clear" && !paused && (
          <p className="pointer-events-none absolute top-[32%] px-4 text-center font-display text-2xl font-extrabold tracking-wide text-background drop-shadow-sm">
            {hud.loop > 0 ? `LOOP ${hud.loop + 1} · ${hud.board}` : hud.board} CLEAR
          </p>
        )}

        {coarse && (
          <>
            <div className="absolute bottom-5 left-3 flex gap-2">
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Move left"
                {...padProps("left")}
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Move right"
                {...padProps("right")}
              >
                <ArrowRight className="h-6 w-6" />
              </button>
            </div>
            <button
              type="button"
              className="absolute bottom-5 right-3 flex h-14 w-14 items-center justify-center rounded-full bg-terra/90 text-background shadow-lg active:scale-95"
              aria-label="Launch"
              {...padProps("launch")}
            >
              <Rocket className="h-6 w-6" />
            </button>
          </>
        )}

        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · ←→/A D SLIDE · MOUSE STEERS · SPACE/W LAUNCHES · M MUTE
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Brickstorm;
