// Combat and hazard effects: arrow tracers, arcing bolts and globs,
// ground hazards, sapper holes, the boss cache, and the ember drift that
// keeps the night alive. Everything pools; nothing allocates per frame.

import * as THREE from "three";
import type { Engine } from "../engine.ts";
import { ROOMS, elevAt } from "../hold.ts";
import { PALETTE } from "./scene.ts";

const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xe8d9b0 });
const BEAM_MAT = new THREE.MeshBasicMaterial({ color: PALETTE.flameHot });
const BOLT_MAT = new THREE.MeshBasicMaterial({ color: PALETTE.flame });
const GLOB_MAT = new THREE.MeshBasicMaterial({ color: PALETTE.ember });
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
const EMBER_MAT = new THREE.PointsMaterial({
  color: PALETTE.flameHot,
  size: 2.6, // screen pixels: attenuation off keeps near embers from
  sizeAttenuation: false, // becoming giant squares against the lens
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
});

const EMBER_COUNT = 240;

export class FxView {
  group = new THREE.Group();
  private tracers: THREE.InstancedMesh;
  private projectiles: THREE.InstancedMesh;
  private globs: THREE.InstancedMesh;
  private burns: THREE.InstancedMesh;
  private puddles: THREE.InstancedMesh;
  private caltrops: THREE.InstancedMesh;
  private holes: THREE.InstancedMesh;
  private cache: THREE.Mesh;
  private embers: THREE.Points;
  private emberSeeds: Float32Array;
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const rod = new THREE.BoxGeometry(0.05, 0.05, 1);
    this.tracers = new THREE.InstancedMesh(rod, TRACER_MAT, 24);
    this.projectiles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 0), BOLT_MAT, 16);
    this.globs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 0), GLOB_MAT, 16);
    this.burns = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
      BURN_MAT,
      10,
    );
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
    for (const mesh of [
      this.tracers, this.projectiles, this.globs, this.burns, this.puddles,
      this.caltrops, this.holes,
    ]) {
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

    // Ambient embers rising off the watchfire and torches.
    const pos = new Float32Array(EMBER_COUNT * 3);
    this.emberSeeds = new Float32Array(EMBER_COUNT * 4);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberSeeds[i * 4] = Math.random() * Math.PI * 2; // spawn angle
      this.emberSeeds[i * 4 + 1] = 0.3 + Math.random() * 1.6; // radius
      this.emberSeeds[i * 4 + 2] = 0.35 + Math.random() * 0.75; // rise speed
      this.emberSeeds[i * 4 + 3] = Math.random() * 7; // phase
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(geo, EMBER_MAT);
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
  }

  update(eng: Engine, time: number) {
    // Tracers: stretched rods that live for a blink.
    let ti = 0;
    for (const tr of eng.tracers) {
      if (ti >= 24) break;
      const age = eng.time - tr.t;
      if (age > (tr.beam ? 0.1 : 0.18)) continue;
      const a = new THREE.Vector3(tr.x0, tr.h0, -tr.y0);
      const b = new THREE.Vector3(tr.x1, tr.h1, -tr.y1);
      const len = a.distanceTo(b);
      if (len < 0.2) continue;
      this.v.copy(a).lerp(b, 0.5);
      const dir = b.clone().sub(a).normalize();
      this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      this.s.set(tr.beam ? 2.2 : 1, tr.beam ? 2.2 : 1, len);
      this.m.compose(this.v, this.q, this.s);
      this.tracers.setMatrixAt(ti, this.m);
      ti++;
    }
    this.tracers.count = ti;
    this.tracers.instanceMatrix.needsUpdate = true;
    this.tracers.material = eng.tracers.some((t) => t.beam && eng.time - t.t < 0.1)
      ? BEAM_MAT
      : TRACER_MAT;

    // Arcing projectiles: bolts up-and-over, globs lobbed high.
    let pi = 0;
    let gi = 0;
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
      this.v.set(x, h, -y);
      this.q.identity();
      this.s.set(1, 1, 1);
      this.m.compose(this.v, this.q, this.s);
      if (imp.isGlob && gi < 16) this.globs.setMatrixAt(gi++, this.m);
      else if (!imp.isGlob && pi < 16) this.projectiles.setMatrixAt(pi++, this.m);
    }
    this.projectiles.count = pi;
    this.globs.count = gi;
    this.projectiles.instanceMatrix.needsUpdate = true;
    this.globs.instanceMatrix.needsUpdate = true;

    // Ground hazards.
    let bi = 0;
    let pui = 0;
    let ci = 0;
    for (const h of eng.hazards) {
      const room = ROOMS[h.room];
      const elev = elevAt(room, h.y);
      const pulse = 1 + 0.05 * Math.sin(time * 2.1 + h.x);
      this.q.identity();
      this.v.set(h.x, elev + 0.05, -h.y);
      this.s.set(h.radius * pulse, 1, h.radius * pulse);
      this.m.compose(this.v, this.q, this.s);
      if (h.kind === "burnfield" && bi < 10) this.burns.setMatrixAt(bi++, this.m);
      else if (h.kind === "puddle" && pui < 12) this.puddles.setMatrixAt(pui++, this.m);
      else if (h.kind === "caltrops" && ci < 8) {
        this.s.set(h.radius * 0.5, 1, h.radius * 0.5);
        this.m.compose(this.v, this.q, this.s);
        this.caltrops.setMatrixAt(ci++, this.m);
      }
    }
    this.burns.count = bi;
    this.puddles.count = pui;
    this.caltrops.count = ci;
    this.burns.instanceMatrix.needsUpdate = true;
    this.puddles.instanceMatrix.needsUpdate = true;
    this.caltrops.instanceMatrix.needsUpdate = true;

    // Sapper holes.
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

    // The boss cache glows where the boss fell until someone claims it.
    if (eng.bossCacheAt && eng.bossCacheOffer) {
      const at = eng.bossCacheAt;
      const elev = elevAt(ROOMS[at.room], at.y);
      this.cache.visible = true;
      this.cache.position.set(at.x, elev + 0.5 + 0.1 * Math.sin(time * 2), -at.y);
      this.cache.rotation.y = time * 0.6;
    } else {
      this.cache.visible = false;
    }

    // Embers drift up from the watchfire; their loop is seeded, slow, and
    // endless.
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
}
