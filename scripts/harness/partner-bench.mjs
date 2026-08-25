// Micro-bench: knight partner dps into a staged ring of tanky gnashers.
import { Engine } from "../../src/games/lastwatch/engine.ts";
import { emptyInput } from "../../src/games/lastwatch/types.ts";

const eng = new Engine(7, { difficulty: "long", playerClass: "archer", partnerClass: "knight" });
eng.phase = "combat";
eng.wave = 5;
eng.waveCtl.queue = ["gnasher"];
eng.waveCtl.hornT = 1e9;
const p = eng.chars[1];
p.room = "gateyard"; p.x = 0; p.y = 12;
eng.chars[0].room = "rampart"; eng.chars[0].x = 0; eng.chars[0].y = 25.8;
for (let k = 0; k < 6; k++) {
  const u = eng.spawnUnit("gnasher", "gateyard", 0, 12, "treeline", false);
  const ang = (k / 6) * Math.PI * 2;
  u.x = p.x + Math.cos(ang) * 1.8;
  u.y = p.y + Math.sin(ang) * 1.8;
  u.hp = 1e9;
  u.dmg = 0; // measure output, not survival
}
for (let t = 0; t < 60 * 12; t++) {
  eng.step(emptyInput());
  eng.drainEvents();
}
console.log(`knight partner dps over 12s vs 6-ring: ${(p.damageDealt / 12).toFixed(1)}`);
