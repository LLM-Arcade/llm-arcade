// Hyper Circuit synthesized WebAudio. Blips per sfx plus a continuous
// engine hum (saw + sub sine through a lowpass) pitched by speed.

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
  if (m) stopHum();
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
  count: () => blip(440, 430, 0.12, "square", 0.04),
  go: () => blip(660, 900, 0.3, "square", 0.048),
  boost: () => blip(180, 720, 0.35, "sawtooth", 0.042),
  pad: () => blip(520, 940, 0.16, "square", 0.04),
  rail: () => blip(190, 90, 0.12, "sawtooth", 0.048),
  bump: () => blip(150, 85, 0.1, "triangle", 0.045),
  lap: () => {
    blip(392, 392, 0.09, "triangle", 0.045);
    setTimeout(() => blip(523, 587, 0.16, "triangle", 0.05), 100);
  },
  bestLap: () => {
    blip(440, 440, 0.08, "triangle", 0.045);
    setTimeout(() => blip(554, 554, 0.08, "triangle", 0.048), 90);
    setTimeout(() => blip(659, 784, 0.18, "triangle", 0.05), 180);
  },
  finish: () => {
    blip(392, 392, 0.1, "triangle", 0.05);
    setTimeout(() => blip(494, 494, 0.1, "triangle", 0.05), 110);
    setTimeout(() => blip(587, 587, 0.1, "triangle", 0.05), 220);
    setTimeout(() => blip(784, 988, 0.26, "triangle", 0.055), 330);
  },
  blowout: () => blip(260, 34, 0.7, "sawtooth", 0.06),
  recharge: () => blip(700, 780, 0.05, "sine", 0.02),
  denied: () => blip(220, 150, 0.15, "square", 0.032),
};

// ---- engine hum ----

interface Hum {
  saw: OscillatorNode;
  sub: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}
let hum: Hum | null = null;

export const startHum = () => {
  if (muted || hum) return;
  const a = ac();
  if (!a) return;
  const saw = a.createOscillator();
  const sub = a.createOscillator();
  const filter = a.createBiquadFilter();
  const gain = a.createGain();
  saw.type = "sawtooth";
  saw.frequency.value = 48;
  sub.type = "sine";
  sub.frequency.value = 24;
  filter.type = "lowpass";
  filter.frequency.value = 320;
  gain.gain.value = 0.0001;
  saw.connect(filter);
  sub.connect(filter);
  filter.connect(gain).connect(a.destination);
  saw.start();
  sub.start();
  hum = { saw, sub, filter, gain };
};

export const stopHum = () => {
  if (!hum) return;
  hum.saw.stop();
  hum.sub.stop();
  hum.gain.disconnect();
  hum = null;
};

export const setHumLevel = (speedFrac: number, boosting: boolean) => {
  if (!hum || !ctx) return;
  const t = ctx.currentTime;
  const f = 44 + speedFrac * (boosting ? 128 : 92);
  hum.saw.frequency.setTargetAtTime(f, t, 0.06);
  hum.sub.frequency.setTargetAtTime(f / 2, t, 0.06);
  hum.filter.frequency.setTargetAtTime(
    260 + speedFrac * (boosting ? 1500 : 720),
    t,
    0.08,
  );
  hum.gain.gain.setTargetAtTime(
    Math.min(0.048, 0.012 + speedFrac * 0.028 + (boosting ? 0.006 : 0)),
    t,
    0.1,
  );
};
