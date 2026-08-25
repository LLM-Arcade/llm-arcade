// Ad-hoc diagnosis runner: narrates an ace run wave by wave. Not part of
// CI; run by hand while tuning. node scripts/harness/lastwatch-debug.mjs
import { Engine } from "../../src/games/lastwatch/engine.ts";
import { makeAce, aceInput, aceShop } from "./lastwatch-bots.mjs";

const eng = new Engine(2026, {
  difficulty: "long",
  playerClass: "archer",
  partnerClass: "knight",
});
const mem = makeAce();
let lastWave = -1;
let downs = 0;
let waveStartT = 0;
for (let t = 0; t < 60 * 3600; t++) {
  eng.step(aceInput(eng, mem));
  aceShop(eng, mem);
  for (const e of eng.drainEvents()) {
    if (e.type === "gameover") {
      console.log(`GAMEOVER wave ${e.stats.wave} t=${Math.round(eng.time)}s "${e.recap}"`);
      console.log(e.stats);
      process.exit(0);
    }
  }
  if (eng.wave !== lastWave) {
    lastWave = eng.wave;
    waveStartT = eng.time;
    const p = eng.chars[0];
    const q = eng.chars[1];
    console.log(
      `w${String(eng.wave).padStart(2)} t=${String(Math.round(eng.time)).padStart(4)}s ` +
        `p:${p.room}@${p.hp.toFixed(0)}hp arrows=${p.arrows} weapon=${p.weapon.id}/${p.weapon.quality} ` +
        `q:${q.room}@${q.hp.toFixed(0)}hp valor=${eng.valor} spent=${eng.valorSpent} ` +
        `districts=${Object.values(eng.districts).filter(Boolean).length} score=${eng.score}`,
    );
  }
  if (eng.wave >= 10 && t % 240 === 0) {
    const p = eng.chars[0];
    const q = eng.chars[1];
    const nearP = eng.gloam.filter(
      (g) => g.room === p.room && Math.hypot(g.x - p.x, g.y - p.y) < 6,
    ).length;
    console.log(
      `    t=${Math.round(eng.time)} p:${p.room}(${p.x.toFixed(0)},${p.y.toFixed(0)})` +
        `hp${p.hp.toFixed(0)} ar${p.arrows} k${p.kills} hs${p.headshots} dd${p.damageDealt.toFixed(0)} tgt${(function(){const t=eng.gloam[0];return t?t.type+"@"+t.room:"-";})()} near${nearP} ` +
        `q:${q.room}hp${q.hp.toFixed(0)} gloam=${eng.gloam.length} ` +
        `arch=${eng.structures["bar-arch"].hp.toFixed(0)} fire=${eng.structures.watchfire.hp.toFixed(0)}`,
    );
  }
  if (t % 60 === 0) {
    const p = eng.chars[0];
    const q = eng.chars[1];
    if (p.state === "downed" || q.state === "downed") downs++;
    if ((p.state === "downed" || q.state === "downed") && downs % 5 === 1) {
      console.log(
        `  down: p=${p.state}@${p.room} q=${q.state}@${q.room} t=${Math.round(eng.time)} ` +
          `gloam=${eng.gloam.length} [${eng.gloam.slice(0, 6).map((g) => g.type + "@" + g.room).join(",")}]`,
      );
    }
  }
  if (eng.time - waveStartT > 240 && t % 600 === 0) {
    console.log(
      `STALL w${eng.wave} t=${Math.round(eng.time)} phase=${eng.phase} queue=${eng.waveCtl.queue.length} ` +
        `gloam=[${eng.gloam.map((g) => `${g.type}@${g.room}:${g.state}`).join(",")}]`,
    );
  }
  if (eng.wave >= 22) {
    console.log(`reached wave 22 at t=${Math.round(eng.time)}s score=${eng.score}`);
    process.exit(0);
  }
}
console.log("time limit");
