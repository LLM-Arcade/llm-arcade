// Rune & Ruin — Track-A roguelike cabinet. The board is a character grid
// (real typography, JetBrains Mono) — the house style for the Text &
// Originals shelf. Turn-based: every input runs one engine turn, then the
// event queue is drained into sfx / achievement / score callbacks.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ArcadeGameProps } from "@/games/registry";
import { Engine, type Action } from "./engine";
import { MAP_H, MAP_W, STAIRS, WALL } from "./dungeon";
import { PALETTE } from "./content";
import { isMuted, setMuted, sfx } from "./audio";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FlaskConical,
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

const TONE_CLASS = {
  info: "text-background/60",
  good: "text-olive",
  bad: "text-terra",
  gold: "text-mustard",
} as const;

const RuneRuin = ({ onScore, onAchievement }: ArcadeGameProps) => {
  const engineRef = useRef<Engine>(null!);
  if (!engineRef.current) engineRef.current = new Engine();
  const eng = engineRef.current;

  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [fontSize, setFontSize] = useState(13);

  const boardRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };
  const lastActRef = useRef(0);
  const repeatRef = useRef<number | null>(null);

  const touchUi = useMemo(
    () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches,
    [],
  );

  const dispatch = useCallback((action: Action) => {
    if (pausedRef.current) return;
    const engine = engineRef.current;
    if (engine.phase !== "running") return;
    const now = performance.now();
    if (now - lastActRef.current < 80) return; // held keys walk, not sprint
    lastActRef.current = now;

    engine.playerAct(action);
    for (const event of engine.drainEvents()) {
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
    setTick((t) => t + 1);
  }, []);

  // Fit the 40×22 grid to whatever box we're given
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const fs = Math.min(width / (MAP_W * 0.62), height / (MAP_H * 1.08));
      setFontSize(Math.max(8, Math.floor(fs)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const move = KEY_MOVES[e.code];
      if (move) {
        e.preventDefault();
        dispatch({ type: "move", dx: move[0], dy: move[1] });
        return;
      }
      if (e.code === "Space" || e.code === "Period") {
        e.preventDefault();
        dispatch({ type: "wait" });
      } else if (e.code === "KeyQ" || e.code === "Digit1") {
        e.preventDefault();
        dispatch({ type: "quaff" });
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

  // Auto-pause when the tab hides
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && engineRef.current.phase === "running") setPaused(true);
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
    repeatRef.current = window.setInterval(() => dispatch(action), 160);
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

  // ---- Board ----
  const monsterMap = new Map<number, { glyph: string; color: string }>();
  for (const m of eng.monsters) monsterMap.set(m.y * MAP_W + m.x, { glyph: m.def.glyph, color: m.def.color });
  const itemMap = new Map<number, { glyph: string; color: string; pulse?: boolean }>();
  for (const it of eng.items) {
    const style =
      it.kind === "gold"
        ? { glyph: "$", color: PALETTE.gold }
        : it.kind === "rune"
          ? { glyph: "*", color: PALETTE.rune, pulse: true }
          : it.kind === "tonic"
            ? { glyph: "!", color: PALETTE.tonic }
            : it.kind === "weapon"
              ? { glyph: ")", color: PALETTE.gear }
              : { glyph: "]", color: PALETTE.gear };
    itemMap.set(it.y * MAP_W + it.x, style);
  }

  const rows: ReactNode[] = [];
  for (let y = 0; y < MAP_H; y++) {
    const cells: ReactNode[] = [];
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const vis = eng.visible[i] === 1;
      const seen = eng.seen[i] === 1;
      if (!vis && !seen) {
        cells.push(" ");
        continue;
      }
      if (vis && x === eng.px && y === eng.py) {
        cells.push(
          <span key={x} style={{ color: PALETTE.player }} className="font-bold">
            @
          </span>,
        );
        continue;
      }
      if (vis) {
        const mon = monsterMap.get(i);
        if (mon) {
          cells.push(
            <span key={x} style={{ color: mon.color }} className="font-bold">
              {mon.glyph}
            </span>,
          );
          continue;
        }
        const item = itemMap.get(i);
        if (item) {
          cells.push(
            <span key={x} style={{ color: item.color }} className={item.pulse ? "animate-pulse font-bold" : "font-bold"}>
              {item.glyph}
            </span>,
          );
          continue;
        }
      }
      const t = eng.tiles[i];
      const glyph = t === WALL ? "#" : t === STAIRS ? ">" : "·";
      const color = !vis ? PALETTE.dim : t === WALL ? PALETTE.wall : t === STAIRS ? PALETTE.stairs : PALETTE.floor;
      cells.push(
        <span key={x} style={{ color }} className={t === STAIRS && vis ? "font-bold" : undefined}>
          {glyph}
        </span>,
      );
    }
    rows.push(<div key={y}>{cells}</div>);
  }

  const hpRatio = eng.hp / eng.maxHp;
  const hpColor = hpRatio > 0.5 ? "bg-olive" : hpRatio > 0.25 ? "bg-mustard" : "bg-terra";
  // turn has already advanced by the time we render, so "hit last turn" = flash now
  const hurtNow = eng.lastHurtTurn >= 0 && eng.turn - eng.lastHurtTurn <= 1;
  const latest = eng.msgs.slice(-3).reverse();

  return (
    <div className="flex h-full w-full touch-none select-none flex-col">
      {/* HUD */}
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 font-mono text-[11px] tracking-widest text-background/90 sm:gap-4 sm:text-xs">
        <span className="tabular-nums">SCORE {eng.score.toLocaleString()}</span>
        <span className="tabular-nums">FLR {eng.depth}</span>
        <span className="flex items-center gap-1.5">
          <span className={`tabular-nums ${hurtNow ? "text-terra" : ""}`}>
            HP {eng.hp}/{eng.maxHp}
          </span>
          <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-background/15 sm:block">
            <span
              className={`block h-full rounded-full ${hpColor} transition-all duration-200`}
              style={{ width: `${Math.max(0, hpRatio) * 100}%` }}
            />
          </span>
        </span>
        <span className="hidden tabular-nums sm:inline">LVL {eng.level}</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => dispatch({ type: "quaff" })}
            className="flex h-8 items-center gap-1 rounded-full px-2.5 text-background/80 transition-colors hover:bg-background/10"
            aria-label="Quaff tonic (Q)"
          >
            <FlaskConical className="h-4 w-4" style={{ color: PALETTE.tonic }} />
            <span className="tabular-nums text-[10px]">×{eng.tonics}</span>
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

      {/* Board */}
      <div ref={boardRef} className="relative min-h-0 flex-1 px-2">
        <div
          className={`flex h-full items-center justify-center transition-opacity duration-500 ${
            eng.phase === "dead" ? "opacity-50" : ""
          }`}
        >
          <div
            className="rounded-xl px-2 py-1.5 font-mono ring-1 ring-background/10"
            style={{
              backgroundColor: PALETTE.board,
              fontSize,
              lineHeight: 1.08,
              whiteSpace: "pre",
            }}
          >
            {rows}
          </div>
        </div>

        {paused && eng.phase === "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/60 backdrop-blur-[2px]">
            <p className="font-display text-2xl font-extrabold text-background">PAUSED</p>
            <p className="px-6 text-center font-mono text-[10px] tracking-widest text-background/70">
              P TO RESUME · ARROWS/WASD STEP · Q TONIC · SPACE WAIT
            </p>
          </div>
        )}

        {/* Touch controls */}
        {touchUi && eng.phase === "running" && (
          <>
            <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1">
              <span />
              <PadButton onHoldStart={() => holdStart({ type: "move", dx: 0, dy: -1 })} onHoldEnd={holdEnd} label="Step up">
                <ChevronUp className="h-5 w-5" />
              </PadButton>
              <span />
              <PadButton onHoldStart={() => holdStart({ type: "move", dx: -1, dy: 0 })} onHoldEnd={holdEnd} label="Step left">
                <ChevronLeft className="h-5 w-5" />
              </PadButton>
              <PadButton onHoldStart={() => holdStart({ type: "wait" })} onHoldEnd={holdEnd} label="Wait">
                <span className="text-lg leading-none">·</span>
              </PadButton>
              <PadButton onHoldStart={() => holdStart({ type: "move", dx: 1, dy: 0 })} onHoldEnd={holdEnd} label="Step right">
                <ChevronRight className="h-5 w-5" />
              </PadButton>
              <span />
              <PadButton onHoldStart={() => holdStart({ type: "move", dx: 0, dy: 1 })} onHoldEnd={holdEnd} label="Step down">
                <ChevronDown className="h-5 w-5" />
              </PadButton>
              <span />
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "quaff" })}
              className="absolute bottom-3 left-3 flex h-12 w-12 items-center justify-center rounded-full bg-background/10 text-background ring-1 ring-background/20 backdrop-blur-sm active:bg-background/25"
              aria-label="Quaff tonic"
            >
              <FlaskConical className="h-5 w-5" style={{ color: PALETTE.tonic }} />
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-mustard px-1 font-mono text-[10px] font-bold text-foreground">
                {eng.tonics}
              </span>
            </button>
          </>
        )}
      </div>

      {/* Log + stat line */}
      <div className="shrink-0 px-4 pb-2 pt-1">
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-widest text-background/50">
          <span>ATK {eng.atk}</span>
          <span>DEF {eng.def}</span>
          <span className="text-mustard/80">GOLD {eng.gold}</span>
          <span className="text-terra/80">RUNES {eng.runes}</span>
          <span className="hidden sm:inline">KILLS {eng.kills}</span>
        </div>
        <div className="mt-0.5 min-h-[30px]">
          {latest.map((msg, i) => (
            <p
              key={`${msg.turn}-${msg.text}-${i}`}
              className={`truncate font-mono text-[11px] leading-tight ${TONE_CLASS[msg.tone]} ${
                i === 0 ? "" : i === 1 ? "opacity-60" : "opacity-30"
              }`}
            >
              {msg.text}
            </p>
          ))}
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
  children: ReactNode;
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

export default RuneRuin;
