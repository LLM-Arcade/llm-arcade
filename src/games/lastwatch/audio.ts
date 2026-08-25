// The Lastwatch sound: everything synthesized in WebAudio at runtime, no
// files, no licenses. The siege score stays low in the mix by design;
// the fight itself is the loud part of the night. `M` mutes, the module
// getter survives remounts (house pattern).

import type { SfxName } from "./types.ts";

let muted = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let duckGain: GainNode | null = null;
let musicVolume = 1;

// Music sits far under the action: "low and almost easy to miss".
const MUSIC_LEVEL = 0.11;
const SFX_LEVEL = 0.5;

type MusicMode = "combat" | "quiet" | "intermission" | "over";
let mode: MusicMode = "quiet";
let intensity = 0;
let bossWave = false;

interface Layer {
  gain: GainNode;
  target: number;
}
let layers: {
  embers?: Layer;
  drone?: Layer;
  pulse?: Layer;
  ostinato?: Layer;
  pressure?: Layer;
  motif?: Layer;
} = {};
let schedulerId: number | null = null;
let nextBeat = 0;
let beatCount = 0;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) {
    master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03);
  }
}

export function setMusicVolume(v: number) {
  musicVolume = v;
  if (musicBus && ctx) {
    musicBus.gain.setTargetAtTime(MUSIC_LEVEL * v, ctx.currentTime, 0.1);
  }
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  duckGain = ctx.createGain();
  duckGain.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_LEVEL;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_LEVEL * musicVolume;
  musicBus.connect(duckGain);
  buildMusicBed();
  return ctx;
}

export function resumeAudio() {
  const c = ensureCtx();
  c?.resume().catch(() => {});
  if (schedulerId == null && c) {
    nextBeat = c.currentTime + 0.1;
    schedulerId = window.setInterval(schedule, 120);
  }
}

export function stopAll() {
  if (schedulerId != null) {
    clearInterval(schedulerId);
    schedulerId = null;
  }
  ctx?.close().catch(() => {});
  ctx = null;
  layers = {};
}

// ---- the bed: continuous nodes whose gains breathe -----------------------

function makeLayer(bus: AudioNode): Layer {
  const g = ctx!.createGain();
  g.gain.value = 0;
  g.connect(bus);
  return { gain: g, target: 0 };
}

function buildMusicBed() {
  if (!ctx || !musicBus) return;
  // L0 embers: looped brown noise through a low shelf of the night.
  const emb = makeLayer(musicBus);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 300;
  noise.connect(lp).connect(emb.gain);
  noise.start();
  layers.embers = emb;

  // L1 drone: detuned saw pair on D, swelling on an eight-second breath.
  const drone = makeLayer(musicBus);
  const lp2 = ctx.createBiquadFilter();
  lp2.type = "lowpass";
  lp2.frequency.value = 380;
  lp2.connect(drone.gain);
  for (const [freq, det] of [
    [36.7, -6],
    [73.4, 6],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = det;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    o.connect(g).connect(lp2);
    o.start();
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / 8;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.25;
  lfo.connect(lfoGain).connect(drone.gain.gain);
  lfo.start();
  layers.drone = drone;

  // L4 pressure: a warm tremolo cluster two octaves up, felt not heard.
  const press = makeLayer(musicBus);
  for (const f of [587.3, 440]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.08;
    const trem = ctx.createOscillator();
    trem.frequency.value = 0.9;
    const tg = ctx.createGain();
    tg.gain.value = 0.05;
    trem.connect(tg).connect(g.gain);
    o.connect(g).connect(press.gain);
    o.start();
    trem.start();
  }
  layers.pressure = press;

  // pulse, ostinato, and the ledger motif are event-scheduled; their
  // layer gains just gate how loud those events land.
  layers.pulse = makeLayer(musicBus);
  layers.ostinato = makeLayer(musicBus);
  layers.motif = makeLayer(musicBus);
}

const BEAT = 60 / 78; // the siege pulse

function schedule() {
  if (!ctx) return;
  while (nextBeat < ctx.currentTime + 0.45) {
    scheduleBeat(nextBeat, beatCount);
    nextBeat += BEAT / 2; // half-beat grid
    beatCount++;
  }
}

function scheduleBeat(t: number, n: number) {
  if (!ctx) return;
  const half = n % 8; // a 4-beat bar on the half-beat grid
  if (mode === "combat") {
    if (layers.pulse && layers.pulse.target > 0 && (half === 0 || half === 5)) {
      thump(t, layers.pulse.gain);
    }
    if (layers.ostinato && layers.ostinato.target > 0 && half % 2 === 0) {
      const seq = [73.4, 87.3, 73.4, 98, 73.4, 87.3, 110, 87.3];
      pluck(t, seq[(n / 2) % 8 | 0], layers.ostinato.gain, 0.5);
    }
  } else if (mode === "intermission") {
    if (layers.motif && half % 4 === 0 && Math.random() < 0.7) {
      const seq = [146.8, 220, 261.6, 293.7];
      pluck(t, seq[(n / 4) % 4 | 0], layers.motif.gain, 1.1);
    }
  }
}

function thump(t: number, out: AudioNode) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(105, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.25);
}

function pluck(t: number, freq: number, out: AudioNode, dur: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function applyLayerTargets() {
  if (!ctx) return;
  const set = (l: Layer | undefined, v: number) => {
    if (!l) return;
    l.target = v;
    l.gain.gain.setTargetAtTime(v, ctx!.currentTime, 0.8);
  };
  if (mode === "over") {
    set(layers.embers, 0.15);
    set(layers.drone, 0);
    set(layers.pulse, 0);
    set(layers.ostinato, 0);
    set(layers.pressure, 0);
    set(layers.motif, 0);
    return;
  }
  set(layers.embers, 0.5);
  if (mode === "quiet") {
    set(layers.drone, 0);
    set(layers.pulse, 0);
    set(layers.ostinato, 0);
    set(layers.pressure, 0);
    set(layers.motif, 0);
    return;
  }
  if (mode === "intermission") {
    set(layers.drone, 0.2);
    set(layers.pulse, 0);
    set(layers.ostinato, 0);
    set(layers.pressure, 0);
    set(layers.motif, 0.8);
    return;
  }
  set(layers.motif, 0);
  set(layers.drone, 0.75);
  set(layers.pulse, intensity >= 3 ? 0.7 : 0);
  set(layers.ostinato, intensity >= 6 ? 0.55 : 0);
  set(layers.pressure, bossWave ? 0.5 : 0);
}

export function setMusicIntensity(wave: number, active: number) {
  intensity = wave + active / 10;
  bossWave = wave > 0 && wave % 5 === 0;
  applyLayerTargets();
}

export function setMusicMode(m: MusicMode) {
  mode = m;
  applyLayerTargets();
}

// ---- sfx -----------------------------------------------------------------

function blip(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slide = 0,
) {
  if (!ctx || !sfxBus || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 0) {
    o.frequency.exponentialRampToValueAtTime(Math.max(24, freq + slide), t + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function hiss(dur: number, freq: number, vol: number, type: BiquadFilterType = "bandpass") {
  if (!ctx || !sfxBus || muted) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
}

function chord(freqs: number[], dur: number, vol: number, type: OscillatorType = "triangle") {
  for (const f of freqs) blip(f, dur, type, vol / freqs.length);
}

function duck(amount: number, secs: number) {
  if (!ctx || !duckGain) return;
  duckGain.gain.cancelScheduledValues(ctx.currentTime);
  duckGain.gain.setValueAtTime(amount, ctx.currentTime);
  duckGain.gain.setTargetAtTime(1, ctx.currentTime + secs * 0.4, secs * 0.4);
}

export function playSfx(sound: SfxName) {
  if (!ensureCtx() || muted) return;
  switch (sound) {
    case "step-knight":
      hiss(0.07, 900, 0.05);
      blip(70, 0.06, "square", 0.03);
      break;
    case "step-light":
      hiss(0.05, 700, 0.03);
      break;
    case "swing":
      hiss(0.12, 500, 0.12, "lowpass");
      break;
    case "swing-heavy":
      hiss(0.22, 320, 0.2, "lowpass");
      blip(80, 0.2, "sawtooth", 0.08, -30);
      break;
    case "melee-hit":
      blip(160, 0.09, "square", 0.16, -60);
      hiss(0.06, 1800, 0.08);
      break;
    case "clang-block":
      blip(520, 0.14, "square", 0.14, -140);
      blip(1040, 0.08, "triangle", 0.08);
      break;
    case "guard-break":
      blip(300, 0.4, "sawtooth", 0.2, -200);
      hiss(0.3, 800, 0.12);
      break;
    case "bow-draw":
      blip(180, 0.28, "sawtooth", 0.04, 90);
      break;
    case "bow-release":
      hiss(0.08, 2400, 0.14);
      blip(700, 0.06, "triangle", 0.06, -200);
      break;
    case "arrow-hit":
      blip(220, 0.06, "square", 0.12, -80);
      break;
    case "dagger":
      hiss(0.07, 3000, 0.12);
      break;
    case "crossbow":
      blip(120, 0.1, "square", 0.16, -50);
      hiss(0.08, 1600, 0.1);
      break;
    case "repeater":
      hiss(0.05, 2000, 0.08);
      break;
    case "bolt-cast":
      blip(520, 0.18, "sine", 0.12, 240);
      break;
    case "bolt-hit":
      blip(300, 0.14, "sine", 0.14, -160);
      hiss(0.1, 900, 0.08);
      break;
    case "beam":
      blip(880, 0.1, "sine", 0.05, 30);
      break;
    case "mend":
      chord([392, 494, 587], 0.5, 0.24);
      break;
    case "burn-field":
      hiss(0.5, 400, 0.14, "lowpass");
      break;
    case "trap-place":
      blip(240, 0.08, "square", 0.1);
      break;
    case "trap-trigger":
      blip(180, 0.12, "square", 0.12, -60);
      break;
    case "taunt":
      blip(150, 0.35, "sawtooth", 0.18, 80);
      break;
    case "snarl":
      blip(90, 0.25, "sawtooth", 0.14, -35);
      hiss(0.2, 500, 0.1);
      break;
    case "lob":
      blip(180, 0.25, "sine", 0.1, 120);
      break;
    case "glob-splat":
      hiss(0.18, 350, 0.16, "lowpass");
      blip(90, 0.15, "sine", 0.1, -40);
      break;
    case "mauler-roar":
      blip(65, 0.6, "sawtooth", 0.22, -18);
      hiss(0.4, 300, 0.12, "lowpass");
      break;
    case "mauler-slam":
      blip(50, 0.35, "sine", 0.3, -25);
      hiss(0.25, 250, 0.18, "lowpass");
      break;
    case "hexer-tether":
      blip(660, 0.5, "sine", 0.06, 40);
      blip(663, 0.5, "sine", 0.06, 40);
      break;
    case "stalker-screech":
      blip(1200, 0.3, "sawtooth", 0.09, -500);
      break;
    case "shrike-hiss":
      hiss(0.15, 4000, 0.08);
      break;
    case "filcher-jingle":
      chord([1568, 1976, 2349], 0.15, 0.12, "sine");
      break;
    case "sapper-thud":
      blip(55, 0.2, "sine", 0.2, -15);
      break;
    case "sapper-breach":
      hiss(0.5, 300, 0.22, "lowpass");
      blip(70, 0.4, "sawtooth", 0.14, -30);
      break;
    case "brood-pulse":
      blip(110, 0.3, "sine", 0.14, -40);
      break;
    case "skitter":
      hiss(0.06, 5000, 0.05);
      break;
    case "pack-howl":
      blip(220, 0.7, "sawtooth", 0.1, 160);
      blip(330, 0.7, "sawtooth", 0.07, 180);
      break;
    case "howl-warning":
      blip(440, 0.5, "sine", 0.1, -100);
      break;
    case "structure-hit":
      blip(140, 0.1, "square", 0.12, -40);
      hiss(0.08, 700, 0.1);
      break;
    case "structure-break":
      hiss(0.5, 500, 0.22, "lowpass");
      blip(90, 0.4, "square", 0.14, -50);
      break;
    case "watchfire-hit":
      blip(60, 0.5, "sine", 0.26, -20);
      duck(0.6, 0.5);
      break;
    case "watchfire-fall":
      blip(50, 1.6, "sine", 0.3, -28);
      hiss(1.2, 260, 0.2, "lowpass");
      duck(0.3, 1.5);
      break;
    case "rubble-open":
      hiss(0.7, 350, 0.2, "lowpass");
      chord([196, 294, 392], 0.7, 0.2);
      break;
    case "station-use":
      blip(600, 0.09, "triangle", 0.1);
      break;
    case "purchase":
      blip(880, 0.07, "sine", 0.12);
      blip(1174, 0.09, "sine", 0.1);
      break;
    case "denied":
      blip(160, 0.15, "square", 0.1, -30);
      break;
    case "down-sting":
      chord([294, 247], 0.9, 0.3, "sawtooth");
      duck(0.35, 1.2);
      break;
    case "revive-channel":
      blip(330, 0.4, "sine", 0.08, 60);
      break;
    case "revive-done":
      chord([294, 370, 440], 0.7, 0.26);
      break;
    case "wave-horn": {
      // The horn: a minor-third rise, then the hills answer quieter.
      blip(147, 1.4, "sawtooth", 0.2, 28);
      setTimeout(() => blip(174.6, 1.1, "sawtooth", 0.16, 12), 500);
      setTimeout(() => blip(145, 1.2, "sawtooth", 0.07, 26), 1600);
      break;
    }
    case "wave-clear":
      chord([294, 440, 587], 0.9, 0.22);
      break;
    case "boss-stinger":
      blip(73.4, 1.2, "sawtooth", 0.24, -10);
      chord([220, 261.6], 1.0, 0.12, "sawtooth");
      duck(0.5, 1.2);
      break;
    case "achievement":
      chord([587, 740, 880], 0.5, 0.2, "sine");
      break;
  }
}
