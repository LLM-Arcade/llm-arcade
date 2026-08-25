// Run 'n Gunner Track-A shell. rAF loop drives the engine, drains its
// event queue into sfx / achievements / score, and mirrors HUD values into
// React state only when they change.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { TUNE, WEAPONS } from "./stages";
import { Engine, H, W } from "./engine";
import { draw } from "./render";
import { loadSprites, type GunnerSprites } from "./sprites";
import { isMuted, setMuted, sfx } from "./audio";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Crosshair,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

const RunNGunner = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) {
    engineRef.current = new Engine();
    // dev playtest lever: lets a console autopilot drive the cabinet
    if (import.meta.env.DEV) {
      (window as unknown as { __rg?: Engine }).__rg = engineRef.current;
    }
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<GunnerSprites | null>(null);
  const keysRef = useRef({ left: false, right: false, up: false, down: false, jump: false, fire: false });
  const padRef = useRef({ left: false, right: false, jump: false, fire: false });
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
    stage: "CANYON ROAD",
    hp: TUNE.playerHp,
    lives: TUNE.lives,
    weapon: "RIFLE",
    banner: "",
    bossHp: 0,
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
        eng.input.up = k.up;
        eng.input.down = k.down;
        eng.input.jump = k.jump || pad.jump;
        eng.input.fire = k.fire || pad.fire;
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

      const weapon = WEAPONS[eng.player.weapon].name;
      const banner = eng.time < eng.bannerUntil ? eng.banner : "";
      const bossHp = eng.boss ? Math.max(0, Math.round((eng.boss.hp / eng.boss.def.hp) * 100)) : 0;
      const stage = eng.stage.def.name;
      setHud((h) =>
        h.score === eng.score &&
        h.stage === stage &&
        h.hp === eng.hp &&
        h.lives === eng.lives &&
        h.weapon === weapon &&
        h.banner === banner &&
        h.bossHp === bossHp
          ? h
          : { score: eng.score, stage, hp: eng.hp, lives: eng.lives, weapon, banner, bossHp },
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
        case "ArrowUp":
        case "KeyW":
          keysRef.current.up = down;
          return true;
        case "ArrowDown":
        case "KeyS":
          keysRef.current.down = down;
          return true;
        case "Space":
        case "KeyZ":
        case "KeyK":
          keysRef.current.jump = down;
          return true;
        case "KeyX":
        case "KeyJ":
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

  const toggleMute = () => {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
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
      {/* HUD */}
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:text-xs">
        <span className="tabular-nums">SCORE {hud.score.toLocaleString()}</span>
        <span className="hidden rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] sm:inline">
          {hud.stage}
        </span>
        <span className="rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] text-mustard">
          {hud.weapon}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="tracking-normal text-olive" aria-label={`${hud.hp} hits left`}>
            {"▮".repeat(Math.max(0, hud.hp))}
            <span className="text-background/25">{"▮".repeat(Math.max(0, TUNE.playerHp - hud.hp))}</span>
          </span>
          <span className="tracking-normal text-terra" aria-label={`${hud.lives} lives`}>
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

      {/* boss meter */}
      {hud.bossHp > 0 && (
        <div className="mx-4 h-1.5 shrink-0 overflow-hidden rounded-full bg-background/15">
          <div
            className="h-full rounded-full bg-[#B33A2B] transition-[width] duration-150"
            style={{ width: `${hud.bossHp}%` }}
          />
        </div>
      )}

      {/* Playfield */}
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
            {spriteError ? "ART FAILED TO LOAD · RELOAD TO RETRY" : "LOADING THE ROAD…"}
          </p>
        )}

        {hud.banner && !paused && (
          <p className="pointer-events-none absolute top-[30%] px-4 text-center font-display text-2xl font-extrabold tracking-wide text-background drop-shadow-sm">
            {hud.banner}
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
            <div className="absolute bottom-5 right-3 flex gap-2">
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/15 text-background active:bg-background/30"
                aria-label="Jump"
                {...padProps("jump")}
              >
                <ArrowUpFromLine className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-terra/90 text-background shadow-lg active:scale-95"
                aria-label="Fire"
                {...padProps("fire")}
              >
                <Crosshair className="h-6 w-6" />
              </button>
            </div>
          </>
        )}

        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · ←→/A D RUN · ↑/W AIM UP · SPACE/Z JUMP · X/J FIRE · ↓+JUMP DROPS THROUGH
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RunNGunner;
