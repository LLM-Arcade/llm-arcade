// Flagstone — Track-A logic cabinet. React shell: game loop, input (keys +
// touch), HUD, pause/mute, SDK callbacks. No sprite loading: the puzzle is
// the picture, so there is no art to wait for.

import { useEffect, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, TUNE } from "./engine.ts";
import { H, W, render } from "./render.ts";
import { isMuted, setMuted, sfx } from "./audio.ts";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Flag, Hammer, Pause, Play, Volume2, VolumeX } from "lucide-react";

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1],
  KeyA: [0, -1],
  ArrowRight: [0, 1],
  KeyD: [0, 1],
  ArrowUp: [-1, 0],
  KeyW: [-1, 0],
  ArrowDown: [1, 0],
  KeyS: [1, 0],
};

const Flagstone = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) engineRef.current = new Engine();

  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [hud, setHud] = useState({
    score: 0,
    misses: 0,
    mult: 1,
    slab: 1,
    name: engineRef.current.puzzle.name,
    size: `${engineRef.current.puzzle.w}×${engineRef.current.puzzle.h}`,
    phase: engineRef.current.phase as string,
  });

  const coarse = useRef(
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  ).current;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };

  // Game loop
  useEffect(() => {
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
              if (event.sound === "fill") sfx.fill(eng.multiplier);
              else sfx[event.sound]();
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
      render(ctx, eng);

      setHud((prev) =>
        prev.score === eng.score &&
        prev.misses === eng.mistakes &&
        prev.mult === eng.multiplier &&
        prev.slab === eng.puzzleIndex + 1 &&
        prev.phase === eng.phase &&
        prev.name === eng.puzzle.name
          ? prev
          : {
              score: eng.score,
              misses: eng.mistakes,
              mult: eng.multiplier,
              slab: eng.puzzleIndex + 1,
              name: eng.puzzle.name,
              size: `${eng.puzzle.w}×${eng.puzzle.h}`,
              phase: eng.phase,
            },
      );

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.code];
      if (dir) {
        e.preventDefault();
        if (!pausedRef.current) engineRef.current.move(dir[0], dir[1]);
        return;
      }
      switch (e.code) {
        case "Space":
        case "KeyZ":
        case "Enter":
          e.preventDefault();
          if (!pausedRef.current) engineRef.current.fill();
          break;
        case "KeyX":
        case "KeyF":
          e.preventDefault();
          if (!pausedRef.current) engineRef.current.flag();
          break;
        case "KeyC":
        case "Backspace":
          e.preventDefault();
          if (!pausedRef.current) engineRef.current.clear();
          break;
        case "KeyP":
        case "Escape":
          e.preventDefault();
          setPaused((p) => !p);
          break;
        case "KeyM":
          setMutedState((m) => {
            setMuted(!m);
            return !m;
          });
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Touch: press-and-hold repeats, so stepping across a 15x15 grid is quick.
  const holdRef = useRef<number | null>(null);
  const stopHold = () => {
    if (holdRef.current !== null) {
      window.clearInterval(holdRef.current);
      holdRef.current = null;
    }
  };
  const hold = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      if (pausedRef.current) return;
      fn();
      stopHold();
      holdRef.current = window.setInterval(() => {
        if (!pausedRef.current) fn();
      }, 130);
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  const left = Math.max(0, TUNE.maxMistakes - hud.misses);

  return (
    <div className="flex h-full w-full touch-none select-none flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:text-xs">
        <span className="tabular-nums">SCORE {hud.score.toLocaleString()}</span>
        <span className="hidden rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] sm:inline">
          {hud.name.toUpperCase()} {hud.size}
        </span>
        <span className="rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] text-mustard">
          SLAB {hud.slab}/6 · x{hud.mult}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="tracking-normal text-terra" aria-label={`${left} misses left`}>
            {"●".repeat(left)}
            {"○".repeat(TUNE.maxMistakes - left)}
          </span>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-background/80 transition-colors hover:bg-background/10"
            aria-label={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() =>
              setMutedState((m) => {
                setMuted(!m);
                return !m;
              })
            }
            className="flex h-8 w-8 items-center justify-center rounded-full text-background/80 transition-colors hover:bg-background/10"
            aria-label={muted ? "Unmute" : "Mute"}
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
          aria-label="Flagstone puzzle grid"
          role="img"
          className="block h-auto max-h-full max-w-full rounded-xl ring-1 ring-background/10"
          style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(100cqh * ${W / H}))` }}
        />

        {coarse && hud.phase === "playing" && !paused && (
          <>
            <div className="absolute bottom-4 left-3 grid grid-cols-3 gap-1.5">
              <span />
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Up"
                {...hold(() => engineRef.current.move(-1, 0))}
              >
                <ArrowUp className="h-5 w-5" />
              </button>
              <span />
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Left"
                {...hold(() => engineRef.current.move(0, -1))}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Right"
                {...hold(() => engineRef.current.move(0, 1))}
              >
                <ArrowRight className="h-5 w-5" />
              </button>
              <span />
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Down"
                {...hold(() => engineRef.current.move(1, 0))}
              >
                <ArrowDown className="h-5 w-5" />
              </button>
              <span />
            </div>
            <div className="absolute bottom-4 right-3 flex items-end gap-2">
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-mustard/85 text-background active:scale-95"
                aria-label="Flag"
                onClick={() => {
                  if (!pausedRef.current) engineRef.current.flag();
                }}
              >
                <Flag className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-terra/90 text-background shadow-lg active:scale-95"
                aria-label="Set stone"
                onClick={() => {
                  if (!pausedRef.current) engineRef.current.fill();
                }}
              >
                <Hammer className="h-6 w-6" />
              </button>
            </div>
          </>
        )}

        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · ARROWS MOVE · SPACE SETS · X FLAGS · M MUTE
            </p>
          </div>
        )}
      </div>

      <p className="shrink-0 pb-2 pt-1 text-center font-mono text-[10px] tracking-widest text-background/50">
        {coarse
          ? "HOLD THE PAD TO MOVE · HAMMER SETS · FLAG MARKS"
          : "ARROWS MOVE · SPACE SETS · X FLAGS · C CLEARS · P PAUSE"}
      </p>
    </div>
  );
};

export default Flagstone;
