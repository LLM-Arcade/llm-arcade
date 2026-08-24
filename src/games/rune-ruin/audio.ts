// Tiny WebAudio synth for Rune & Ruin — original blips only, no samples.

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
  freqFrom: number,
  freqTo: number,
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
  osc.frequency.setValueAtTime(freqFrom, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), a.currentTime + duration);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + duration + 0.02);
};

export const sfx: Record<SfxName, () => void> = {
  hit: () => blip(240, 180, 0.06, "square", 0.035),
  hurt: () => blip(150, 90, 0.14, "sawtooth", 0.05),
  kill: () => blip(320, 500, 0.14, "triangle", 0.05),
  gold: () => blip(680, 900, 0.08, "triangle", 0.04),
  rune: () => blip(440, 880, 0.3, "sine", 0.05),
  tonic: () => blip(300, 420, 0.1, "sine", 0.035),
  quaff: () => blip(260, 520, 0.22, "sine", 0.05),
  gear: () => blip(200, 380, 0.12, "square", 0.04),
  stairs: () => blip(330, 150, 0.35, "triangle", 0.05),
  levelup: () => {
    blip(392, 392, 0.1, "triangle", 0.05);
    setTimeout(() => blip(494, 494, 0.1, "triangle", 0.05), 110);
    setTimeout(() => blip(587, 700, 0.2, "triangle", 0.055), 220);
  },
  death: () => blip(400, 45, 1.0, "sawtooth", 0.06),
  denied: () => blip(180, 140, 0.08, "square", 0.03),
};
