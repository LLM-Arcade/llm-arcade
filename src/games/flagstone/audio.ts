// Flagstone audio — original WebAudio blips, no samples. Same shape as the
// other cabinets' synths so the arcade sounds like one place.

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

// Module state outlives remounts; the HUD reads it so its icon matches.
export const isMuted = () => muted;

const blip = (
  freqFrom: number,
  freqTo: number,
  duration: number,
  type: OscillatorType = "triangle",
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

// Fill pitch tracks the scoring multiplier, so combos are audible.
export const sfx = {
  fill: (multiplier = 1) => {
    const base = 300 + multiplier * 40;
    blip(base, base + 90, 0.05, "triangle", 0.03);
  },
  flag: () => blip(220, 180, 0.04, "sine", 0.025),
  line: () => {
    blip(430, 470, 0.09, "triangle", 0.035);
    setTimeout(() => blip(560, 600, 0.1, "triangle", 0.03), 90);
  },
  miss: () => blip(180, 70, 0.28, "sawtooth", 0.05),
  clear: () => {
    blip(392, 392, 0.12, "triangle", 0.04);
    setTimeout(() => blip(494, 494, 0.12, "triangle", 0.04), 120);
    setTimeout(() => blip(587, 660, 0.26, "triangle", 0.045), 240);
  },
  win: () => {
    blip(392, 392, 0.14, "triangle", 0.045);
    setTimeout(() => blip(523, 523, 0.14, "triangle", 0.045), 150);
    setTimeout(() => blip(659, 659, 0.14, "triangle", 0.045), 300);
    setTimeout(() => blip(784, 880, 0.4, "triangle", 0.05), 450);
  },
  over: () => blip(300, 55, 0.8, "sawtooth", 0.055),
};
