// Kickflip City Track-A shell. rAF loop drives the engine, drains its event
// queue into sfx / achievements / score, and mirrors HUD values into React
// state only when they change.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, H, W } from "./engine";
import { draw } from "./render";
import { loadSprites, type KickflipSprites } from "./sprites";
import { isMuted, setMuted, sfx } from "./audio";
import { ArrowLeft, ArrowRight, ChevronDown, Pause, Play, Sparkles, Volume2, VolumeX } from "lucide-react";

/**
 * A coarse pointer gets one TRICK pad that cycles kickflip, heelflip and grab
 * on each press. Three separate pads would crowd a phone screen, and the trick
 * a player wanted is one or two taps away rather than a menu.
 */
const TOUCH_TRICKS = ["trickA", "trickB", "trickC"] as const;

const KickflipCity = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) {
    engineRef.current = new Engine();
    // dev playtest lever: lets a console autopilot drive the cabinet
    if (import.meta.env.DEV) {
      (window as unknown as { __kc?: Engine }).__kc = engineRef.current;
    }
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<KickflipSprites | null>(null);
  const keysRef = useRef({
    left: false,
    right: false,
    crouch: false,
    jump: false,
    trickA: false,
    trickB: false,
    trickC: false,
  });
  const padRef = useRef({
    left: false,
    right: false,
    jump: false,
    trickA: false,
    trickB: false,
    trickC: false,
  });
  const trickCycleRef = useRef(0);
  const pausedRef = useRef(false);
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };

  const [ready, setReady] = useState(false);
  const [spriteError, setSpriteError] = useState(false);
  const [paused, setPaused] = useState(false);
  pausedRef.current = paused;
  const [muted, setMutedState] = useState(isMuted);
  const [hud, setHud] = useState({ score: 0, district: "", index: 1, lap: 1, best: 0 });

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
        const keys = keysRef.current;
        const pad = padRef.current;
        const left = keys.left || pad.left;
        const right = keys.right || pad.right;
        eng.input.dir = left === right ? 0 : right ? 1 : -1;
        eng.input.crouch = keys.crouch;
        eng.input.jump = keys.jump || pad.jump;
        eng.input.trickA = keys.trickA || pad.trickA;
        eng.input.trickB = keys.trickB || pad.trickB;
        eng.input.trickC = keys.trickC || pad.trickC;
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

      setHud((h) =>
        h.score === eng.score &&
        h.district === eng.course.name &&
        h.index === eng.districtIndex + 1 &&
        h.lap === eng.lap + 1 &&
        h.best === eng.bestLine
          ? h
          : {
              score: eng.score,
              district: eng.course.name,
              index: eng.districtIndex + 1,
              lap: eng.lap + 1,
              best: eng.bestLine,
            },
      );

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  useEffect(() => {
    const set = (code: string, down: boolean) => {
      const keys = keysRef.current;
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          keys.left = down;
          return true;
        case "ArrowRight":
        case "KeyD":
          keys.right = down;
          return true;
        case "ArrowDown":
        case "KeyS":
          keys.crouch = down;
          return true;
        case "Space":
          keys.jump = down;
          return true;
        case "KeyJ":
          keys.trickA = down;
          return true;
        case "KeyK":
          keys.trickB = down;
          return true;
        case "KeyL":
          keys.trickC = down;
          return true;
        default:
          return false;
      }
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.code === "KeyP" || e.code === "Escape") {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      if (e.code === "KeyM") {
        setMutedState((m) => {
          setMuted(!m);
          return !m;
        });
        return;
      }
      if (set(e.code, true)) e.preventDefault();
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
      if (document.hidden && phase !== "gameover" && phase !== "victory") setPaused(true);
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

  const holdPad = (key: "left" | "right" | "jump") => ({
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

  const trickPad = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      const key = TOUCH_TRICKS[trickCycleRef.current % TOUCH_TRICKS.length];
      trickCycleRef.current++;
      padRef.current[key] = true;
    },
    onPointerUp: () => {
      for (const key of TOUCH_TRICKS) padRef.current[key] = false;
    },
    onPointerCancel: () => {
      for (const key of TOUCH_TRICKS) padRef.current[key] = false;
    },
  };

  return (
    <div className="flex h-full w-full touch-none select-none flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:text-xs">
        <span className="tabular-nums">SCORE {hud.score.toLocaleString()}</span>
        <span className="hidden rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] sm:inline">
          {hud.district}
        </span>
        <span className="rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] tabular-nums text-mustard">
          LAP {hud.lap} · DISTRICT {hud.index}/3
        </span>
        <span className="hidden tabular-nums text-background/70 sm:inline">
          BEST LINE {hud.best.toLocaleString()}
        </span>
        <span className="ml-auto flex items-center gap-2">
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
          className="block h-auto max-h-full max-w-full rounded-xl ring-1 ring-background/10"
          style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(100cqh * ${W / H}))` }}
        />

        {!ready && (
          <p className="absolute font-mono text-[11px] tracking-widest text-background/60">
            {spriteError ? "ART FAILED TO LOAD · RELOAD TO RETRY" : "WAXING THE CURBS…"}
          </p>
        )}

        {coarse && (
          <>
            <div className="absolute bottom-5 left-3 flex gap-2">
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Brake"
                {...holdPad("left")}
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Push"
                {...holdPad("right")}
              >
                <ArrowRight className="h-6 w-6" />
              </button>
            </div>
            <div className="absolute bottom-5 right-3 flex items-center gap-2">
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Trick (cycles kickflip, heelflip, grab)"
                {...trickPad}
              >
                <Sparkles className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-terra/90 text-background shadow-lg active:scale-95"
                aria-label="Ollie"
                {...holdPad("jump")}
              >
                <ChevronDown className="h-7 w-7 rotate-180" />
              </button>
            </div>
          </>
        )}

        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · ←→/A D PUSH AND BRAKE · ↓/S CROUCH LOADS THE OLLIE · SPACE OLLIES · J
              KICKFLIP · K HEELFLIP · L GRAB (HOLD) · M MUTE
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default KickflipCity;
