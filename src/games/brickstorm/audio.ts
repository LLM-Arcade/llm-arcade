// Brickstorm synthesized WebAudio effects. Original blips only.

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
  launch: () => blip(300, 720, 0.12, "triangle", 0.04),
  paddle: () => blip(420, 300, 0.05, "sine", 0.035),
  wall: () => blip(600, 460, 0.04, "sine", 0.025),
  brickHit: () => blip(520, 380, 0.05, "square", 0.028),
  brickBreak: () => blip(680, 240, 0.11, "triangle", 0.04),
  powerup: () => {
    blip(587, 587, 0.07, "triangle", 0.045);
    setTimeout(() => blip(880, 1046, 0.12, "triangle", 0.045), 80);
  },
  life: () => {
    blip(523, 659, 0.1, "triangle", 0.05);
    setTimeout(() => blip(784, 1046, 0.18, "triangle", 0.05), 110);
  },
  loss: () => blip(320, 60, 0.42, "sawtooth", 0.055),
  clear: () => {
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
};
