// Sky Defense Track-A shell. rAF loop drives the engine, drains its event
// queue into sfx / achievements / score, and mirrors HUD values into React
// state only when they change.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, H, TUNE, W } from "./engine";
import { draw } from "./render";
import { loadSprites, type SkyDefenseSprites } from "./sprites";
import { isMuted, setMuted, sfx } from "./audio";
import { ArrowLeft, ArrowRight, Crosshair, Pause, Play, Volume2, VolumeX } from "lucide-react";

const SkyDefense = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) {
    engineRef.current = new Engine();
    // dev playtest lever: lets a console autopilot drive the cabinet
    if (import.meta.env.DEV) {
      (window as unknown as { __sd?: Engine }).__sd = engineRef.current;
    }
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<SkyDefenseSprites | null>(null);
  const keysRef = useRef({ fire: false });
  const padRef = useRef({ fire: false });
  const pausedRef = useRef(false);
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };

  const [ready, setReady] = useState(false);
  const [spriteError, setSpriteError] = useState(false);
  const [paused, setPaused] = useState(false);
  pausedRef.current = paused;
  const [muted, setMutedState] = useState(isMuted);
  const [hud, setHud] = useState<{
    score: number;
    region: string;
    wave: number;
    waves: number;
    ammo: number;
    reloading: boolean;
  }>({
    score: 0,
    region: "",
    wave: 1,
    waves: 1,
    ammo: TUNE.magazine,
    reloading: false,
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
        eng.input.fire = keysRef.current.fire || padRef.current.fire;
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

      draw(ctx, eng, spritesRef.current!, coarse);

      const reloading = eng.reloading > 0;
      setHud((h) =>
        h.score === eng.score &&
        h.region === eng.region.name &&
        h.wave === eng.waveIndex + 1 &&
        h.waves === eng.region.waves.length &&
        h.ammo === eng.ammo &&
        h.reloading === reloading
          ? h
          : {
              score: eng.score,
              region: eng.region.name,
              wave: eng.waveIndex + 1,
              waves: eng.region.waves.length,
              ammo: eng.ammo,
              reloading,
            },
      );

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, coarse]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          e.preventDefault();
          if (!pausedRef.current) engineRef.current.stepAim(-1);
          return;
        case "ArrowRight":
        case "KeyD":
          e.preventDefault();
          if (!pausedRef.current) engineRef.current.stepAim(1);
          return;
        case "Space":
          e.preventDefault();
          keysRef.current.fire = true;
          return;
        case "KeyP":
        case "Escape":
          e.preventDefault();
          setPaused((p) => !p);
          return;
        case "KeyM":
          setMutedState((m) => {
            setMuted(!m);
            return !m;
          });
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      keysRef.current.fire = false;
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

  const aimAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const input = engineRef.current.input;
    input.aimX = ((clientX - rect.left) / rect.width) * W;
    input.aimY = ((clientY - rect.top) / rect.height) * H;
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (pausedRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    aimAt(e.clientX, e.clientY);
    // A coarse pointer aims by dragging and fires from its own pad, so a
    // touch that lands on the sky must not also take a shot.
    if (!coarse) keysRef.current.fire = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pausedRef.current) return;
    if (coarse && e.buttons === 0 && e.pointerType === "touch") return;
    aimAt(e.clientX, e.clientY);
  };
  const endPointer = () => {
    keysRef.current.fire = false;
  };

  const toggleMute = () => {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
  };

  const holdFire = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      padRef.current.fire = true;
    },
    onPointerUp: () => {
      padRef.current.fire = false;
    },
    onPointerCancel: () => {
      padRef.current.fire = false;
    },
  };

  const stepPad = (dir: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      engineRef.current.stepAim(dir);
    },
  });

  return (
    <div className="flex h-full w-full touch-none select-none flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:text-xs">
        <span className="tabular-nums">SCORE {hud.score.toLocaleString()}</span>
        <span className="hidden rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] sm:inline">
          {hud.region}
        </span>
        <span className="rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] tabular-nums text-mustard">
          WAVE {hud.wave}/{hud.waves}
        </span>
        <span
          className="flex items-center gap-1"
          aria-label={hud.reloading ? "Reloading" : `${hud.ammo} rounds`}
        >
          {Array.from({ length: TUNE.magazine }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i < hud.ammo ? "bg-terra" : "bg-background/25"}`}
            />
          ))}
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        />

        {!ready && (
          <p className="absolute font-mono text-[11px] tracking-widest text-background/60">
            {spriteError ? "ART FAILED TO LOAD · RELOAD TO RETRY" : "RAISING THE BATTERY…"}
          </p>
        )}

        {coarse && (
          <>
            <div className="absolute bottom-5 left-3 flex gap-2">
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Aim left"
                {...stepPad(-1)}
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Aim right"
                {...stepPad(1)}
              >
                <ArrowRight className="h-6 w-6" />
              </button>
            </div>
            <button
              type="button"
              className="absolute bottom-5 right-3 flex h-16 w-16 items-center justify-center rounded-full bg-terra/90 text-background shadow-lg active:scale-95"
              aria-label="Fire"
              {...holdFire}
            >
              <Crosshair className="h-7 w-7" />
            </button>
          </>
        )}

        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · ←→/A D STEP THE AIM · MOUSE AIMS · SPACE/CLICK FIRES · M MUTE
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SkyDefense;
