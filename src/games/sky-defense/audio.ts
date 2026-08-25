// Sky Defense synthesized WebAudio effects. Original blips only.

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
  fire: () => blip(660, 940, 0.05, "square", 0.026),
  burst: () => blip(420, 180, 0.13, "triangle", 0.038),
  chain: () => blip(300, 120, 0.18, "sawtooth", 0.036),
  impact: () => blip(180, 70, 0.16, "sine", 0.038),
  buildingHit: () => blip(150, 58, 0.24, "sawtooth", 0.044),
  reload: () => blip(240, 380, 0.09, "square", 0.024),
  emptyClick: () => blip(190, 150, 0.03, "square", 0.02),
  waveStart: () => blip(520, 660, 0.11, "triangle", 0.03),
  regionClear: () => {
    blip(523, 523, 0.09, "triangle", 0.05);
    setTimeout(() => blip(659, 659, 0.09, "triangle", 0.05), 100);
    setTimeout(() => blip(784, 880, 0.18, "triangle", 0.055), 200);
  },
  victory: () => {
    blip(587, 587, 0.11, "triangle", 0.05);
    setTimeout(() => blip(740, 740, 0.11, "triangle", 0.05), 120);
    setTimeout(() => blip(880, 880, 0.11, "triangle", 0.05), 240);
    setTimeout(() => blip(1174, 1397, 0.28, "triangle", 0.055), 360);
  },
  gameover: () => blip(280, 52, 0.48, "sawtooth", 0.055),
  danger: () => blip(160, 100, 0.32, "sawtooth", 0.04),
};
