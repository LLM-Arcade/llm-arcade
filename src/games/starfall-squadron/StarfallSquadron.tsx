// Starfall Squadron — Track-A shell. rAF loop drives the engine, drains
// its event queue into sfx / achievements / score, and mirrors HUD values
// into React state only when they change.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, H, W } from "./engine";
import { draw } from "./render";
import { loadSprites, type StarfallSprites } from "./sprites";
import { isMuted, setMuted, sfx } from "./audio";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

const StarfallSquadron = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) engineRef.current = new Engine();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spritesRef = useRef<StarfallSprites | null>(null);
  const keysRef = useRef({ left: false, right: false, fire: false });
  const pausedRef = useRef(false);
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };

  const [ready, setReady] = useState(false);
  const [spriteError, setSpriteError] = useState(false);
  const [paused, setPaused] = useState(false);
  pausedRef.current = paused;
  const [muted, setMutedState] = useState(isMuted);
  const [hud, setHud] = useState({ score: 0, wave: 1, lives: 3, chain: 0, banner: "" });

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

  // main loop
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
        eng.input.dir = (keysRef.current.left ? -1 : 0) + (keysRef.current.right ? 1 : 0);
        eng.input.fire = keysRef.current.fire;
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
        h.wave === eng.wave &&
        h.lives === eng.lives &&
        h.chain === eng.chain &&
        h.banner === eng.banner
          ? h
          : { score: eng.score, wave: eng.wave, lives: eng.lives, chain: eng.chain, banner: eng.banner },
      );

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // keyboard
  useEffect(() => {
    const set = (code: string, down: boolean): boolean => {
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          keysRef.current.left = down;
          return true;
        case "ArrowRight":
        case "KeyD":
          keysRef.current.right = down;
          return true;
        case "Space":
        case "ArrowUp":
        case "KeyW":
          keysRef.current.fire = down;
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

  // auto-pause on tab hide
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && engineRef.current.phase !== "gameover") setPaused(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // touch / pointer steering: drag to move, hold to autofire
  const pointerTo = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    engineRef.current.input.targetX = ((clientX - rect.left) / rect.width) * W;
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (pausedRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerTo(e.clientX);
    keysRef.current.fire = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons > 0 || e.pointerType === "touch") pointerTo(e.clientX);
  };
  const endPointer = () => {
    keysRef.current.fire = false;
    engineRef.current.input.targetX = null;
  };

  const toggleMute = () => {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
  };

  return (
    <div className="flex h-full w-full touch-none select-none flex-col">
      {/* HUD */}
      <div className="flex h-10 shrink-0 items-center gap-4 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:text-xs">
        <span className="tabular-nums">SCORE {hud.score.toLocaleString()}</span>
        <span className="tabular-nums">WAVE {hud.wave}</span>
        {hud.chain >= 2 && <span className="tabular-nums text-mustard">CHAIN ×{hud.chain}</span>}
        <span className="ml-auto flex items-center gap-2">
          <span className="tracking-normal text-terra" aria-label={`${hud.lives} ships`}>
            {"▲".repeat(Math.max(0, Math.min(5, hud.lives)))}
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

      {/* Playfield */}
      <div
        ref={wrapRef}
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <canvas
          ref={canvasRef}
          width={W * 2}
          height={H * 2}
          className="h-full w-auto max-w-full rounded-xl ring-1 ring-background/10"
          style={{ aspectRatio: `${W} / ${H}`, objectFit: "contain" }}
        />

        {!ready && (
          <p className="absolute font-mono text-[11px] tracking-widest text-background/60">
            {spriteError ? "ART FAILED TO LOAD · RELOAD TO RETRY" : "LOADING SQUADRON…"}
          </p>
        )}

        {hud.banner && !paused && (
          <p className="pointer-events-none absolute top-[30%] font-display text-2xl font-extrabold tracking-wide text-background drop-shadow-sm">
            {hud.banner}
          </p>
        )}

        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · ←→/A D MOVE · SPACE FIRE · DRAG + HOLD ON TOUCH
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StarfallSquadron;
