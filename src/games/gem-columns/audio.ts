// Gem Columns synthesized WebAudio effects. Original blips only.

import type { SfxName } from "./engine";

let ctx: AudioContext | null = null;
let muted = false;

const ac = (): AudioContext | null => {
  if (typeof AudioContext === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

export const setMuted = (m: boolean) => {
  muted = m;
};

// Module state outlives the key={frameKey} remount; the HUD reads this so
// its icon matches what the synth actually does.
export const isMuted = () => muted;

const blip = (
  f0: number,
  f1: number,
  dur: number,
  type: OscillatorType = "square",
  gain = 0.035,
) => {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur + 0.02);
};

export const sfx: Record<SfxName, () => void> = {
  move: () => blip(340, 300, 0.03, "sine", 0.018),
  cycle: () => blip(480, 620, 0.05, "triangle", 0.026),
  lock: () => blip(260, 170, 0.07, "square", 0.03),
  match: () => blip(620, 780, 0.09, "triangle", 0.038),
  cascade2: () => {
    blip(700, 880, 0.08, "triangle", 0.042);
    setTimeout(() => blip(932, 1046, 0.12, "triangle", 0.042), 70);
  },
  cascade3: () => {
    blip(880, 1046, 0.08, "triangle", 0.046);
    setTimeout(() => blip(1174, 1318, 0.1, "triangle", 0.046), 60);
    setTimeout(() => blip(1568, 1760, 0.16, "triangle", 0.046), 130);
  },
  clear: () => blip(520, 240, 0.12, "triangle", 0.04),
  danger: () => blip(150, 96, 0.34, "sawtooth", 0.04),
  levelClear: () => {
    blip(440, 440, 0.09, "triangle", 0.05);
    setTimeout(() => blip(587, 587, 0.09, "triangle", 0.05), 100);
    setTimeout(() => blip(784, 880, 0.18, "triangle", 0.055), 200);
  },
  victory: () => {
    blip(523, 523, 0.11, "triangle", 0.05);
    setTimeout(() => blip(659, 659, 0.11, "triangle", 0.05), 120);
    setTimeout(() => blip(880, 880, 0.11, "triangle", 0.05), 240);
    setTimeout(() => blip(1046, 1318, 0.28, "triangle", 0.055), 360);
  },
  gameover: () => blip(300, 55, 0.46, "sawtooth", 0.055),
};
