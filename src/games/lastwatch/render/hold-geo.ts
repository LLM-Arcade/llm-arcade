// The hold's geometry, built from the same room and door data the sim
// runs on. Low-poly flat-shaded boxes and cones; the fog and the fire do
// the heavy lifting. Dynamic pieces (rubble, barricades, flames, banners)
// update per frame from engine state.

import * as THREE from "three";
import { DOORS, ROOMS, STATIONS, WATCHFIRE_POS, type Door } from "../hold.ts";
import type { Engine } from "../engine.ts";
import type { DistrictId, RoomId, StructureId } from "../types.ts";
import { BARRICADE_HP } from "../arsenal.ts";
import { PALETTE } from "./scene.ts";
import { cobbleTexture, plankTexture, scrubTexture, stoneTexture } from "./textures.ts";

const WALL_H = 5;
const WALL_T = 0.7;
const PARTITION_H = 3;

function lambert(color: number, emissive = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    emissive,
    emissiveIntensity: emissive ? 1 : 0,
    flatShading: true,
  });
}

const STONE_TEX = stoneTexture();
const PLANK_TEX = plankTexture();
const COBBLE_TEX = cobbleTexture();
const SCRUB_TEX = scrubTexture();

function texLambert(tex: THREE.Texture, rx: number, ry: number, tint = 0xffffff) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return new THREE.MeshLambertMaterial({ map: t, color: tint, flatShading: true });
}

// Stone and floor materials cache by rounded repeat so long walls tile at
// world scale without a material per mesh.
const stoneCache = new Map<string, THREE.MeshLambertMaterial>();
function stoneMat(len: number, height: number): THREE.MeshLambertMaterial {
  const rx = Math.max(1, Math.round(len / 4));
  const ry = Math.max(1, Math.round(height / 2.5));
  const key = `${rx}:${ry}`;
  let m = stoneCache.get(key);
  if (!m) {
    m = texLambert(STONE_TEX, rx, ry);
    stoneCache.set(key, m);
  }
  return m;
}

const MAT = {
  stone: lambert(PALETTE.stone),
  stoneShade: lambert(PALETTE.stoneShade),
  timber: texLambert(PLANK_TEX, 1, 1),
  timberDark: lambert(PALETTE.timberDark),
  floor: texLambert(COBBLE_TEX, 6, 6, 0xd8c0ae),
  court: texLambert(COBBLE_TEX, 9, 7),
  grass: texLambert(SCRUB_TEX, 8, 8),
  banner: lambert(PALETTE.banner),
  flame: new THREE.MeshBasicMaterial({ color: PALETTE.flameHot }),
  flameCore: new THREE.MeshBasicMaterial({ color: 0xf7e2a0 }),
  emberGlow: new THREE.MeshBasicMaterial({
    color: PALETTE.ember,
    transparent: true,
    opacity: 0.35,
  }),
  tree: lambert(0x24211a),
  iron: lambert(0x4a453f),
} as const;

interface Flame {
  mesh: THREE.Mesh;
  base: number;
  phase: number;
}

export class HoldView {
  group = new THREE.Group();
  private flames: Flame[] = [];
  private banners: THREE.Mesh[] = [];
  private rubble = new Map<DistrictId, THREE.Group>();
  private doorSlabs = new Map<string, THREE.Mesh>();
  private barricades = new Map<StructureId, THREE.Group>();
  private barricadeHp = new Map<StructureId, number>();
  private shakeT = new Map<StructureId, number>();
  private fireCore: THREE.Mesh;

  constructor() {
    this.buildFloors();
    this.buildWalls();
    this.buildStairsAndRampart();
    this.fireCore = this.buildWatchfire();
    this.buildStations();
    this.buildDoorDressing();
    this.buildTreeline();
    this.buildTorches();
  }

  private box(
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    yUp: number,
    z: number,
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, yUp, z);
    this.group.add(m);
    return m;
  }

  private buildFloors() {
    const courts: RoomId[] = ["gateyard", "causeway"];
    const outsides: RoomId[] = ["treeline", "outsideW", "outsideE", "outsideS"];
    for (const room of Object.values(ROOMS)) {
      if (room.id === "stairW" || room.id === "stairE") continue;
      const w = room.x1 - room.x0;
      const d = room.y1 - room.y0;
      const cx = (room.x0 + room.x1) / 2;
      const cy = (room.y0 + room.y1) / 2;
      const mat = outsides.includes(room.id)
        ? MAT.grass
        : courts.includes(room.id)
          ? MAT.court
          : MAT.floor;
      const elev = (room.elevS + room.elevN) / 2;
      this.box(w, 0.4, d, mat, cx, elev - 0.2, -cy);
    }
    // One dark apron under everything so the void never shows through.
    this.box(140, 0.3, 140, MAT.tree, 0, -0.42, -5);
  }

  private doorsOnBorder(axis: "x" | "y", at: number, lo: number, hi: number): Door[] {
    return DOORS.filter(
      (d) => d.axis === axis && Math.abs(d.at - at) < 0.05 && d.lo >= lo - 0.1 && d.hi <= hi + 0.1,
    );
  }

  // Wall runs along a border, skipping door spans. Dedupe by key so the
  // shared edge between two rooms builds once.
  private seen = new Set<string>();

  private wallRun(axis: "x" | "y", at: number, lo: number, hi: number, h: number, elev = 0) {
    const key = `${axis}:${at.toFixed(1)}:${lo.toFixed(1)}:${hi.toFixed(1)}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const doors = this.doorsOnBorder(axis, at, lo, hi).sort((a, b) => a.lo - b.lo);
    let cursor = lo;
    const spans: [number, number][] = [];
    for (const d of doors) {
      if (d.lo > cursor) spans.push([cursor, d.lo]);
      cursor = Math.max(cursor, d.hi);
    }
    if (cursor < hi) spans.push([cursor, hi]);
    for (const [a, b] of spans) {
      if (b - a < 0.3) continue;
      const len = b - a;
      const mid = (a + b) / 2;
      const m = stoneMat(len, h);
      if (axis === "x") {
        this.box(len, h, WALL_T, m, mid, elev + h / 2, -at);
      } else {
        this.box(WALL_T, h, len, m, at, elev + h / 2, -mid);
      }
    }
    // Door lintels: the arch reads as an arch, not a missing wall.
    for (const d of doors) {
      const len = d.hi - d.lo;
      const mid = (d.lo + d.hi) / 2;
      if (axis === "x") {
        this.box(len + 0.4, 1.1, WALL_T, MAT.stoneShade, mid, elev + h - 0.55, -at);
      } else {
        this.box(WALL_T, 1.1, len + 0.4, MAT.stoneShade, at, elev + h - 0.55, -mid);
      }
    }
  }

  private buildWalls() {
    // Outer curtain of the hold.
    this.wallRun("x", 26, -21, -4, WALL_H); // north wall west of the causeway
    this.wallRun("x", 26, 4, 21, WALL_H);
    this.wallRun("x", 26, -4, 4, WALL_H); // the arch span itself
    this.wallRun("y", -4, 26, 46, 4); // causeway side walls
    this.wallRun("y", 4, 26, 46, 4);
    this.wallRun("y", -18, 0, 26, WALL_H); // west curtain (sap lives here)
    this.wallRun("y", 18, 0, 26, WALL_H); // east curtain (postern)
    this.wallRun("y", -18, -14, 0, WALL_H); // armory west (breach)
    this.wallRun("y", 18, -14, 0, WALL_H); // well court east
    this.wallRun("x", 0, -18, -4, PARTITION_H); // gateyard to armory
    this.wallRun("x", 0, 4, 18, PARTITION_H); // gateyard to well court
    this.wallRun("x", 0, -4, 4, PARTITION_H); // south face between wings
    this.wallRun("x", -14, -15, 15, PARTITION_H); // wings to hall
    this.wallRun("y", -15, -30, -14, WALL_H); // hall west
    this.wallRun("y", 15, -30, -14, WALL_H); // hall east
    this.wallRun("x", -30, -15, 15, WALL_H); // hall south (windows)
    this.wallRun("y", -4, -14, 0, PARTITION_H); // armory east partition
    this.wallRun("y", 4, -14, 0, PARTITION_H); // well court west partition
  }

  private buildStairsAndRampart() {
    for (const side of [-1, 1] as const) {
      const x = side * 19.5;
      // A ramp from the yard up to the wall walk.
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 7.3), MAT.stoneShade);
      ramp.position.set(x, 2, -21.2);
      ramp.rotation.x = -Math.atan2(4, 6.5);
      this.group.add(ramp);
      this.box(3, 0.4, 2.5, MAT.stoneShade, x, 3.8, -25.7);
    }
    // The wall walk itself plus its parapet teeth.
    this.box(42, 0.5, 2.5, MAT.stone, 0, 3.9, -25.7);
    for (let x = -20; x <= 20; x += 2.6) {
      this.box(1.3, 1.1, 0.4, MAT.stoneShade, x, 4.7, -26.9);
    }
  }

  private buildWatchfire(): THREE.Mesh {
    const { x, y } = WATCHFIRE_POS;
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.0, 0.9, 10, 1, true),
      MAT.stoneShade,
    );
    ring.position.set(x, 0.45, -y);
    this.group.add(ring);
    this.box(2.4, 0.3, 2.4, MAT.timberDark, x, 0.6, -y);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 7), MAT.flame);
    fire.position.set(x, 2.0, -y);
    this.group.add(fire);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 6), MAT.flameCore);
    core.position.set(x, 1.7, -y);
    this.group.add(core);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), MAT.emberGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.06, -y);
    this.group.add(glow);
    this.flames.push({ mesh: fire, base: 1, phase: 0 });
    return fire;
  }

  private buildStations() {
    for (const s of STATIONS) {
      const z = -s.y;
      switch (s.id) {
        case "ledger":
          this.box(1.8, 0.8, 0.9, MAT.timber, s.x, 0.4, z);
          this.box(0.5, 0.1, 0.7, MAT.banner, s.x, 0.85, z);
          break;
        case "racks":
          this.box(2.6, 2.0, 0.3, MAT.timberDark, s.x, 1.0, z);
          this.box(0.15, 1.6, 0.15, MAT.iron, s.x - 0.8, 1.0, z + 0.1);
          this.box(0.15, 1.7, 0.15, MAT.iron, s.x, 1.05, z + 0.1);
          this.box(0.15, 1.5, 0.15, MAT.iron, s.x + 0.8, 0.95, z + 0.1);
          break;
        case "whetstone": {
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 0.2, 10),
            MAT.stoneShade,
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(s.x, 0.7, z);
          this.group.add(wheel);
          this.box(0.9, 0.5, 0.6, MAT.timber, s.x, 0.25, z);
          break;
        }
        case "well":
          {
            const rim = new THREE.Mesh(
              new THREE.CylinderGeometry(1.1, 1.2, 0.8, 9, 1, true),
              MAT.stone,
            );
            rim.position.set(s.x, 0.4, z);
            this.group.add(rim);
            this.box(0.12, 1.6, 0.12, MAT.timberDark, s.x - 0.9, 0.8, z);
            this.box(0.12, 1.6, 0.12, MAT.timberDark, s.x + 0.9, 0.8, z);
            this.box(2.0, 0.15, 0.5, MAT.timberDark, s.x, 1.65, z);
          }
          break;
        case "herb-bed":
          this.box(2.4, 0.25, 1.4, MAT.timberDark, s.x, 0.12, z);
          this.box(2.0, 0.3, 1.0, MAT.grass, s.x, 0.35, z);
          break;
        case "hearth": {
          this.box(3.2, 2.6, 0.8, MAT.stoneShade, s.x, 1.3, z - 0.6);
          const hf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 6), MAT.flame);
          hf.position.set(s.x, 0.9, z - 0.4);
          this.group.add(hf);
          this.flames.push({ mesh: hf, base: 0.8, phase: 2.1 });
          break;
        }
        case "armor-stand":
          this.box(0.15, 1.8, 0.15, MAT.timberDark, s.x, 0.9, z);
          this.box(1.1, 0.15, 0.15, MAT.timberDark, s.x, 1.45, z);
          this.box(0.7, 0.9, 0.4, MAT.iron, s.x, 1.0, z);
          break;
        case "cache":
          this.box(1.2, 0.7, 0.8, MAT.timber, s.x, 0.35, z);
          this.box(1.25, 0.18, 0.85, MAT.timberDark, s.x, 0.75, z);
          break;
      }
    }
  }

  private buildDoorDressing() {
    // Rubble piles seal the district doors until they are bought open.
    const rubbleAt: [DistrictId, Door][] = [];
    for (const d of DOORS) {
      if (d.openedByDistrict) {
        rubbleAt.push([d.openedByDistrict, d]);
      }
      if (d.barricade) {
        this.barricades.set(d.barricade, this.buildBarricade(d));
      }
      if (!d.startOpen && d.openAtWave != null) {
        // The sap and postern read as sealed wall until their wave.
        const mid = d.axis === "x" ? { x: (d.lo + d.hi) / 2, y: d.at } : { x: d.at, y: (d.lo + d.hi) / 2 };
        const len = d.hi - d.lo;
        const slab =
          d.axis === "x"
            ? this.box(len, 3.6, WALL_T, MAT.stone, mid.x, 1.8, -mid.y)
            : this.box(WALL_T, 3.6, len, MAT.stone, mid.x, 1.8, -mid.y);
        this.doorSlabs.set(d.id, slab);
      }
    }
    for (const [district, d] of rubbleAt) {
      if (this.rubble.has(district)) continue;
      const g = new THREE.Group();
      const mid = d.axis === "x" ? { x: (d.lo + d.hi) / 2, y: d.at } : { x: d.at, y: (d.lo + d.hi) / 2 };
      for (let i = 0; i < 7; i++) {
        const s = 0.5 + ((i * 37) % 10) / 14;
        const rock = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), MAT.stoneShade);
        rock.position.set(
          mid.x + Math.sin(i * 2.1) * 1.1,
          s * 0.35,
          -mid.y + Math.cos(i * 1.7) * 0.8,
        );
        rock.rotation.y = i * 0.9;
        g.add(rock);
      }
      this.group.add(g);
      this.rubble.set(district, g);
    }
    // Banners flank the arch on the courtyard side.
    for (const side of [-1, 1] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 0.08), MAT.banner);
      b.position.set(side * 3.4, 3.2, -25.4);
      this.group.add(b);
      this.banners.push(b);
    }
  }

  private buildBarricade(d: Door): THREE.Group {
    const g = new THREE.Group();
    const mid = d.axis === "x" ? { x: (d.lo + d.hi) / 2, y: d.at } : { x: d.at, y: (d.lo + d.hi) / 2 };
    const len = d.hi - d.lo;
    for (let i = 0; i < 5; i++) {
      const plank =
        d.axis === "x"
          ? new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 0.18), MAT.timber)
          : new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, len), MAT.timber);
      plank.position.set(mid.x, 0.45 + i * 0.5, -mid.y);
      plank.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.05;
      g.add(plank);
    }
    this.group.add(g);
    return g;
  }

  private buildTreeline() {
    const trunkGeo = new THREE.ConeGeometry(1.6, 6, 6);
    const trees = new THREE.InstancedMesh(trunkGeo, MAT.tree, 70);
    const m = new THREE.Matrix4();
    let i = 0;
    const put = (x: number, y: number, s: number) => {
      m.makeScale(s, s, s);
      m.setPosition(x, 3 * s, -y);
      trees.setMatrixAt(i++, m);
    };
    for (let k = 0; k < 26; k++) put(-34 + k * 2.8, 52 + ((k * 53) % 7), 0.8 + ((k * 31) % 10) / 12);
    for (let k = 0; k < 16; k++) put(-38 - ((k * 17) % 6), 20 - k * 3.4, 0.9 + ((k * 23) % 8) / 12);
    for (let k = 0; k < 14; k++) put(38 + ((k * 19) % 6), 14 - k * 3.1, 0.9 + ((k * 29) % 8) / 12);
    for (let k = 0; k < 14; k++) put(-24 + k * 3.6, -46 - ((k * 13) % 5), 0.8 + ((k * 37) % 9) / 12);
    trees.count = i;
    trees.instanceMatrix.needsUpdate = true;
    this.group.add(trees);
  }

  private buildTorches() {
    const spots: [number, number, number][] = [
      [-10, 25.4, 4.2],
      [10, 25.4, 4.2],
      [-17.5, 14, 3.2],
      [17.5, 10, 3.2],
      [-11, 0.6, 2.8],
      [11, 0.6, 2.8],
      [-14.5, -14.4, 2.6],
      [14.5, -14.4, 2.6],
      [0, -29.4, 2.6],
    ];
    for (const [x, y, h] of spots) {
      this.box(0.14, 0.7, 0.14, MAT.timberDark, x, h - 0.4, -y);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 5), MAT.flame);
      f.position.set(x, h + 0.15, -y);
      this.group.add(f);
      this.flames.push({ mesh: f, base: 0.9, phase: x * 0.7 + y * 0.3 });
    }
  }

  update(eng: Engine, time: number) {
    // Rubble clears when a district opens; sealed slabs drop with their
    // scheduled walls.
    for (const [district, g] of this.rubble) {
      g.visible = !eng.districts[district];
    }
    for (const [id, slab] of this.doorSlabs) {
      slab.visible = !eng.doorOpen[id as Door["id"]];
    }
    for (const [sid, g] of this.barricades) {
      const s = eng.structures[sid];
      const prev = this.barricadeHp.get(sid) ?? s.hp;
      if (s.hp < prev - 0.5) this.shakeT.set(sid, 0.18);
      this.barricadeHp.set(sid, s.hp);
      const shake = this.shakeT.get(sid) ?? 0;
      if (shake > 0) this.shakeT.set(sid, shake - 1 / 60);
      const planks = Math.ceil((s.hp / Math.max(1, BARRICADE_HP[Math.max(1, s.tier)])) * 5);
      g.children.forEach((plank, i) => {
        plank.visible = s.tier > 0 && s.hp > 0 && i < planks;
        const jolt = shake > 0 ? Math.sin(time * 70 + i * 2.6) * 0.05 * (shake / 0.18) : 0;
        plank.position.y = 0.45 + i * 0.5 + jolt;
        plank.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.05 + jolt * 0.6;
      });
    }
    // Slow flame breathing and banner sway: warmth in motion, never a
    // strobe.
    for (const f of this.flames) {
      const s = f.base * (0.92 + 0.08 * Math.sin(time * 1.9 + f.phase));
      f.mesh.scale.set(s, f.base * (0.9 + 0.1 * Math.sin(time * 1.3 + f.phase + 1)), s);
    }
    for (let i = 0; i < this.banners.length; i++) {
      this.banners[i].rotation.y = 0.06 * Math.sin(time * 0.7 + i * 2);
    }
    const fireHp = eng.structures.watchfire.hp / eng.structures.watchfire.maxHp;
    this.fireCore.visible = fireHp > 0.02;
  }
}
