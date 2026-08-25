// Combat and hazard effects, second pass after live playtest: arrows fly
// as arrows with a soft air-wake instead of a tracer line, spells carry
// their element (kiln fire, amber cinder lightning, hearth light), the
// boards splinter visibly, and every glow is an additive warm sprite.
// Everything pools; nothing allocates per frame.

import * as THREE from "three";
import type { Engine } from "../engine.ts";
import { DOORS, ROOMS, doorMid, elevAt } from "../hold.ts";
import type { StructureId } from "../types.ts";
import { PALETTE } from "./scene.ts";
import { glowTexture } from "./textures.ts";

const GLOW_TEX = glowTexture();

const BURN_MAT = new THREE.MeshBasicMaterial({
  color: PALETTE.ember,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
const PUDDLE_MAT = new THREE.MeshBasicMaterial({
  color: 0x8a3f22,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
const CALTROP_MAT = new THREE.MeshLambertMaterial({ color: 0x57524a, flatShading: true });
const HOLE_MAT = new THREE.MeshBasicMaterial({ color: 0x120d0a });
const FLAME_MAT = new THREE.MeshBasicMaterial({
  color: PALETTE.flameHot,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});
const SHAFT_MAT = new THREE.MeshBasicMaterial({ color: 0xc9b391 });
const HEAD_MAT = new THREE.MeshBasicMaterial({ color: 0x8a8478 });
const SPLINTER_MAT = new THREE.MeshLambertMaterial({ color: PALETTE.timber, flatShading: true });
const BOLT_LINE_MAT = new THREE.LineBasicMaterial({
  color: 0xf5c65a,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
});
const BEAM_MAT = new THREE.MeshBasicMaterial({
  color: 0xf7df9e,
  transparent: true,
  opacity: 0.7,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const EMBER_MAT = new THREE.PointsMaterial({
  color: PALETTE.flameHot,
  size: 2.6, // screen pixels: attenuation off keeps near embers small
  sizeAttenuation: false,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
});

const EMBER_COUNT = 240;
const PUFF_MAX = 48;
const SPLINTER_MAX = 26;
const ARROW_MAX = 12;

const ELEMENT_COLOR = {
  fire: 0xf0a33c,
  spark: 0xf5c65a,
  glob: 0xc4633f,
  heal: 0xd7e0a8,
  air: 0xcdbfa5,
} as const;

interface Puff {
  born: number;
  life: number;
  size: number;
  rise: number;
  sprite: THREE.Sprite;
}

interface Splinter {
  born: number;
  vx: number;
  vy: number;
  vz: number;
  mesh: THREE.Mesh;
}

export class FxView {
  group = new THREE.Group();
  private burns: THREE.InstancedMesh;
  private burnFlames: THREE.InstancedMesh;
  private puddles: THREE.InstancedMesh;
  private caltrops: THREE.InstancedMesh;
  private holes: THREE.InstancedMesh;
  private cache: THREE.Mesh;
  private embers: THREE.Points;
  private emberSeeds: Float32Array;
  private arrows: THREE.Group[] = [];
  private arrowLaunched = new Set<number>();
  private puffs: Puff[] = [];
  private puffCursor = 0;
  private splinters: Splinter[] = [];
  private splinterCursor = 0;
  private boltGlows: THREE.Sprite[] = [];
  private sparkLines: THREE.Line[] = [];
  private beamRod: THREE.Mesh;
  private structHp = new Map<string, number>();
  private charHp = [0, 0];
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor() {
    this.burns = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
      BURN_MAT,
      10,
    );
    this.burnFlames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.9, 5), FLAME_MAT, 40);
    this.puddles = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
      PUDDLE_MAT,
      12,
    );
    this.caltrops = new THREE.InstancedMesh(new THREE.ConeGeometry(0.6, 0.35, 5), CALTROP_MAT, 8);
    this.holes = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1.2, 10).rotateX(-Math.PI / 2),
      HOLE_MAT,
      4,
    );
    for (const mesh of [this.burns, this.burnFlames, this.puddles, this.caltrops, this.holes]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.cache = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.8, 0.8),
      new THREE.MeshLambertMaterial({
        color: PALETTE.flame,
        emissive: PALETTE.ember,
        emissiveIntensity: 0.5,
        flatShading: true,
      }),
    );
    this.cache.visible = false;
    this.group.add(this.cache);

    // Arrow pool: a real shaft, head, and fletch that fly the shot.
    for (let i = 0; i < ARROW_MAX; i++) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 4), SHAFT_MAT);
      shaft.rotation.x = Math.PI / 2;
      g.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), HEAD_MAT);
      head.rotation.x = Math.PI / 2;
      head.position.z = 0.48;
      g.add(head);
      const fletch = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 3), SHAFT_MAT);
      fletch.rotation.x = -Math.PI / 2;
      fletch.position.z = -0.4;
      g.add(fletch);
      g.visible = false;
      this.group.add(g);
      this.arrows.push(g);
    }

    // Shared glow-sprite pool: impact bursts, air wakes, heal motes.
    for (let i = 0; i < PUFF_MAX; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: GLOW_TEX,
          color: 0xffffff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sp.visible = false;
      this.group.add(sp);
      this.puffs.push({ born: -9, life: 0.3, size: 1, rise: 0, sprite: sp });
    }

    for (let i = 0; i < SPLINTER_MAX; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), SPLINTER_MAT);
      mesh.visible = false;
      this.group.add(mesh);
      this.splinters.push({ born: -9, vx: 0, vy: 0, vz: 0, mesh });
    }

    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: GLOW_TEX,
          color: ELEMENT_COLOR.fire,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sp.visible = false;
      this.group.add(sp);
      this.boltGlows.push(sp);
      const geo = new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 9 }, () => new THREE.Vector3()),
      );
      const line = new THREE.Line(geo, BOLT_LINE_MAT);
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      this.sparkLines.push(line);
    }

    this.beamRod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), BEAM_MAT);
    this.beamRod.visible = false;
    this.group.add(this.beamRod);

    const pos = new Float32Array(EMBER_COUNT * 3);
    this.emberSeeds = new Float32Array(EMBER_COUNT * 4);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberSeeds[i * 4] = Math.random() * Math.PI * 2;
      this.emberSeeds[i * 4 + 1] = 0.3 + Math.random() * 1.6;
      this.emberSeeds[i * 4 + 2] = 0.35 + Math.random() * 0.75;
      this.emberSeeds[i * 4 + 3] = Math.random() * 7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(geo, EMBER_MAT);
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
  }

  private puff(x: number, h: number, z: number, color: number, size: number, life: number, rise = 0) {
    const p = this.puffs[this.puffCursor++ % PUFF_MAX];
    p.born = performance.now() / 1000;
    p.life = life;
    p.size = size;
    p.rise = rise;
    p.sprite.material.color.setHex(color);
    p.sprite.position.set(x, h, z);
    p.sprite.visible = true;
  }

  private burst(x: number, h: number, z: number, color: number, n: number, size: number) {
    for (let i = 0; i < n; i++) {
      this.puff(
        x + (Math.random() - 0.5) * 0.7,
        h + (Math.random() - 0.5) * 0.5,
        z + (Math.random() - 0.5) * 0.7,
        color,
        size * (0.7 + Math.random() * 0.6),
        0.25 + Math.random() * 0.2,
        0.8 + Math.random(),
      );
    }
  }

  private splinterBurst(x: number, h: number, z: number) {
    for (let i = 0; i < 5; i++) {
      const s = this.splinters[this.splinterCursor++ % SPLINTER_MAX];
      s.born = performance.now() / 1000;
      s.vx = (Math.random() - 0.5) * 4;
      s.vy = 2 + Math.random() * 2.5;
      s.vz = (Math.random() - 0.5) * 4;
      s.mesh.position.set(x, h + Math.random() * 1.5, z);
      s.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      s.mesh.visible = true;
    }
  }

  update(eng: Engine, time: number) {
    const now = performance.now() / 1000;

    // Arrows fly their shot: droop along the path, then burst as an air
    // wake where they land. Beams draw as one hot rod.
    let beamDrawn = false;
    for (const tr of eng.tracers) {
      const age = eng.time - tr.t;
      const len = Math.hypot(tr.x1 - tr.x0, tr.y1 - tr.y0);
      if (tr.beam) {
        if (age < 0.09 && !beamDrawn) {
          beamDrawn = true;
          const a = new THREE.Vector3(tr.x0, tr.h0, -tr.y0);
          const b = new THREE.Vector3(tr.x1, tr.h1, -tr.y1);
          this.beamRod.visible = true;
          this.beamRod.position.copy(a).lerp(b, 0.5);
          this.beamRod.scale.set(1 + 0.15 * Math.sin(time * 31), a.distanceTo(b), 1);
          this.beamRod.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            b.clone().sub(a).normalize(),
          );
        }
        continue;
      }
      const idx = ((tr.t * 997) | 0) % ARROW_MAX;
      const arrow = this.arrows[idx];
      const flight = Math.min(0.16, len / 70);
      if (age <= flight) {
        const p = age / flight;
        const x = tr.x0 + (tr.x1 - tr.x0) * p;
        const y = tr.y0 + (tr.y1 - tr.y0) * p;
        const h = tr.h0 + (tr.h1 - tr.h0) * p - Math.sin(p * Math.PI) * len * 0.004;
        arrow.visible = true;
        arrow.position.set(x, h, -y);
        arrow.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(tr.x1 - tr.x0, tr.h1 - tr.h0, -(tr.y1 - tr.y0)).normalize(),
        );
        if (!this.arrowLaunched.has(idx)) {
          // The nock's air wake, not a tracer line.
          this.puff(tr.x0, tr.h0, -tr.y0, ELEMENT_COLOR.air, 0.5, 0.16);
          this.arrowLaunched.add(idx);
        }
      } else if (age <= flight + 0.06 && arrow.visible) {
        arrow.visible = false;
        this.arrowLaunched.delete(idx);
        this.burst(tr.x1, tr.h1, -tr.y1, ELEMENT_COLOR.air, 2, 0.5);
      }
    }
    if (!beamDrawn) this.beamRod.visible = false;

    // Spell projectiles: a fire heart with a trailing glow, or a jagged
    // amber arc for the cinder rod. Globs stay wet and ugly.
    let gi = 0;
    let li = 0;
    for (const imp of eng.impacts) {
      const span = imp.t - imp.t0;
      const p = span > 0 ? (eng.time - imp.t0) / span : 1;
      if (p < 0 || p > 1) continue;
      const x = imp.fromX + (imp.x - imp.fromX) * p;
      const y = imp.fromY + (imp.y - imp.fromY) * p;
      const room = ROOMS[imp.room];
      const elev = elevAt(room, Math.max(room.y0, Math.min(room.y1, y)));
      const arcH = imp.isGlob ? 5 : 3;
      const h = elev + 1.4 + Math.sin(p * Math.PI) * arcH;
      if (imp.element === "spark" && li < this.sparkLines.length) {
        // Lightning the color of struck flint: jitter the whole arc.
        const line = this.sparkLines[li++];
        line.visible = true;
        const posAttr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
        const eh = elevAt(ROOMS[imp.room], imp.fromY) + 1.5;
        for (let k = 0; k < 9; k++) {
          const f = k / 8;
          const jx = (Math.random() - 0.5) * 0.7 * Math.sin(f * Math.PI);
          const jh = (Math.random() - 0.5) * 0.7 * Math.sin(f * Math.PI);
          posAttr.setXYZ(
            k,
            imp.fromX + (x - imp.fromX) * f + jx,
            eh + (h - eh) * f + jh,
            -(imp.fromY + (y - imp.fromY) * f) + jx * 0.5,
          );
        }
        posAttr.needsUpdate = true;
      }
      if (gi < this.boltGlows.length) {
        const glow = this.boltGlows[gi++];
        glow.visible = true;
        glow.material.color.setHex(ELEMENT_COLOR[imp.element]);
        glow.position.set(x, h, -y);
        const sc = imp.isGlob ? 0.9 : 1.3 + 0.25 * Math.sin(time * 24);
        glow.scale.set(sc, sc, 1);
        if (!imp.isGlob && Math.random() < 0.6) {
          this.puff(x, h, -y, ELEMENT_COLOR[imp.element], 0.5, 0.22, 0.2);
        }
      }
    }
    for (let k = gi; k < this.boltGlows.length; k++) this.boltGlows[k].visible = false;
    for (let k = li; k < this.sparkLines.length; k++) this.sparkLines[k].visible = false;

    // Impacts that landed since last frame burst in their element.
    for (const hit of this.landedImpacts(eng)) {
      this.burst(hit.x, hit.h, -hit.y, hit.color, 5, 0.9);
    }

    // Ground hazards, with living flames on the burn fields.
    let bi = 0;
    let pui = 0;
    let ci = 0;
    let fi = 0;
    for (const hz of eng.hazards) {
      const room = ROOMS[hz.room];
      const elev = elevAt(room, hz.y);
      const pulse = 1 + 0.05 * Math.sin(time * 2.1 + hz.x);
      this.q.identity();
      this.v.set(hz.x, elev + 0.05, -hz.y);
      this.s.set(hz.radius * pulse, 1, hz.radius * pulse);
      this.m.compose(this.v, this.q, this.s);
      if (hz.kind === "burnfield" && bi < 10) {
        this.burns.setMatrixAt(bi++, this.m);
        for (let f = 0; f < 4 && fi < 40; f++) {
          const ang = f * 1.57 + time * 0.8;
          const fs = 0.8 + 0.3 * Math.sin(time * 6 + f * 2.2);
          this.v.set(
            hz.x + Math.cos(ang) * hz.radius * 0.55,
            elev + 0.45 * fs,
            -(hz.y + Math.sin(ang) * hz.radius * 0.55),
          );
          this.s.set(fs, fs, fs);
          this.m.compose(this.v, this.q, this.s);
          this.burnFlames.setMatrixAt(fi++, this.m);
        }
      } else if (hz.kind === "puddle" && pui < 12) this.puddles.setMatrixAt(pui++, this.m);
      else if (hz.kind === "caltrops" && ci < 8) {
        this.s.set(hz.radius * 0.5, 1, hz.radius * 0.5);
        this.m.compose(this.v, this.q, this.s);
        this.caltrops.setMatrixAt(ci++, this.m);
      }
    }
    this.burns.count = bi;
    this.burnFlames.count = fi;
    this.puddles.count = pui;
    this.caltrops.count = ci;
    this.burns.instanceMatrix.needsUpdate = true;
    this.burnFlames.instanceMatrix.needsUpdate = true;
    this.puddles.instanceMatrix.needsUpdate = true;
    this.caltrops.instanceMatrix.needsUpdate = true;

    let hi = 0;
    for (const hole of eng.holes) {
      if (hi >= 4) break;
      const elev = elevAt(ROOMS[hole.room], hole.y);
      this.v.set(hole.x, elev + 0.04, -hole.y);
      this.q.identity();
      this.s.set(1, 1, 1);
      this.m.compose(this.v, this.q, this.s);
      this.holes.setMatrixAt(hi++, this.m);
    }
    this.holes.count = hi;
    this.holes.instanceMatrix.needsUpdate = true;

    if (eng.bossCacheAt && eng.bossCacheOffer) {
      const at = eng.bossCacheAt;
      const elev = elevAt(ROOMS[at.room], at.y);
      this.cache.visible = true;
      this.cache.position.set(at.x, elev + 0.5 + 0.1 * Math.sin(time * 2), -at.y);
      this.cache.rotation.y = time * 0.6;
    } else {
      this.cache.visible = false;
    }

    // Structures splinter when they lose wood.
    for (const d of DOORS) {
      if (!d.barricade) continue;
      const s = eng.structures[d.barricade];
      const prev = this.structHp.get(d.barricade) ?? s.hp;
      if (s.hp < prev - 0.5) {
        const mid = doorMid(d);
        this.splinterBurst(mid.x, 0.6, -mid.y);
      }
      this.structHp.set(d.barricade, s.hp);
    }
    const wf = eng.structures.watchfire;
    const wfPrev = this.structHp.get("watchfire" as StructureId) ?? wf.hp;
    if (wf.hp < wfPrev - 0.5) this.burst(0, 1.2, -6, ELEMENT_COLOR.fire, 4, 1.1);
    this.structHp.set("watchfire" as StructureId, wf.hp);

    // Healing reads as rising warm light on the healed.
    for (const i of [0, 1] as const) {
      const c = eng.chars[i];
      const prev = this.charHp[i];
      if (c.hp > prev + 4 && eng.phase === "combat") {
        const elev = elevAt(ROOMS[c.room], c.y);
        for (let k = 0; k < 5; k++) {
          this.puff(
            c.x + (Math.random() - 0.5) * 0.8,
            elev + 0.4 + Math.random() * 1.2,
            -(c.y + (Math.random() - 0.5) * 0.8),
            ELEMENT_COLOR.heal,
            0.45,
            0.5,
            1.4,
          );
        }
      }
      this.charHp[i] = c.hp;
    }

    // Age the pools.
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      const age = now - p.born;
      if (age > p.life) {
        p.sprite.visible = false;
        continue;
      }
      const f = age / p.life;
      const sc = p.size * (0.6 + f * 1.2);
      p.sprite.scale.set(sc, sc, 1);
      p.sprite.material.opacity = (1 - f) * 0.85;
      p.sprite.position.y += p.rise * (1 / 60);
    }
    for (const s of this.splinters) {
      if (!s.mesh.visible) continue;
      const age = now - s.born;
      if (age > 0.55) {
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 9.8 / 60;
      s.mesh.position.x += s.vx / 60;
      s.mesh.position.y += s.vy / 60;
      s.mesh.position.z += s.vz / 60;
      s.mesh.rotation.x += 0.2;
      s.mesh.rotation.z += 0.15;
    }

    // Embers drift up from the watchfire on their seeded, endless loop.
    const pos = this.embers.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < EMBER_COUNT; i++) {
      const ang = this.emberSeeds[i * 4];
      const rad = this.emberSeeds[i * 4 + 1];
      const speed = this.emberSeeds[i * 4 + 2];
      const phase = this.emberSeeds[i * 4 + 3];
      const life = (time * speed + phase) % 6;
      const sway = Math.sin(time * 0.8 + phase) * 0.3 * life;
      const source = i % 5 === 0 ? { x: 0, y: 26.5 } : { x: 0, y: 6 };
      pos.setXYZ(
        i,
        source.x + Math.cos(ang) * rad * 0.4 + sway,
        0.8 + life * 1.1,
        -(source.y + Math.sin(ang) * rad * 0.4),
      );
    }
    pos.needsUpdate = true;
  }

  // Impacts that vanished from the queue since last frame, with their
  // burst color.
  private prevImpacts = new Map<string, { x: number; y: number; h: number; color: number }>();

  private landedImpacts(eng: Engine) {
    const cur = new Map<string, { x: number; y: number; h: number; color: number }>();
    for (const imp of eng.impacts) {
      const room = ROOMS[imp.room];
      const elev = elevAt(room, Math.max(room.y0, Math.min(room.y1, imp.y)));
      cur.set(`${imp.t0.toFixed(3)}:${imp.x.toFixed(1)}:${imp.y.toFixed(1)}`, {
        x: imp.x,
        y: imp.y,
        h: elev + 0.5,
        color: ELEMENT_COLOR[imp.element],
      });
    }
    const landed: { x: number; y: number; h: number; color: number }[] = [];
    for (const [key, val] of this.prevImpacts) {
      if (!cur.has(key)) landed.push(val);
    }
    this.prevImpacts = cur;
    return landed;
  }
}
