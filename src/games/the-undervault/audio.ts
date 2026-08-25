// Tiny WebAudio synth for The Undervault. Original blips only, no samples.

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

// Module state outlives the key={frameKey} remount, so the HUD reads this
// instead of keeping its own copy.
export const isMuted = () => muted;

const blip = (
  from: number,
  to: number,
  duration: number,
  type: OscillatorType = "square",
  gain = 0.04,
) => {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), a.currentTime + duration);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + duration + 0.02);
};

const chord = (notes: number[], step: number, type: OscillatorType, gain: number) => {
  notes.forEach((note, i) => {
    setTimeout(() => blip(note, note, 0.16, type, gain), i * step);
  });
};

export const sfx: Record<SfxName, () => void> = {
  step: () => blip(150, 120, 0.035, "triangle", 0.018),
  bump: () => blip(230, 170, 0.06, "square", 0.032),
  playerHit: () => blip(160, 90, 0.15, "sawtooth", 0.05),
  monsterDie: () => blip(320, 500, 0.14, "triangle", 0.05),
  bossHit: () => blip(120, 96, 0.12, "square", 0.05),
  bossDie: () => {
    blip(220, 70, 0.5, "sawtooth", 0.06);
    setTimeout(() => blip(330, 180, 0.4, "triangle", 0.05), 160);
  },
  pickup: () => blip(660, 900, 0.08, "triangle", 0.04),
  equip: () => blip(200, 380, 0.12, "square", 0.04),
  tonic: () => blip(280, 540, 0.22, "sine", 0.05),
  descend: () => blip(340, 140, 0.38, "triangle", 0.05),
  trap: () => blip(520, 120, 0.16, "sawtooth", 0.05),
  status: () => blip(420, 300, 0.18, "sine", 0.04),
  merchant: () => blip(520, 780, 0.12, "triangle", 0.042),
  death: () => blip(400, 45, 1.0, "sawtooth", 0.06),
  victory: () => chord([392, 494, 587, 784], 130, "triangle", 0.055),
  deny: () => blip(170, 140, 0.08, "square", 0.028),
};
