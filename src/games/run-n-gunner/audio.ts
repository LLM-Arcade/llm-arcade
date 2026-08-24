// Run 'n Gunner synthesized WebAudio effects. Original blips only.

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
  shoot: () => blip(760, 240, 0.06, "square", 0.02),
  hit: () => blip(320, 500, 0.08, "triangle", 0.04),
  boom: () => blip(240, 60, 0.22, "sawtooth", 0.05),
  hurt: () => blip(420, 120, 0.2, "square", 0.05),
  down: () => blip(300, 40, 0.6, "sawtooth", 0.06),
  pickup: () => {
    blip(523, 523, 0.08, "triangle", 0.05);
    setTimeout(() => blip(784, 988, 0.14, "triangle", 0.05), 90);
  },
  jump: () => blip(220, 420, 0.09, "sine", 0.02),
  bossDown: () => {
    blip(200, 50, 0.5, "sawtooth", 0.06);
    setTimeout(() => blip(392, 523, 0.16, "triangle", 0.05), 250);
  },
  stageClear: () => {
    blip(392, 392, 0.1, "triangle", 0.05);
    setTimeout(() => blip(523, 523, 0.1, "triangle", 0.05), 110);
    setTimeout(() => blip(659, 784, 0.2, "triangle", 0.055), 220);
  },
  victory: () => {
    blip(523, 523, 0.12, "triangle", 0.05);
    setTimeout(() => blip(659, 659, 0.12, "triangle", 0.05), 130);
    setTimeout(() => blip(784, 784, 0.12, "triangle", 0.05), 260);
    setTimeout(() => blip(1046, 1318, 0.3, "triangle", 0.055), 390);
  },
};
