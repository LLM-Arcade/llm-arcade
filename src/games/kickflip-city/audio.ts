// Kickflip City synthesized WebAudio effects. Original blips only.

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

// Module state outlives the key={frameKey} remount; the HUD reads this so its
// icon matches what the synth actually does.
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
  ollie: () => blip(180, 420, 0.09, "triangle", 0.03),
  land: () => blip(260, 120, 0.07, "sawtooth", 0.03),
  flip: () => blip(620, 900, 0.07, "square", 0.022),
  grab: () => blip(340, 300, 0.12, "sine", 0.025),
  grindOn: () => blip(140, 190, 0.18, "sawtooth", 0.03),
  grindOff: () => blip(220, 340, 0.08, "sawtooth", 0.025),
  bank: () => {
    blip(523, 523, 0.08, "triangle", 0.04);
    setTimeout(() => blip(784, 988, 0.16, "triangle", 0.045), 90);
  },
  bail: () => blip(300, 50, 0.34, "sawtooth", 0.05),
  districtClear: () => {
    blip(392, 392, 0.1, "triangle", 0.045);
    setTimeout(() => blip(523, 523, 0.1, "triangle", 0.045), 110);
    setTimeout(() => blip(659, 784, 0.2, "triangle", 0.05), 220);
  },
  victory: () => {
    blip(523, 523, 0.12, "triangle", 0.05);
    setTimeout(() => blip(659, 659, 0.12, "triangle", 0.05), 130);
    setTimeout(() => blip(784, 784, 0.12, "triangle", 0.05), 260);
    setTimeout(() => blip(1046, 1318, 0.3, "triangle", 0.055), 390);
  },
  timeout: () => blip(330, 60, 0.6, "square", 0.05),
};
