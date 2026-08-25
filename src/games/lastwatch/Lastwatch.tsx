// The Lastwatch shell: menus, pointer-lock input, the fixed-step sim
// loop, the DOM HUD, the Watch Ledger, and the command wheel. The engine
// stays DOM-free; everything here is presentation and input.

import { useEffect, useRef, useState } from "react";
import type { ArcadeGameProps } from "../registry";
import { Engine, type Character } from "./engine.ts";
import { DIFFICULTY, DT, emptyInput, type ClassId, type CommandId, type Difficulty, type GameEvent, type InputState } from "./types.ts";
import { UPGRADES } from "./kits.ts";
import { ARMORS, PRICES, WEAPONS } from "./arsenal.ts";
import { RenderRoot } from "./render/index.ts";
import { isMuted, playSfx, resumeAudio, setMusicIntensity, setMusicMode, setMuted } from "./audio.ts";

type Screen = "menu" | "playing" | "over";

interface Bark {
  id: number;
  line: string;
  at: number;
}

const CLASS_INFO: Record<ClassId, { name: string; blurb: string }> = {
  knight: { name: "Knight", blurb: "The wall. Arcs, block, taunt." },
  archer: { name: "Archer", blurb: "The tempo. Charged shots, dagger, traps." },
  mage: { name: "Mage", blurb: "Artillery with a lifeline. Bolts, beam, mend." },
};

const DIFF_INFO: { id: Difficulty; name: string; blurb: string }[] = [
  { id: "ember", name: "Ember Watch", blurb: "Learn the hold. Rich drops, gentler dark." },
  { id: "long", name: "Long Watch", blurb: "The intended night." },
  { id: "forlorn", name: "Forlorn Watch", blurb: "The hills know you. Scarce, savage, smart." },
];

const RECOMMENDED: Record<ClassId, ClassId> = {
  knight: "mage",
  mage: "knight",
  archer: "knight",
};

function seedFromClock(): number {
  return (Date.now() ^ (performance.now() * 1000)) >>> 0;
}

export default function Lastwatch({ onScore, onAchievement }: ArcadeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const renderRef = useRef<RenderRoot | null>(null);
  const inputRef = useRef<InputState>(emptyInput());
  const keysRef = useRef(new Set<string>());
  const callbacksRef = useRef({ onScore, onAchievement });
  callbacksRef.current = { onScore, onAchievement };
  const pausedRef = useRef(false);
  const screenRef = useRef<Screen>("menu");
  const wheelRef = useRef<{ open: boolean; pick: CommandId | null }>({ open: false, pick: null });

  const [screen, setScreen] = useState<Screen>("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("long");
  const [cls, setCls] = useState<ClassId>("knight");
  const [partner, setPartner] = useState<ClassId>("mage");
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelPick, setWheelPick] = useState<CommandId | null>(null);
  const [barks, setBarks] = useState<Bark[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [recap, setRecap] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [hudTick, setHudTick] = useState(0);
  const [ledgerNote, setLedgerNote] = useState<string | null>(null);

  screenRef.current = screen;
  pausedRef.current = paused || ledgerOpen;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    // A menu engine gives the attract orbit something real to look at.
    let eng = new Engine(seedFromClock(), {
      difficulty: "long",
      playerClass: "knight",
      partnerClass: "mage",
    });
    engineRef.current = eng;
    let render = new RenderRoot(canvas, eng);
    renderRef.current = render;

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let barkSeq = 0;
    let hudAcc = 0;

    const handleEvents = (events: GameEvent[]) => {
      for (const e of events) {
        if (e.type === "sfx") playSfx(e.sound);
        else if (e.type === "bark") {
          const id = ++barkSeq;
          setBarks((b) => [...b.slice(-2), { id, line: e.line, at: performance.now() }]);
        } else if (e.type === "achievement") {
          callbacksRef.current.onAchievement(e.slug);
        } else if (e.type === "wave-start") {
          setBanner(e.name ? `Wave ${e.wave}: ${e.name}` : `Wave ${e.wave}`);
          setTimeout(() => setBanner(null), 3200);
        } else if (e.type === "district-open") {
          setBanner("The hold grows");
          setTimeout(() => setBanner(null), 2000);
        } else if (e.type === "gameover") {
          setRecap(e.recap);
          setFinalScore(e.score);
          setScreen("over");
          setMusicMode("over");
          document.exitPointerLock?.();
          callbacksRef.current.onScore({ score: e.score, stats: e.stats });
        }
      }
    };

    const step = () => {
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;
      const playing = screenRef.current === "playing" && !pausedRef.current;
      if (playing) {
        acc += dt;
        const input = inputRef.current;
        while (acc >= DT) {
          acc -= DT;
          eng.step(input);
          input.command = null;
        }
        handleEvents(eng.drainEvents());
        setMusicIntensity(eng.wave, eng.gloam.length);
      } else {
        eng.drainEvents();
      }
      hudAcc += dt;
      if (hudAcc > 0.12) {
        hudAcc = 0;
        setHudTick((t) => t + 1);
        const cutoff = performance.now() - 6000;
        setBarks((b) => (b.length && b[0].at < cutoff ? b.filter((x) => x.at >= cutoff) : b));
      }
      render.frame(eng, dt, screenRef.current !== "playing");
      raf = requestAnimationFrame(step);
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      render.resize(Math.max(320, r.width), Math.max(200, r.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    raf = requestAnimationFrame(step);

    const onKey = (down: boolean) => (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      if (down && screenRef.current === "playing") {
        if (k === "p" || k === "escape") {
          setPaused((p) => !p);
          return;
        }
        if (k === "m") {
          setMuted(!isMuted());
          setMutedState(isMuted());
          return;
        }
        if (k === "b" && engineRef.current?.phase === "intermission") {
          setLedgerOpen((o) => {
            const next = !o;
            if (next) document.exitPointerLock?.();
            return next;
          });
          return;
        }
        if (k === "f" && !wheelRef.current.open) {
          wheelRef.current = { open: true, pick: null };
          setWheelOpen(true);
        }
      }
      if (down) keysRef.current.add(k);
      else keysRef.current.delete(k);
      if (!down && k === "f" && wheelRef.current.open) {
        const pick = wheelRef.current.pick;
        if (pick) inputRef.current.command = pick;
        wheelRef.current = { open: false, pick: null };
        setWheelOpen(false);
        setWheelPick(null);
      }
      const keys = keysRef.current;
      const input = inputRef.current;
      input.forward = (keys.has("w") ? 1 : 0) + (keys.has("s") ? -1 : 0);
      input.strafe = (keys.has("d") ? 1 : 0) + (keys.has("a") ? -1 : 0);
      input.sprint = keys.has("shift");
      input.skill = keys.has("q");
      input.interact = keys.has("e");
      input.bandage = keys.has("g");
      input.cycleAmmo = keys.has("tab");
      if (k === "tab") ev.preventDefault();
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const onMouseMove = (ev: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const input = inputRef.current;
      input.yaw -= ev.movementX * 0.0026;
      input.pitch = Math.max(-1.05, Math.min(0.6, input.pitch - ev.movementY * 0.0022));
      if (wheelRef.current.open) {
        // The wheel reads gross mouse direction while F is held.
        const pick =
          Math.abs(ev.movementX) > Math.abs(ev.movementY)
            ? ev.movementX > 0
              ? "hold-ground"
              : "regroup"
            : ev.movementY > 0
              ? "follow"
              : "defend-arch";
        wheelRef.current.pick = pick;
        setWheelPick(pick);
      }
    };
    window.addEventListener("mousemove", onMouseMove);

    const onMouse = (down: boolean) => (ev: MouseEvent) => {
      if (screenRef.current !== "playing") return;
      if (document.pointerLockElement !== canvas && down && ev.target === canvas) {
        try {
          (canvas.requestPointerLock?.() as Promise<void> | undefined)?.catch?.(() => {});
        } catch {
          /* embedded contexts refuse pointer lock */
        }
        return;
      }
      if (ev.button === 0) inputRef.current.primary = down;
      if (ev.button === 2) inputRef.current.secondary = down;
    };
    const md = onMouse(true);
    const mu = onMouse(false);
    window.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    const onCtx = (ev: Event) => ev.preventDefault();
    canvas.addEventListener("contextmenu", onCtx);

    const onVis = () => {
      if (document.hidden && screenRef.current === "playing") setPaused(true);
    };
    document.addEventListener("visibilitychange", onVis);

    const api = {
      start(diff: Difficulty, playerClass: ClassId, partnerClass: ClassId) {
        eng = new Engine(seedFromClock(), { difficulty: diff, playerClass, partnerClass });
        engineRef.current = eng;
        render.dispose();
        render = new RenderRoot(canvas, eng);
        renderRef.current = render;
        resize();
        inputRef.current = emptyInput();
        inputRef.current.yaw = Math.PI / 2;
        resumeAudio();
        setMusicMode("combat");
        // Neither gesture call may break the run start: fullscreen and
        // pointer lock are comforts, not requirements.
        try {
          wrap.requestFullscreen?.()?.catch?.(() => {});
        } catch {
          /* embedded contexts refuse fullscreen */
        }
        try {
          (canvas.requestPointerLock?.() as Promise<void> | undefined)?.catch?.(() => {});
        } catch {
          /* embedded contexts refuse pointer lock */
        }
      },
    };
    (wrap as HTMLDivElement & { __lastwatch?: typeof api }).__lastwatch = api;
    if (import.meta.env.DEV) {
      (window as unknown as { __lw?: unknown }).__lw = {
        get engine() {
          return engineRef.current;
        },
        get stats() {
          return renderRef.current?.stats();
        },
        // Console autopilot for playtests: fast-forward the sim with an
        // idle player while the partner fights.
        warp(seconds: number) {
          const e = engineRef.current;
          if (!e) return "no engine";
          const idle = emptyInput();
          idle.yaw = inputRef.current.yaw;
          const n = Math.min(60 * 600, Math.round(seconds * 60));
          for (let i = 0; i < n && !e.over; i++) e.step(idle);
          // Events stay queued so the shell's loop processes the outcome.
          return `warped to t=${Math.round(e.time)}s wave=${e.wave}`;
        },
      };
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      canvas.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("visibilitychange", onVis);
      render.dispose();
    };
  }, []);

  const startRun = () => {
    const wrap = wrapRef.current as (HTMLDivElement & {
      __lastwatch?: { start: (d: Difficulty, c: ClassId, p: ClassId) => void };
    }) | null;
    wrap?.__lastwatch?.start(difficulty, cls, partner);
    setScreen("playing");
    setRecap(null);
    setPaused(false);
    setLedgerOpen(false);
  };

  const eng = engineRef.current;
  void hudTick;

  const tryBuy = (item: string, who: 0 | 1 = 0) => {
    if (!eng) return;
    const ok = eng.buy(item, who);
    if (!ok) {
      const station = item.startsWith("rack")
        ? "Stand at the armory racks"
        : item.startsWith("armor")
          ? "Stand at the undercroft armor stand"
          : item === "poultice"
            ? "Stand at the herb bed"
            : item === "meal"
              ? "Stand at the hearth"
              : item === "whetstone"
                ? "Stand at the whetstone"
                : "Not enough valor, or not available yet";
      setLedgerNote(station);
      setTimeout(() => setLedgerNote(null), 2200);
    }
  };

  const price = (base: number, who: 0 | 1 = 0) =>
    Math.round(Math.round(base * (eng ? DIFFICULTY[eng.cfg.difficulty].priceMult : 1)) *
      (who === 1 ? PRICES.partnerPriceMult : 1));

  const p = eng?.chars[0];
  const q = eng?.chars[1];
  const boss = eng?.gloam.find((g) => ["cracktusk", "shepherd", "coalhide", "packlord"].includes(g.type));
  const recentHurt = p && eng ? eng.time - p.lastDamagedAt < 0.45 : false;

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-2xl bg-[#171310] ring-1 ring-foreground/10"
      style={{ aspectRatio: "16/9", minHeight: 300 }}
    >
      <canvas ref={canvasRef} className="h-full w-full" style={{ imageRendering: "auto" }} />

      {recentHurt && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 90px 30px rgba(196,99,63,0.45)" }}
        />
      )}

      {screen === "playing" && eng && p && q && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 space-y-1 font-mono text-[11px] text-[#e8dcc0]">
            <Bar label="WATCHFIRE" value={eng.structures.watchfire.hp / 1000} color="#d9a441" />
            {(["bar-arch", "bar-sap", "bar-postern", "bar-armory-breach", "bar-hall-windows"] as const).map(
              (id) => {
                const s = eng.structures[id];
                if (s.tier === 0) return null;
                return (
                  <Bar
                    key={id}
                    label={id.replace("bar-", "").replace("-", " ").toUpperCase()}
                    value={s.hp / s.maxHp}
                    color="#6b4a33"
                  />
                );
              },
            )}
          </div>

          <div className="pointer-events-none absolute right-3 top-3 text-right font-mono text-[#e8dcc0]">
            <div className="text-xl font-bold">WAVE {eng.wave}</div>
            <div className="text-xs opacity-80">
              {eng.gloam.length + eng.waveCtl.queue.length} remain
            </div>
            <div className="mt-1 text-sm text-[#d9a441]">VALOR {eng.valor}</div>
            <div className="text-[10px] uppercase opacity-60">{eng.cfg.difficulty} watch</div>
            {eng.phase === "intermission" && (
              <div className="mt-2 rounded bg-black/50 px-2 py-1 text-xs">
                Horn in {Math.ceil(eng.intermissionT)}s · B for the ledger
              </div>
            )}
          </div>

          {boss && (
            <div className="pointer-events-none absolute left-1/2 top-3 w-72 -translate-x-1/2">
              <div className="text-center font-display text-sm text-[#e8dcc0]">
                {eng.sourceName(boss).replace(/^an? /, "").replace(/^the /, "")}
              </div>
              <Bar label="" value={boss.hp / boss.maxHp} color="#c4633f" />
            </div>
          )}

          {banner && (
            <div className="pointer-events-none absolute left-1/2 top-1/4 -translate-x-1/2 font-display text-3xl font-bold text-[#e8dcc0] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {banner}
            </div>
          )}

          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              className={`h-2 w-2 rounded-full border ${
                p.charging ? "scale-150 border-[#d9a441]" : "border-[#e8dcc0]/70"
              }`}
            />
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 w-64 space-y-1 font-mono text-[11px] text-[#e8dcc0]">
            <Bar label="HP" value={p.hp / p.maxHp} color="#c4633f" />
            {p.cls === "knight" && <Bar label="GUARD" value={p.guard / eng.guardMax(p)} color="#8a8478" />}
            {p.cls === "mage" && <Bar label="MANA" value={p.mana / eng.manaMax(p)} color="#6f6b3f" />}
            {p.cls === "archer" && (
              <div className="flex gap-2">
                <span>ARROWS {p.arrows}</span>
                <span className="uppercase text-[#d9a441]">{p.arrowType}</span>
              </div>
            )}
            <div className="flex gap-2 opacity-80">
              <span>BANDAGES {p.bandages}</span>
              {p.secondWind && <span className="text-[#d9a441]">SECOND WIND</span>}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 right-3 w-56 text-right font-mono text-[11px] text-[#e8dcc0]">
            {barks.map((b) => (
              <div key={b.id} className="mb-1 rounded bg-black/45 px-2 py-1 text-left italic">
                “{b.line}”
              </div>
            ))}
            <div className="rounded bg-black/45 px-2 py-1 text-left">
              <span className="uppercase text-[#d9a441]">{CLASS_INFO[q.cls].name}</span>
              <Bar label="" value={Math.max(0, q.hp) / q.maxHp} color="#6f6b3f" />
              <span className="opacity-80">
                {q.state === "downed"
                  ? `DOWN ${Math.ceil(q.bleedout)}s`
                  : q.state === "gone"
                    ? "LOST TO THE NIGHT"
                    : "HOLDING"}
              </span>
            </div>
          </div>

          {eng.bossCacheOffer && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-xl bg-black/70 px-4 py-2 text-center font-mono text-xs text-[#e8dcc0]">
              <div className="mb-1 text-[#d9a441]">The boss cache is open</div>
              {eng.bossCacheOffer.map((o, i) => (
                <button
                  key={i}
                  className="pointer-events-auto mx-1 rounded-full bg-[#6f6b3f] px-3 py-1 hover:bg-[#8a8448]"
                  onClick={() => {
                    const who = WEAPONS[o.id].cls === p.cls ? 0 : 1;
                    eng.claimBossCache(i, who as 0 | 1);
                  }}
                >
                  {o.quality} {o.id.replace("-", " ")}
                </button>
              ))}
            </div>
          )}

          {wheelOpen && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="grid grid-cols-3 gap-2 font-mono text-xs text-[#e8dcc0]">
                <div />
                <Wedge label="Defend the arch" active={wheelPick === "defend-arch"} />
                <div />
                <Wedge label="Regroup" active={wheelPick === "regroup"} />
                <div className="h-14 w-28" />
                <Wedge label="Hold ground" active={wheelPick === "hold-ground"} />
                <div />
                <Wedge label="Follow me" active={wheelPick === "follow"} />
                <div />
              </div>
            </div>
          )}

          {paused && !ledgerOpen && (
            <Overlay title="PAUSED">
              <p className="text-sm opacity-80">P resumes · M mute ({muted ? "on" : "off"})</p>
              <button className="mt-3 rounded-full bg-[#c4633f] px-5 py-2 font-display" onClick={() => setPaused(false)}>
                Back to the watch
              </button>
            </Overlay>
          )}

          {ledgerOpen && eng.phase === "intermission" && (
            <Ledger eng={eng} p={p} q={q} tryBuy={tryBuy} price={price} note={ledgerNote} onClose={() => setLedgerOpen(false)} />
          )}
        </>
      )}

      {screen === "menu" && (
        <Overlay title="LASTWATCH">
          <p className="mb-3 max-w-md text-center text-sm opacity-80">
            Nine holds kept the line. Eight are dark. Light the Watchfire, bar
            the arch, and count what you take from them.
          </p>
          <div className="mb-3 flex gap-2">
            {DIFF_INFO.map((d) => (
              <Card key={d.id} active={difficulty === d.id} title={d.name} blurb={d.blurb} onClick={() => setDifficulty(d.id)} />
            ))}
          </div>
          <div className="mb-3 flex gap-2">
            {(Object.keys(CLASS_INFO) as ClassId[]).map((c) => (
              <Card
                key={c}
                active={cls === c}
                title={CLASS_INFO[c].name}
                blurb={CLASS_INFO[c].blurb}
                onClick={() => {
                  setCls(c);
                  setPartner(RECOMMENDED[c]);
                }}
              />
            ))}
          </div>
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="opacity-70">Partner:</span>
            {(Object.keys(CLASS_INFO) as ClassId[])
              .filter((c) => c !== cls)
              .map((c) => (
                <button
                  key={c}
                  className={`rounded-full px-3 py-1 font-mono text-xs ${
                    partner === c ? "bg-[#6f6b3f] text-[#f6f1e7]" : "bg-black/40 text-[#e8dcc0]"
                  }`}
                  onClick={() => setPartner(c)}
                >
                  {CLASS_INFO[c].name}
                  {RECOMMENDED[cls] === c ? " ·recommended" : ""}
                </button>
              ))}
          </div>
          <button className="rounded-full bg-[#c4633f] px-8 py-3 font-display text-lg text-[#f6f1e7] hover:bg-[#d4744f]" onClick={startRun}>
            Take the watch
          </button>
          <p className="mt-3 text-xs opacity-60">
            WASD move · mouse aim · LMB attack · RMB guard/dagger/mend · Q skill ·
            E use · G bandage · F command · B ledger · keyboard only
          </p>
        </Overlay>
      )}

      {screen === "over" && (
        <Overlay title="THE WATCH FELL">
          {recap && <p className="mb-2 text-center text-sm text-[#d9a441]">{recap}</p>}
          <p className="mb-4 font-mono text-2xl">{finalScore.toLocaleString()} </p>
          <button
            className="rounded-full bg-[#c4633f] px-6 py-2 font-display text-[#f6f1e7]"
            onClick={() => setScreen("menu")}
          >
            Stand another night
          </button>
        </Overlay>
      )}
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      {label && <span className="w-20 truncate text-[10px]">{label}</span>}
      <div className="h-2 w-32 overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }}
        />
      </div>
    </div>
  );
}

function Wedge({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 text-center ${
        active ? "bg-[#c4633f] text-[#f6f1e7]" : "bg-black/55"
      }`}
    >
      {label}
    </div>
  );
}

function Overlay({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 p-4 text-[#e8dcc0]">
      <h2 className="mb-3 font-display text-4xl font-bold tracking-wide text-[#f6f1e7]">{title}</h2>
      {children}
    </div>
  );
}

function Card({ active, title, blurb, onClick }: { active: boolean; title: string; blurb: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-40 rounded-2xl p-3 text-left ring-1 ring-foreground/20 transition ${
        active ? "bg-[#c4633f] text-[#f6f1e7]" : "bg-black/40 hover:bg-black/55"
      }`}
    >
      <div className="font-display font-bold">{title}</div>
      <div className="mt-1 text-xs opacity-80">{blurb}</div>
    </button>
  );
}

function Ledger({
  eng,
  p,
  q,
  tryBuy,
  price,
  note,
  onClose,
}: {
  eng: Engine;
  p: Character;
  q: Character;
  tryBuy: (item: string, who?: 0 | 1) => void;
  price: (base: number, who?: 0 | 1) => number;
  note: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"repairs" | "districts" | "kit" | "gear">("repairs");
  const lines = UPGRADES.filter((u) => u.cls === p.cls);
  const plines = UPGRADES.filter((u) => u.cls === q.cls);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-full w-[560px] overflow-y-auto rounded-2xl bg-[#f6f1e7] p-4 text-[#2b2118] shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold">The Watch Ledger</h3>
          <div className="font-mono text-sm text-[#8a4a2f]">
            VALOR {eng.valor} · horn in {Math.ceil(eng.intermissionT)}s
          </div>
        </div>
        <div className="mb-3 flex gap-2 font-mono text-xs">
          {(["repairs", "districts", "kit", "gear"] as const).map((t) => (
            <button
              key={t}
              className={`rounded-full px-3 py-1 uppercase ${
                tab === t ? "bg-[#c4633f] text-[#f6f1e7]" : "bg-[#e4dccb]"
              }`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
          <button className="ml-auto rounded-full bg-[#2b2118] px-3 py-1 text-[#f6f1e7]" onClick={onClose}>
            Close (B)
          </button>
        </div>
        {note && <div className="mb-2 rounded bg-[#c4633f]/20 px-2 py-1 text-xs">{note}</div>}

        {tab === "repairs" && (
          <div className="space-y-1 text-sm">
            <Row label="Stoke the Watchfire to full" onClick={() => tryBuy("stoke")} />
            {(["bar-arch", "bar-sap", "bar-postern", "bar-armory-breach", "bar-hall-windows"] as const).map((id) => {
              const s = eng.structures[id];
              const name = id.replace("bar-", "").replace(/-/g, " ");
              if (s.tier === 0)
                return <Row key={id} label={`Board the ${name} (tier 1) · ${price(PRICES.barricadeInstall)}`} onClick={() => tryBuy(`barricade-install:${id}`)} />;
              return (
                <div key={id} className="flex flex-wrap gap-1">
                  <Row label={`Repair ${name} (${Math.round(s.hp)}/${s.maxHp})`} onClick={() => tryBuy(`repair:${id}`)} />
                  {s.tier < 3 && (
                    <Row
                      label={`Raise ${name} to tier ${s.tier + 1} · ${price(s.tier === 1 ? PRICES.barricadeTier2 : PRICES.barricadeTier3)}`}
                      onClick={() => tryBuy(`barricade-tier:${id}`)}
                    />
                  )}
                </div>
              );
            })}
            <Row label={`Bandage · ${price(PRICES.bandage)}`} onClick={() => tryBuy("bandage")} />
            {p.cls === "archer" && <Row label={`Refill quiver · ${price(PRICES.quiverRefill)}`} onClick={() => tryBuy("quiver")} />}
            {!p.secondWind && <Row label={`Second Wind · ${price(eng.secondWindPrice)}`} onClick={() => tryBuy("secondwind")} />}
          </div>
        )}

        {tab === "districts" && (
          <div className="space-y-1 text-sm">
            {(["armory", "wellcourt", "hall", "undercroft"] as const).map((d) => (
              <Row
                key={d}
                label={
                  eng.districts[d]
                    ? `${d} · open`
                    : `Open the ${d} · ${price(PRICES.districtOpen[d])} (or channel E at its rubble)`
                }
                onClick={() => tryBuy(`district:${d}`)}
              />
            ))}
            <p className="pt-2 text-xs opacity-70">
              Every district adds stations and stores, and a new way in for the
              Gloam.
            </p>
          </div>
        )}

        {tab === "kit" && (
          <div className="space-y-1 text-sm">
            <div className="font-display font-bold">Your kit</div>
            {lines.map((u) => {
              const cur = p.tiers[u.line] ?? 0;
              return (
                <Row
                  key={u.line}
                  label={`${u.line.replace("-line", "")} ${cur}/3${cur < 3 ? ` · ${price(u.prices[cur])}` : ""}`}
                  onClick={() => tryBuy(`upgrade:${u.line}`)}
                />
              );
            })}
            <div className="pt-2 font-display font-bold">Partner ({q.cls})</div>
            {plines.map((u) => {
              const cur = q.tiers[u.line] ?? 0;
              return (
                <Row
                  key={u.line}
                  label={`${u.line.replace("-line", "")} ${cur}/3${cur < 3 ? ` · ${price(u.prices[cur], 1)}` : ""}`}
                  onClick={() => tryBuy(`upgrade:${u.line}`, 1)}
                />
              );
            })}
          </div>
        )}

        {tab === "gear" && (
          <div className="space-y-1 text-sm">
            <div className="font-display font-bold">Armory racks (stand at them to buy)</div>
            {eng.rackStock.map((s, i) => (
              <Row
                key={i}
                label={`${s.weapon.quality} ${s.weapon.id.replace(/-/g, " ")} (${WEAPONS[s.weapon.id].cls}) · ~${price(s.price, WEAPONS[s.weapon.id].cls === q.cls ? 1 : 0)}`}
                onClick={() => tryBuy(`rack:${i}`, WEAPONS[s.weapon.id].cls === q.cls ? 1 : 0)}
              />
            ))}
            <div className="pt-2 font-display font-bold">Armor stand (undercroft)</div>
            {Object.values(ARMORS).map((a) => (
              <Row key={a.id} label={`${a.id} · ${price(a.price)}`} onClick={() => tryBuy(`armor:${a.id}`)} />
            ))}
            <div className="pt-2 font-display font-bold">Stations</div>
            <Row label={`Poultice (herb bed) · ${price(PRICES.poultice)}`} onClick={() => tryBuy("poultice")} />
            <Row label={`Hearth meal · ${price(PRICES.meal)}`} onClick={() => tryBuy("meal")} />
            <Row label={`Whetstone pass · ${price(PRICES.whetstone)}`} onClick={() => tryBuy("whetstone")} />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="block w-full rounded-lg bg-[#e4dccb] px-3 py-1.5 text-left font-mono text-xs hover:bg-[#d8cdb6]"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
