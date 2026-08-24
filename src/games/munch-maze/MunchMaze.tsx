// Munch Maze — Track-A flagship cabinet. React shell: sprite loading,
// game loop, input (keys + swipe), HUD, pause/mute, SDK callbacks.

import { useEffect, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, type Dir } from "./engine";
import { loadSprites, type MunchSprites } from "./sprites";
import { render, resetRenderCache } from "./render";
import { setMuted, sfx } from "./audio";
import { BOARD_H, BOARD_W } from "./maze";
import { Heart, Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";

const KEY_DIRS: Record<string, Dir> = {
  ArrowRight: 0,
  KeyD: 0,
  ArrowDown: 1,
  KeyS: 1,
  ArrowLeft: 2,
  KeyA: 2,
  ArrowUp: 3,
  KeyW: 3,
};

const MunchMaze = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) engineRef.current = new Engine();

  const [sprites, setSprites] = useState<MunchSprites | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(false);
  // HUD mirrors of engine state (updated once per frame)
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1 });
  const [phase, setPhase] = useState(engineRef.current.phase);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };

  useEffect(() => {
    let alive = true;
    resetRenderCache();
    void loadSprites().then((s) => {
      if (alive) setSprites(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (!sprites) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const eng = engineRef.current;
    let raf = 0;
    let last = performance.now();

    const frame = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;

      if (!pausedRef.current) {
        eng.update(dt);
        for (const event of eng.drainEvents()) {
          switch (event.type) {
            case "sfx":
              sfx[event.sound]();
              break;
            case "sfx-ghost":
              sfx.ghost(event.combo);
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

      ctx.setTransform(2, 0, 0, 2, 0, 0); // 2x backing store
      render(ctx, eng, sprites, t / 1000);

      setHud((prev) =>
        prev.score === eng.score && prev.lives === eng.lives && prev.level === eng.level
          ? prev
          : { score: eng.score, lives: eng.lives, level: eng.level },
      );
      setPhase((prev) => (prev === eng.phase ? prev : eng.phase));

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sprites]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_DIRS[e.code];
      if (dir !== undefined) {
        e.preventDefault();
        engineRef.current.setDirection(dir);
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-pause when the tab hides
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && engineRef.current.phase === "running") setPaused(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Touch: swipe steers
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
    engineRef.current.setDirection(dir);
    touchRef.current = { x: t.clientX, y: t.clientY };
  };

  const toggleMute = () => {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
  };

  if (!sprites) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-background/70" />
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full touch-none select-none flex-col"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {/* HUD */}
      <div className="flex h-11 shrink-0 items-center gap-4 px-4 font-mono text-xs tracking-widest text-background/90">
        <span className="tabular-nums">SCORE {hud.score.toLocaleString()}</span>
        <span>MAZE {hud.level}</span>
        <span className="flex items-center gap-1">
          {Array.from({ length: Math.max(0, hud.lives - 1) }).map((_, i) => (
            <Heart key={i} className="h-3.5 w-3.5 fill-terra text-terra" />
          ))}
          {hud.lives <= 1 && <span className="text-background/50">LAST LIFE</span>}
        </span>
        <span className="ml-auto flex items-center gap-1">
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

      {/* Board */}
      <div className="relative min-h-0 flex-1 px-2 pb-2">
        <canvas
          ref={canvasRef}
          width={BOARD_W * 2}
          height={BOARD_H * 2}
          className="mx-auto h-full w-full rounded-xl object-contain"
        />

        {phase === "ready" && !paused && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-full bg-mustard px-5 py-1.5 font-display text-lg font-extrabold tracking-wide text-foreground shadow-lg">
              READY!
            </p>
          </div>
        )}
        {paused && phase !== "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · SWIPE OR ARROWS/WASD TO STEER
            </p>
          </div>
        )}
        {phase === "clear" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-full bg-olive px-5 py-1.5 font-display text-lg font-extrabold tracking-wide text-primary-foreground shadow-lg">
              MAZE {hud.level} CLEAR!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MunchMaze;
