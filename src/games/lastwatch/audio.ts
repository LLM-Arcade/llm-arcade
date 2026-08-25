// Phase 4 fills this file with the synthesized siege score and full SFX
// coverage. The shell already speaks its API so the realm ships silent
// until then, never broken.

import type { SfxName } from "./types.ts";

let muted = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
}

export function resumeAudio() {}

export function playSfx(_sound: SfxName) {}

export function setMusicIntensity(_wave: number, _active: number) {}

export function setMusicMode(_mode: "combat" | "quiet" | "intermission" | "over") {}

export function setMusicVolume(_v: number) {}

export function stopAll() {}
