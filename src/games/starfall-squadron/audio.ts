// Starfall Squadron — synthesized WebAudio effects. Original blips only.

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
  shoot: () => blip(880, 320, 0.07, "square", 0.022),
  hitDrone: () => blip(300, 480, 0.09, "triangle", 0.04),
  hitWarrior: () => blip(260, 520, 0.11, "triangle", 0.045),
  hitCaptor: () => blip(200, 560, 0.16, "sawtooth", 0.045),
  playerBoom: () => blip(280, 40, 0.55, "sawtooth", 0.06),
  dive: () => blip(700, 260, 0.3, "sine", 0.025),
  beam: () => blip(140, 220, 0.9, "sine", 0.035),
  capture: () => blip(500, 90, 0.8, "triangle", 0.05),
  rescue: () => {
    blip(392, 392, 0.09, "triangle", 0.05);
    setTimeout(() => blip(523, 523, 0.09, "triangle", 0.05), 100);
    setTimeout(() => blip(659, 784, 0.18, "triangle", 0.055), 200);
  },
  waveClear: () => {
    blip(330, 330, 0.1, "triangle", 0.045);
    setTimeout(() => blip(440, 550, 0.16, "triangle", 0.05), 110);
  },
  perfect: () => {
    blip(440, 440, 0.1, "triangle", 0.05);
    setTimeout(() => blip(554, 554, 0.1, "triangle", 0.05), 110);
    setTimeout(() => blip(659, 659, 0.1, "triangle", 0.05), 220);
    setTimeout(() => blip(880, 1100, 0.24, "triangle", 0.055), 330);
  },
  extraLife: () => {
    blip(523, 523, 0.08, "square", 0.04);
    setTimeout(() => blip(784, 1046, 0.2, "square", 0.04), 90);
  },
};
