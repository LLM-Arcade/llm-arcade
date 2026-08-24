// Tiny WebAudio synth for Munch Maze — original blips only, no samples.

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

let chompFlip = false;
export const sfx = {
  chomp: () => {
    chompFlip = !chompFlip;
    blip(chompFlip ? 380 : 300, chompFlip ? 300 : 380, 0.06, "square", 0.025);
  },
  power: () => blip(160, 640, 0.35, "sawtooth", 0.05),
  ghost: (combo: number) => blip(300 + combo * 150, 900 + combo * 150, 0.25, "triangle", 0.06),
  berry: () => blip(520, 780, 0.18, "triangle", 0.05),
  death: () => blip(520, 60, 0.9, "sawtooth", 0.06),
  clear: () => {
    blip(330, 330, 0.12, "square", 0.045);
    setTimeout(() => blip(440, 440, 0.12, "square", 0.045), 130);
    setTimeout(() => blip(550, 660, 0.25, "square", 0.05), 260);
  },
};
