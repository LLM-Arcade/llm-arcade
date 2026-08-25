// Actor rendering: the two rigid-part hero figures and the instanced
// horde. No skeletal animation anywhere; poses and gait are procedural
// transforms, which suits the toy-soldier look and costs nothing.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Character, Engine, GloamUnit } from "../engine.ts";
import { ROOMS, elevAt } from "../hold.ts";
import { WEAPONS } from "../arsenal.ts";
import type { ClassId, GloamType } from "../types.ts";
import { PALETTE } from "./scene.ts";

const HIDE = new THREE.MeshLambertMaterial({ color: PALETTE.gloamHide, flatShading: true });
const EYE = new THREE.MeshBasicMaterial({ color: PALETTE.gloamEye });
const SHADOW = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});

function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const CLASS_COLORS: Record<ClassId, { body: number; trim: number; head: number }> = {
  knight: { body: 0x6d675e, trim: 0x8a5a44, head: 0x7d7469 },
  archer: { body: 0x5c5838, trim: 0x6f6b3f, head: 0xc9a37c },
  mage: { body: 0x9a8f7a, trim: 0xd9a441, head: 0xc9a37c },
};

// A hero: root group -> torso, head, two arms, two legs, weapon on the
// right hand. Pose fields drive walk swing, swings, blocks, and downs.
export class HeroView {
  root = new THREE.Group();
  private armR: THREE.Object3D;
  private armL: THREE.Object3D;
  private legR: THREE.Mesh;
  private legL: THREE.Mesh;
  private torso: THREE.Mesh;
  private walkPhase = 0;
  private prevX = 0;
  private prevY = 0;

  constructor(cls: ClassId) {
    const c = CLASS_COLORS[cls];
    this.torso = part(this.root, new THREE.BoxGeometry(0.62, 0.72, 0.4), c.body, 0, 1.05, 0);
    part(this.root, new THREE.BoxGeometry(0.34, 0.32, 0.32), c.head, 0, 1.62, 0);
    if (cls === "knight") {
      part(this.root, new THREE.BoxGeometry(0.86, 0.16, 0.44), c.trim, 0, 1.38, 0);
    }
    if (cls === "archer") {
      part(this.root, new THREE.ConeGeometry(0.26, 0.4, 5), c.trim, 0, 1.86, 0);
    }
    if (cls === "mage") {
      part(this.root, new THREE.ConeGeometry(0.46, 0.8, 6), c.body, 0, 0.5, 0);
      part(this.root, new THREE.BoxGeometry(0.66, 0.12, 0.44), c.trim, 0, 0.86, 0);
    }
    this.legR = part(this.root, new THREE.BoxGeometry(0.2, 0.68, 0.24), c.body, 0.17, 0.36, 0);
    this.legL = part(this.root, new THREE.BoxGeometry(0.2, 0.68, 0.24), c.body, -0.17, 0.36, 0);

    this.armR = new THREE.Group();
    this.armR.position.set(0.42, 1.3, 0);
    this.root.add(this.armR);
    part(this.armR, new THREE.BoxGeometry(0.16, 0.6, 0.2), c.body, 0, -0.26, 0);
    this.armL = new THREE.Group();
    this.armL.position.set(-0.42, 1.3, 0);
    this.root.add(this.armL);
    part(this.armL, new THREE.BoxGeometry(0.16, 0.6, 0.2), c.body, 0, -0.26, 0);

    // The weapon silhouette per class.
    if (cls === "knight") {
      part(this.armR, new THREE.BoxGeometry(0.1, 1.15, 0.16), 0xb8b0a2, 0, -0.95, 0.1);
      part(this.armR, new THREE.BoxGeometry(0.3, 0.1, 0.2), 0x4a3222, 0, -0.5, 0.1);
    } else if (cls === "archer") {
      const bow = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.045, 5, 10, Math.PI * 1.15),
        new THREE.MeshLambertMaterial({ color: 0x4a3222, flatShading: true }),
      );
      bow.rotation.z = -Math.PI / 2 - 0.35;
      bow.position.set(0, -0.5, 0.12);
      this.armL.add(bow);
      part(this.armR, new THREE.BoxGeometry(0.06, 0.5, 0.1), 0x8a8478, 0, -0.6, 0.12);
    } else {
      part(this.armR, new THREE.BoxGeometry(0.09, 1.5, 0.09), 0x4a3222, 0, -0.7, 0.1);
      part(this.armR, new THREE.ConeGeometry(0.16, 0.3, 5), PALETTE.flame, 0, 0.12, 0.1);
    }
  }

  update(c: Character, time: number, dt: number, engTime: number) {
    const elev = elevAt(ROOMS[c.room], c.y);
    this.root.position.set(c.x, elev, -c.y);
    this.root.rotation.set(0, 0, 0);
    // Sim yaw 0 faces +x east and +y is north (-z here); the figure's
    // forward is +z, so the mapping is yaw + 90 degrees.
    this.root.rotation.y = c.yaw + Math.PI / 2;

    const moved = Math.hypot(c.x - this.prevX, c.y - this.prevY);
    this.prevX = c.x;
    this.prevY = c.y;
    const speed = dt > 0 ? moved / dt : 0;
    this.walkPhase += speed * dt * 2.4;
    const swing = Math.sin(this.walkPhase * Math.PI) * Math.min(0.7, speed * 0.12);
    this.legR.rotation.x = swing;
    this.legL.rotation.x = -swing;

    if (c.state !== "up") {
      // Down: flat on the ground, holding its authored pose.
      this.root.rotation.x = -Math.PI / 2;
      this.root.position.y = elev + 0.35;
      return;
    }

    const w = WEAPONS[c.weapon.id];
    let armR = -swing * 0.6;
    let armL = swing * 0.6;
    let armRYaw = 0;
    let torsoYaw = 0;
    if (w.kind === "melee") {
      const sinceSwing = engTime - c.lastAttackAt;
      const swingDur = Math.min(0.3, (w.cycle ?? 0.5) * 0.6);
      if (c.charging) {
        // Wound up over the shoulder, blade back, hips coiled. A slow
        // tremble sells the held weight.
        armR = -2.5 + 0.05 * Math.sin(time * 9);
        armRYaw = 0.7;
        torsoYaw = 0.42;
      } else if (sinceSwing >= 0 && sinceSwing < swingDur) {
        // The cut: a fast horizontal arc across the body, torso
        // counter-rotating through it. Ease out so the blade snaps
        // through the middle of the arc and settles.
        const k = sinceSwing / swingDur;
        const e = 1 - Math.pow(1 - k, 3);
        armR = -2.3 + (0.15 - -2.3) * e * 0.85;
        armRYaw = 0.8 - 2.0 * e;
        torsoYaw = 0.35 - 0.8 * e;
      } else if (sinceSwing >= swingDur && c.attackCd > 0) {
        // Recovery: drift back to guard as the cooldown runs out.
        const back = Math.min(1, (sinceSwing - swingDur) / 0.25);
        armR = -0.5 * (1 - back) - swing * 0.6 * back;
        armRYaw = -1.2 * (1 - back);
        torsoYaw = -0.45 * (1 - back);
      }
      if (c.blockHeld) {
        armL = -1.3;
        armR = -1.1;
        armRYaw = 0;
        torsoYaw = 0;
      }
    } else if (w.kind === "bow") {
      armL = -1.55; // bow arm forward
      armR = c.charging ? -1.1 : -1.4;
    } else {
      armR = c.charging ? -1.7 : -0.9; // staff raised to cast
    }
    if (c.bandageT > 0) {
      this.torso.rotation.x = 0.5;
      armR = 0.8;
      armL = 0.8;
    } else {
      this.torso.rotation.x = 0;
    }
    if (c.reviveT > 0) this.torso.rotation.x = 0.7;
    this.armR.rotation.x = armR;
    this.armR.rotation.y = armRYaw;
    this.torso.rotation.y = torsoYaw;
    this.armL.rotation.x = armL;
    // A breath of idle sway keeps the figure alive between actions.
    this.torso.position.y = 1.05 + 0.015 * Math.sin(time * 1.9);
  }
}

// One merged low-poly geometry per Gloam type, hide and eyes as two
// material groups, drawn as a single InstancedMesh.
function gloamGeometry(type: GloamType): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const eyes: THREE.BufferGeometry[] = [];
  // Primitives disagree about indexing (polyhedra are non-indexed), and
  // the merge demands uniformity, so everything flattens first.
  const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
  const add = (g0: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0) => {
    const g = flat(g0);
    g.rotateX(rx);
    g.rotateY(ry);
    g.translate(x, y, z);
    parts.push(g);
  };
  const eye = (x: number, y: number, z: number, s = 0.09) => {
    const g = flat(new THREE.BoxGeometry(s, s, s));
    g.translate(x, y, z);
    eyes.push(g);
  };
  switch (type) {
    case "gnasher":
    case "skitterling": {
      const s = type === "skitterling" ? 0.45 : 1;
      add(new THREE.BoxGeometry(0.55 * s, 0.5 * s, 1.1 * s), 0, 0.45 * s, 0);
      add(new THREE.ConeGeometry(0.26 * s, 0.6 * s, 5), 0, 0.55 * s, 0.75 * s, 0, Math.PI / 2);
      eye(-0.12 * s, 0.62 * s, 0.62 * s, 0.08 * s);
      eye(0.12 * s, 0.62 * s, 0.62 * s, 0.08 * s);
      break;
    }
    case "alpha":
      add(new THREE.BoxGeometry(0.9, 0.8, 1.6), 0, 0.7, 0);
      add(new THREE.ConeGeometry(0.4, 0.9, 5), 0, 0.85, 1.1, 0, Math.PI / 2);
      add(new THREE.ConeGeometry(0.16, 0.55, 4), -0.4, 1.25, 0.2);
      add(new THREE.ConeGeometry(0.16, 0.55, 4), 0.4, 1.25, 0.2);
      eye(-0.16, 0.95, 0.95, 0.11);
      eye(0.16, 0.95, 0.95, 0.11);
      break;
    case "lobber":
      add(new THREE.BoxGeometry(0.7, 1.1, 0.6), 0, 0.75, 0);
      add(new THREE.IcosahedronGeometry(0.5, 0), 0, 0.65, 0.35);
      add(new THREE.BoxGeometry(0.3, 0.35, 0.3), 0, 1.5, 0.1);
      eye(-0.09, 1.55, 0.28);
      eye(0.09, 1.55, 0.28);
      break;
    case "breacher":
      add(new THREE.BoxGeometry(0.8, 1.4, 0.7), 0, 0.9, -0.1);
      add(new THREE.BoxGeometry(1.5, 1.7, 0.16), 0, 0.95, 0.55);
      add(new THREE.BoxGeometry(0.34, 0.3, 0.3), 0, 1.75, -0.05);
      eye(-0.09, 1.8, 0.12);
      eye(0.09, 1.8, 0.12);
      break;
    case "shrike":
      add(new THREE.BoxGeometry(0.42, 1.15, 0.4), 0, 0.95, 0);
      add(new THREE.ConeGeometry(0.09, 0.9, 4), -0.32, 0.95, 0.25, 0, Math.PI / 2.3);
      add(new THREE.ConeGeometry(0.09, 0.9, 4), 0.32, 0.95, 0.25, 0, Math.PI / 2.3);
      add(new THREE.ConeGeometry(0.2, 0.5, 5), 0, 1.75, 0.05);
      eye(-0.08, 1.6, 0.2);
      eye(0.08, 1.6, 0.2);
      break;
    case "mauler":
    case "cracktusk":
    case "coalhide": {
      const s = type === "mauler" ? 1 : type === "cracktusk" ? 1.25 : 1.4;
      add(new THREE.BoxGeometry(1.5 * s, 1.5 * s, 1.3 * s), 0, 1.0 * s, 0);
      add(new THREE.BoxGeometry(0.55 * s, 0.5 * s, 0.5 * s), 0, 1.9 * s, 0.45 * s);
      add(new THREE.BoxGeometry(0.5 * s, 1.1 * s, 0.5 * s), -0.95 * s, 0.62 * s, 0.25 * s);
      add(new THREE.BoxGeometry(0.5 * s, 1.1 * s, 0.5 * s), 0.95 * s, 0.62 * s, 0.25 * s);
      if (type === "cracktusk") {
        add(new THREE.ConeGeometry(0.14, 0.9, 4), -0.3, 1.75, 0.95, 0, Math.PI / 2.4);
        add(new THREE.ConeGeometry(0.14, 0.9, 4), 0.3, 1.75, 0.95, 0, Math.PI / 2.4);
      }
      if (type === "coalhide") {
        add(new THREE.BoxGeometry(1.7 * s, 0.3, 1.5 * s), 0, 1.85 * s, -0.05);
      }
      eye(-0.14 * s, 2.0 * s, 0.72 * s, 0.11 * s);
      eye(0.14 * s, 2.0 * s, 0.72 * s, 0.11 * s);
      break;
    }
    case "ironback":
      add(new THREE.BoxGeometry(0.6, 0.5, 1.1), 0, 0.45, 0);
      add(new THREE.ConeGeometry(0.55, 0.5, 6), 0, 0.85, -0.1);
      add(new THREE.ConeGeometry(0.24, 0.55, 5), 0, 0.5, 0.75, 0, Math.PI / 2);
      eye(-0.11, 0.58, 0.62);
      eye(0.11, 0.58, 0.62);
      break;
    case "hexer":
    case "shepherd": {
      const s = type === "hexer" ? 1 : 1.7;
      add(new THREE.ConeGeometry(0.5 * s, 1.9 * s, 6), 0, 0.95 * s, 0);
      add(new THREE.ConeGeometry(0.26 * s, 0.55 * s, 5), 0, 2.05 * s, 0.05);
      const halo = flat(new THREE.TorusGeometry(0.42 * s, 0.05, 4, 8));
      halo.rotateX(Math.PI / 2);
      halo.translate(0, 2.35 * s, 0);
      parts.push(halo);
      eye(-0.08 * s, 1.95 * s, 0.2 * s);
      eye(0.08 * s, 1.95 * s, 0.2 * s);
      break;
    }
    case "stalker":
      add(new THREE.BoxGeometry(0.5, 0.9, 1.0), 0, 0.85, 0);
      add(new THREE.ConeGeometry(0.12, 1.0, 4), -0.3, 0.4, 0.4, 0, Math.PI);
      add(new THREE.ConeGeometry(0.12, 1.0, 4), 0.3, 0.4, 0.4, 0, Math.PI);
      add(new THREE.ConeGeometry(0.22, 0.55, 5), 0, 1.35, 0.6, 0, Math.PI / 2);
      eye(-0.1, 1.42, 0.5);
      eye(0.1, 1.42, 0.5);
      break;
    case "filcher":
      add(new THREE.BoxGeometry(0.45, 0.75, 0.5), 0, 0.6, 0);
      add(new THREE.IcosahedronGeometry(0.4, 0), 0, 0.85, -0.4);
      add(new THREE.ConeGeometry(0.18, 0.45, 5), 0, 1.15, 0.3, 0, Math.PI / 2);
      eye(-0.08, 1.2, 0.25);
      eye(0.08, 1.2, 0.25);
      break;
    case "sapper":
      add(new THREE.BoxGeometry(0.9, 0.9, 1.0), 0, 0.6, 0);
      add(new THREE.ConeGeometry(0.3, 0.9, 6), 0, 0.65, 0.85, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(0.4, 0.35, 0.35), 0, 1.25, 0.2);
      eye(-0.09, 1.3, 0.4);
      eye(0.09, 1.3, 0.4);
      break;
    case "broodmother":
      add(new THREE.IcosahedronGeometry(1.1, 0), 0, 1.0, 0);
      add(new THREE.BoxGeometry(0.5, 0.4, 0.4), 0, 1.9, 0.55);
      add(new THREE.BoxGeometry(0.35, 0.7, 0.35), -0.7, 0.35, 0.3);
      add(new THREE.BoxGeometry(0.35, 0.7, 0.35), 0.7, 0.35, 0.3);
      eye(-0.1, 2.0, 0.78);
      eye(0.1, 2.0, 0.78);
      break;
    case "packlord": {
      const s = 2.1;
      add(new THREE.BoxGeometry(0.9 * s, 0.8 * s, 1.6 * s), 0, 0.7 * s, 0);
      add(new THREE.ConeGeometry(0.4 * s, 0.9 * s, 5), 0, 0.85 * s, 1.1 * s, 0, Math.PI / 2);
      add(new THREE.ConeGeometry(0.2 * s, 0.8 * s, 4), -0.4 * s, 1.3 * s, 0.2);
      add(new THREE.ConeGeometry(0.2 * s, 0.8 * s, 4), 0.4 * s, 1.3 * s, 0.2);
      eye(-0.16 * s, 0.95 * s, 0.95 * s, 0.13);
      eye(0.16 * s, 0.95 * s, 0.95 * s, 0.13);
      break;
    }
  }
  const hide = mergeGeometries(parts, false)!;
  const eyeGeo = mergeGeometries(eyes, false)!;
  // uv presence differs across primitives; the merged pair only needs
  // position and normal.
  hide.deleteAttribute("uv");
  eyeGeo.deleteAttribute("uv");
  const merged = mergeGeometries([hide, eyeGeo], true)!;
  hide.dispose();
  eyeGeo.dispose();
  return merged;
}

const HORDE_TYPES: GloamType[] = [
  "gnasher", "lobber", "alpha", "breacher", "shrike", "mauler", "ironback",
  "hexer", "stalker", "filcher", "sapper", "broodmother", "skitterling",
  "cracktusk", "shepherd", "coalhide", "packlord",
];

export interface HordeFxHooks {
  death: (x: number, h: number, z: number, size: number) => void;
  hit: (x: number, h: number, z: number) => void;
}

export class HordeView {
  group = new THREE.Group();
  private meshes = new Map<GloamType, THREE.InstancedMesh>();
  private shadows: THREE.InstancedMesh;
  private tracked = new Map<number, { x: number; y: number; elev: number; hp: number; radius: number; height: number }>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    for (const type of HORDE_TYPES) {
      const mesh = new THREE.InstancedMesh(gloamGeometry(type), [HIDE, EYE], 34);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes.set(type, mesh);
    }
    this.shadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2),
      SHADOW,
      40,
    );
    this.shadows.frustumCulled = false;
    this.group.add(this.shadows);
  }

  update(eng: Engine, time: number, fx?: HordeFxHooks) {
    const counts = new Map<GloamType, number>();
    let shadowCount = 0;
    const seen = new Set<number>();
    for (const u of eng.gloam) {
      seen.add(u.id);
      const prev = this.tracked.get(u.id);
      const elevNow = elevAt(ROOMS[u.room], u.y);
      if (prev && fx && u.hp < prev.hp - 0.5) {
        fx.hit(u.x, elevNow + u.height * 0.6, -u.y);
      }
      this.tracked.set(u.id, {
        x: u.x,
        y: u.y,
        elev: elevNow,
        hp: u.hp,
        radius: u.radius,
        height: u.height,
      });
    }
    for (const [id, rec] of this.tracked) {
      if (!seen.has(id)) {
        fx?.death(rec.x, rec.elev + rec.height * 0.4, -rec.y, rec.radius + 0.4);
        this.tracked.delete(id);
      }
    }
    for (const u of eng.gloam) {
      const mesh = this.meshes.get(u.type);
      if (!mesh) continue;
      const i = counts.get(u.type) ?? 0;
      if (i >= 34) continue;
      counts.set(u.type, i + 1);
      const elev = elevAt(ROOMS[u.room], u.y);
      const bob = Math.sin(time * 7 + u.id * 1.7) * 0.06;
      // Sim yaw 0 faces +x; the merged geometry faces +z.
      this.q.setFromEuler(
        new THREE.Euler(
          u.state === "telegraph" ? -0.25 : u.staggered > 0 ? 0.3 : 0,
          u.yaw + Math.PI / 2,
          0,
        ),
      );
      this.v.set(u.x, elev + bob, -u.y);
      const flinch = u.stunned > 0 ? 0.92 : 1;
      this.s.set(flinch, flinch, flinch);
      this.m.compose(this.v, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
      if (shadowCount < 40) {
        this.q.identity();
        this.v.set(u.x, elev + 0.03, -u.y);
        this.s.set(u.radius * 1.6, 1, u.radius * 1.6);
        this.m.compose(this.v, this.q, this.s);
        this.shadows.setMatrixAt(shadowCount++, this.m);
      }
    }
    for (const [type, mesh] of this.meshes) {
      mesh.count = counts.get(type) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.shadows.count = shadowCount;
    this.shadows.instanceMatrix.needsUpdate = true;
  }
}

export function unitById(eng: Engine, id: number): GloamUnit | null {
  return eng.gloam.find((g) => g.id === id) ?? null;
}
