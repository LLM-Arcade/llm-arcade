// Hyper Circuit Track-A shell. rAF loop drives the engine, drains its
// event queue into sfx / achievements / score, rebuilds the ground
// texture on circuit change, and mirrors HUD values into React state.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, LAPS } from "./engine";
import { createCamera, draw, H, REF_MAX_SPEED, W } from "./render";
import { buildGroundTexture, type GroundTexture } from "./track-texture";
import { loadSprites, type HyperSprites } from "./sprites";
import { isMuted, setHumLevel, setMuted, sfx, startHum, stopHum } from "./audio";
import { Pause, Play, Volume2, VolumeX, Zap } from "lucide-react";

const POS_LABEL = ["1ST", "2ND", "3RD", "4TH", "5TH"];

const fmtLap = (s: number | null) => (s === null ? "--.--" : s.toFixed(2));

const HyperCircuit = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) {
    engineRef.current = new Engine();
    // dev playtest lever: lets a console autopilot drive the cabinet
    if (import.meta.env.DEV) {
      (window as unknown as { __hc?: Engine }).__hc = engineRef.current;
    }
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<HyperSprites | null>(null);
  const groundRef = useRef<{ index: number; tex: GroundTexture | null }>({
    index: -1,
    tex: null,
  });
  const cameraRef = useRef(createCamera());
  const keysRef = useRef({ left: false, right: false, accel: false, brake: false, boost: false });
  const touchRef = useRef({ active: false, originX: 0, steer: 0, boost: false });
  const pausedRef = useRef(false);
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };

  const [ready, setReady] = useState(false);
  const [spriteError, setSpriteError] = useState(false);
  const [paused, setPaused] = useState(false);
  pausedRef.current = paused;
  const [muted, setMutedState] = useState(isMuted);
  const [hud, setHud] = useState({
    speed: 0,
    lap: 1,
    pos: 5,
    time: "0.00",
    best: "--.--",
    shield: 100,
    banner: "",
    count: 0,
    circuit: "",
    phase: "countdown" as Engine["phase"],
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

  // main loop
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;
      const eng = engineRef.current;
      const spr = spritesRef.current!;

      // Composing the ground texture takes tens of ms, but only at a
      // circuit boundary where the countdown hides the hitch.
      if (groundRef.current.index !== eng.circuitIndex) {
        groundRef.current.tex = buildGroundTexture(eng.track, spr);
        groundRef.current.index = eng.circuitIndex;
        cameraRef.current.initialized = false;
      }

      if (!pausedRef.current) {
        const k = keysRef.current;
        const touch = touchRef.current;
        eng.input.steer = touch.active
          ? touch.steer
          : (k.left ? -1 : 0) + (k.right ? 1 : 0);
        eng.input.accel = k.accel || touch.active;
        eng.input.brake = k.brake;
        eng.input.boost = k.boost || touch.boost;
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
        if (eng.phase === "racing" || eng.phase === "finished") {
          startHum();
          setHumLevel(Math.min(1, eng.player.speed / REF_MAX_SPEED), eng.isBoosting);
        } else {
          stopHum();
        }
      } else {
        stopHum();
      }

      draw(ctx, eng, spr, groundRef.current.tex!, cameraRef.current, pausedRef.current ? 0 : dt);

      const speed = Math.round(eng.player.speed * 1.9);
      const time = eng.currentLapTime.toFixed(2);
      const best = fmtLap(eng.bestLap);
      const shield = Math.max(0, Math.round(eng.player.shield));
      const banner = eng.time < eng.bannerUntil ? eng.banner : "";
      const count =
        eng.phase === "countdown" ? Math.min(3, Math.max(1, Math.ceil(eng.countdown))) : 0;
      const circuit = eng.track.def.name;
      setHud((h) =>
        h.speed === speed &&
        h.lap === eng.player.lap &&
        h.pos === eng.position &&
        h.time === time &&
        h.best === best &&
        h.shield === shield &&
        h.banner === banner &&
        h.count === count &&
        h.circuit === circuit &&
        h.phase === eng.phase
          ? h
          : {
              speed,
              lap: eng.player.lap,
              pos: eng.position,
              time,
              best,
              shield,
              banner,
              count,
              circuit,
              phase: eng.phase,
            },
      );

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stopHum();
    };
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
        case "ArrowUp":
        case "KeyW":
          keysRef.current.accel = down;
          return true;
        case "ArrowDown":
        case "KeyS":
          keysRef.current.brake = down;
          return true;
        case "Space":
        case "ShiftLeft":
          keysRef.current.boost = down;
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

  // touch: drag horizontally to steer, hold to accelerate
  const onPointerDown = (e: React.PointerEvent) => {
    if (pausedRef.current || e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    touchRef.current.active = true;
    touchRef.current.originX = e.clientX;
    touchRef.current.steer = 0;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const touch = touchRef.current;
    if (!touch.active) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const span = Math.max(60, rect.width * 0.22);
    touch.steer = Math.max(-1, Math.min(1, (e.clientX - touch.originX) / span));
  };
  const endPointer = () => {
    touchRef.current.active = false;
    touchRef.current.steer = 0;
  };

  const toggleMute = () => {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
  };

  const shieldLow = hud.shield < 25;

  return (
    <div className="flex h-full w-full touch-none select-none flex-col">
      {/* HUD */}
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:text-xs">
        <span className="rounded-full bg-background/10 px-2.5 py-0.5 text-[10px]">
          {hud.circuit}
        </span>
        <span className="tabular-nums">LAP {Math.min(hud.lap, LAPS)}/{LAPS}</span>
        <span className="tabular-nums text-mustard">{POS_LABEL[hud.pos - 1]}</span>
        <span className="hidden tabular-nums sm:inline">{hud.speed} KM/H</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="tabular-nums">
            {hud.time} <span className="text-background/50">BEST {hud.best}</span>
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

      {/* shield bar */}
      <div className="mx-4 h-1.5 shrink-0 overflow-hidden rounded-full bg-background/15">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ${shieldLow ? "bg-[#B33A2B]" : "bg-terra"}`}
          style={{ width: `${hud.shield}%` }}
        />
      </div>

      {/* Playfield */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2 pt-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="h-full w-auto max-w-full rounded-xl ring-1 ring-background/10"
          style={{ aspectRatio: `${W} / ${H}`, objectFit: "contain", imageRendering: "pixelated" }}
        />

        {!ready && (
          <p className="absolute font-mono text-[11px] tracking-widest text-background/60">
            {spriteError ? "ART FAILED TO LOAD · RELOAD TO RETRY" : "LOADING THE GRID…"}
          </p>
        )}

        {hud.count > 0 && !paused && (
          <p className="pointer-events-none absolute top-[26%] font-display text-6xl font-extrabold text-background drop-shadow-sm">
            {hud.count}
          </p>
        )}

        {hud.banner && !paused && (
          <p className="pointer-events-none absolute top-[42%] px-4 text-center font-display text-2xl font-extrabold tracking-wide text-background drop-shadow-sm">
            {hud.banner}
          </p>
        )}

        {coarse && (
          <button
            type="button"
            className="absolute bottom-6 right-4 flex h-16 w-16 items-center justify-center rounded-full bg-terra/90 text-background shadow-lg active:scale-95"
            aria-label="Boost"
            onPointerDown={(e) => {
              e.stopPropagation();
              touchRef.current.boost = true;
            }}
            onPointerUp={() => {
              touchRef.current.boost = false;
            }}
            onPointerCancel={() => {
              touchRef.current.boost = false;
            }}
          >
            <Zap className="h-7 w-7" />
          </button>
        )}

        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · ←→/A D STEER · ↑/W GAS · ↓/S BRAKE · SPACE BOOST · DRAG + HOLD ON TOUCH
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HyperCircuit;
