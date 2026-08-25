// The Undervault Track-A cabinet. Turn based like Rune & Ruin: every input
// runs one engine turn and drains the event queue. The rAF loop here only
// redraws, so idle frames and status pulses read off the wall clock and the
// engine stays a pure function of its seed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, type Action, type Card } from "./engine";
import { PORTRAITS } from "./content";
import { H, W, draw } from "./render";
import { loadSprites, type UndervaultSprites } from "./sprites";
import { isMuted, setMuted, sfx } from "./audio";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FlaskConical,
  Hourglass,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

const KEY_MOVES: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  KeyD: [1, 0],
  KeyL: [1, 0],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  KeyH: [-1, 0],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  KeyJ: [0, 1],
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  KeyK: [0, -1],
};

const CHOICE_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
};

const PORTRAIT_VIEW = PORTRAITS.map((p) => ({ name: p.name, perk: p.perk, art: p.art }));

const pct = (value: number, span: number) => `${(value / span) * 100}%`;

interface Hud {
  phase: string;
  score: number;
  hp: number;
  maxHp: number;
  depth: number;
  tonics: number;
  card: Card | null;
}

const readHud = (eng: Engine): Hud => ({
  phase: eng.phase,
  score: eng.score,
  hp: eng.hp,
  maxHp: eng.maxHp,
  depth: eng.depth,
  tonics: eng.tonics,
  card: eng.card,
});

const sameHud = (a: Hud, b: Hud) =>
  a.phase === b.phase &&
  a.score === b.score &&
  a.hp === b.hp &&
  a.maxHp === b.maxHp &&
  a.depth === b.depth &&
  a.tonics === b.tonics &&
  a.card === b.card;

const TheUndervault = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) {
    engineRef.current = new Engine(Math.floor(Math.random() * 0xffffffff));
    if (import.meta.env.DEV) {
      (window as unknown as { __uv?: Engine }).__uv = engineRef.current;
    }
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<UndervaultSprites | null>(null);
  const pausedRef = useRef(false);
  const lastActRef = useRef(0);
  const repeatRef = useRef<number | null>(null);
  const fallenAtRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };

  const [ready, setReady] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  pausedRef.current = paused;
  const [muted, setMutedState] = useState(isMuted);
  const [hud, setHud] = useState<Hud>(() => readHud(engineRef.current));

  const coarse = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  useEffect(() => {
    let alive = true;
    loadSprites()
      .then((loaded) => {
        if (!alive) return;
        spritesRef.current = loaded;
        setReady(true);
      })
      .catch(() => {
        if (alive) setArtFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const drain = useCallback(() => {
    const eng = engineRef.current;
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
    setHud((current) => {
      const next = readHud(eng);
      return sameHud(current, next) ? current : next;
    });
  }, []);

  const dispatch = useCallback(
    (action: Action) => {
      if (pausedRef.current) return;
      const eng = engineRef.current;
      if (eng.phase === "dead" || eng.phase === "won" || eng.phase === "choosing") return;
      const now = performance.now();
      if (now - lastActRef.current < 80) return; // a held key walks, it does not sprint
      lastActRef.current = now;
      eng.playerAct(action);
      drain();
    },
    [drain],
  );

  const choose = useCallback(
    (id: (typeof PORTRAITS)[number]["id"]) => {
      engineRef.current.choosePortrait(id);
      drain();
    },
    [drain],
  );

  // Redraw only. Nothing here touches engine state.
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);

    let raf = 0;
    const loop = (t: number) => {
      const eng = engineRef.current;
      const time = t / 1000;
      if (eng.fallenBoss && fallenAtRef.current === null) fallenAtRef.current = time;
      if (!eng.fallenBoss) fallenAtRef.current = null;
      draw(ctx, eng, spritesRef.current!, {
        time,
        fallen: fallenAtRef.current === null ? null : time - fallenAtRef.current,
        portraits: PORTRAIT_VIEW,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (eng.phase === "card") {
        const index = CHOICE_KEYS[e.code];
        if (index !== undefined) {
          e.preventDefault();
          dispatch({ type: "choose", index });
          return;
        }
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          dispatch({ type: "choose", index: 0 });
          return;
        }
      }
      const move = KEY_MOVES[e.code];
      if (move) {
        e.preventDefault();
        dispatch({ type: "move", dx: move[0], dy: move[1] });
        return;
      }
      if (e.code === "Space" || e.code === "Period") {
        e.preventDefault();
        dispatch({ type: "wait" });
      } else if (e.code === "KeyQ") {
        e.preventDefault();
        dispatch({ type: "tonic" });
      } else if (e.code === "KeyG") {
        e.preventDefault();
        dispatch({ type: "pickup" });
      } else if (e.key === ">") {
        e.preventDefault();
        dispatch({ type: "descend" });
      } else if (e.code === "KeyP" || e.code === "Escape") {
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
  }, [dispatch]);

  useEffect(() => {
    const onHide = () => {
      const phase = engineRef.current.phase;
      if (document.hidden && phase !== "dead" && phase !== "won") setPaused(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  useEffect(
    () => () => {
      if (repeatRef.current !== null) window.clearInterval(repeatRef.current);
    },
    [],
  );

  const holdStart = (action: Action) => {
    dispatch(action);
    if (repeatRef.current !== null) window.clearInterval(repeatRef.current);
    repeatRef.current = window.setInterval(() => dispatch(action), 170);
  };
  const holdEnd = () => {
    if (repeatRef.current !== null) window.clearInterval(repeatRef.current);
    repeatRef.current = null;
  };

  const toggleMute = () => {
    setMutedState((m) => {
      setMuted(!m);
      return !m;
    });
  };

  const hpRatio = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
  const hpColor = hpRatio > 0.5 ? "bg-olive" : hpRatio > 0.25 ? "bg-mustard" : "bg-terra";
  const choosing = hud.phase === "choosing";
  const card = hud.card;

  return (
    <div className="flex h-full w-full touch-none select-none flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:text-xs">
        <span className="tabular-nums">SCORE {hud.score.toLocaleString()}</span>
        <span className="rounded-full bg-background/10 px-2.5 py-0.5 text-[10px] tabular-nums text-mustard">
          DEPTH {hud.depth}/5
        </span>
        <span className="flex items-center gap-1.5">
          <span className="tabular-nums">
            HP {hud.hp}/{hud.maxHp}
          </span>
          <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-background/15 sm:block">
            <span
              className={`block h-full rounded-full ${hpColor} transition-all duration-200`}
              style={{ width: `${Math.max(0, hpRatio) * 100}%` }}
            />
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => dispatch({ type: "tonic" })}
            className="flex h-8 items-center gap-1 rounded-full px-2.5 text-background/80 transition-colors hover:bg-background/10"
            aria-label={`Drink a tonic, ${hud.tonics} left (Q)`}
          >
            <FlaskConical className="h-4 w-4 text-olive" />
            <span className="tabular-nums text-[10px]">x{hud.tonics}</span>
          </button>
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
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2"
        style={{ containerType: "size" }}
      >
        <div
          className="relative"
          style={{ width: `min(100%, calc(100cqh * ${W / H}))`, aspectRatio: `${W} / ${H}` }}
        >
          <canvas
            ref={canvasRef}
            width={W * 2}
            height={H * 2}
            className="block h-full w-full rounded-xl ring-1 ring-background/10"
          />

          {!ready && (
            <p className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-widest text-background/60">
              {artFailed ? "ART FAILED TO LOAD · RELOAD TO RETRY" : "LIGHTING THE STAIR…"}
            </p>
          )}

          {ready && choosing && (
            <div className="absolute inset-0">
              {PORTRAITS.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choose(p.id)}
                  className="absolute rounded-2xl ring-1 ring-background/15 transition-colors hover:bg-background/10 focus-visible:bg-background/10"
                  style={{
                    left: pct(168 + i * 208 - 96, W),
                    top: pct(244, H),
                    width: pct(192, W),
                    height: pct(232, H),
                  }}
                  aria-label={`${p.name}. ${p.perk}`}
                />
              ))}
            </div>
          )}

          {ready && card && card.choices.length > 0 && (
            <div
              className="absolute flex flex-wrap items-center justify-center gap-2"
              style={{ left: 0, right: 0, top: pct(462, H) }}
            >
              {card.choices.map((choice, i) => (
                <button
                  key={choice.label}
                  type="button"
                  disabled={!choice.enabled}
                  onClick={() => dispatch({ type: "choose", index: i })}
                  className="rounded-full bg-background/15 px-4 py-2 font-mono text-[11px] tracking-widest text-background ring-1 ring-background/25 transition-colors hover:bg-background/25 disabled:opacity-35"
                  aria-label={choice.detail ? `${choice.label}. ${choice.detail}` : choice.label}
                >
                  {choice.label.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {ready && coarse && !choosing && !card && (
            <>
              <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1">
                <span />
                <PadButton
                  label="Step up"
                  onHoldStart={() => holdStart({ type: "move", dx: 0, dy: -1 })}
                  onHoldEnd={holdEnd}
                >
                  <ChevronUp className="h-5 w-5" />
                </PadButton>
                <span />
                <PadButton
                  label="Step left"
                  onHoldStart={() => holdStart({ type: "move", dx: -1, dy: 0 })}
                  onHoldEnd={holdEnd}
                >
                  <ChevronLeft className="h-5 w-5" />
                </PadButton>
                <PadButton
                  label="Pick up"
                  onHoldStart={() => holdStart({ type: "pickup" })}
                  onHoldEnd={holdEnd}
                >
                  <span className="text-base leading-none">·</span>
                </PadButton>
                <PadButton
                  label="Step right"
                  onHoldStart={() => holdStart({ type: "move", dx: 1, dy: 0 })}
                  onHoldEnd={holdEnd}
                >
                  <ChevronRight className="h-5 w-5" />
                </PadButton>
                <span />
                <PadButton
                  label="Step down"
                  onHoldStart={() => holdStart({ type: "move", dx: 0, dy: 1 })}
                  onHoldEnd={holdEnd}
                >
                  <ChevronDown className="h-5 w-5" />
                </PadButton>
                <span />
              </div>
              <div className="absolute bottom-3 right-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "tonic" })}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-background/15 text-background ring-1 ring-background/25 active:bg-background/30"
                  aria-label="Drink a tonic"
                >
                  <FlaskConical className="h-5 w-5 text-olive" />
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "wait" })}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-background/15 text-background ring-1 ring-background/25 active:bg-background/30"
                  aria-label="Wait a turn"
                >
                  <Hourglass className="h-5 w-5" />
                </button>
              </div>
            </>
          )}

          {paused && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-foreground/60 backdrop-blur-[2px]">
              <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
              <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
                P TO RESUME · ARROWS/WASD STEP AND STRIKE · Q TONIC · G TAKE · SPACE WAIT · M MUTE
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PadButton = ({
  children,
  label,
  onHoldStart,
  onHoldEnd,
}: {
  children: React.ReactNode;
  label: string;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) => (
  <button
    type="button"
    aria-label={label}
    onPointerDown={(e) => {
      e.preventDefault();
      onHoldStart();
    }}
    onPointerUp={onHoldEnd}
    onPointerLeave={onHoldEnd}
    onPointerCancel={onHoldEnd}
    className="flex h-11 w-11 items-center justify-center rounded-full bg-background/10 text-background ring-1 ring-background/20 backdrop-blur-sm active:bg-background/25"
  >
    {children}
  </button>
);

export default TheUndervault;
