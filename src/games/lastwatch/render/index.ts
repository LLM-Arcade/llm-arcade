// RenderRoot: owns the scene graph and drives every view from engine
// state. The shell calls frame() once per rAF; the sim never sees any of
// this.

import * as THREE from "three";
import type { Character, Engine } from "../engine.ts";
import { ROOMS, WATCHFIRE_POS, elevAt } from "../hold.ts";
import { CLASSES } from "../kits.ts";
import { WEAPONS } from "../arsenal.ts";
import { SceneRoot, type FrameStats } from "./scene.ts";
import { HoldView } from "./hold-geo.ts";
import { HeroView, HordeView } from "./actors.ts";
import { FxView } from "./fx.ts";

const BOOM = 3.4; // m behind the shoulder
const BOOM_UP = 1.15; // m above the eye
const SHOULDER = 0.55; // m to the right

export class RenderRoot {
  sceneRoot: SceneRoot;
  private hold: HoldView;
  private horde: HordeView;
  private fx: FxView;
  private heroes: [HeroView, HeroView];
  private time = 0;
  private ads = 0; // 0 shoulder cam, 1 drawn-bow first person
  private shadowPlayer: THREE.Mesh;
  private shadowPartner: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement, eng: Engine) {
    this.sceneRoot = new SceneRoot(canvas);
    this.hold = new HoldView();
    this.horde = new HordeView();
    this.fx = new FxView();
    this.heroes = [
      new HeroView(eng.cfg.playerClass),
      new HeroView(eng.cfg.partnerClass),
    ];
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.shadowPlayer = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), shadowMat);
    this.shadowPlayer.rotation.x = -Math.PI / 2;
    this.shadowPartner = this.shadowPlayer.clone();
    const s = this.sceneRoot.scene;
    s.add(this.hold.group);
    s.add(this.horde.group);
    s.add(this.fx.group);
    s.add(this.heroes[0].root);
    s.add(this.heroes[1].root);
    s.add(this.shadowPlayer);
    s.add(this.shadowPartner);
  }

  resize(w: number, h: number) {
    this.sceneRoot.resize(w, h);
  }

  // Third-person boom behind the player; a drawn bow pulls the camera to
  // the eye so the nocked arrow itself is the sight. Attract orbits.
  private aimCamera(eng: Engine, attract: boolean, dt: number) {
    const cam = this.sceneRoot.camera;
    if (attract) {
      const a = this.time * 0.12;
      cam.position.set(Math.cos(a) * 34, 14, -12 + Math.sin(a) * 30);
      cam.lookAt(0, 2, -10);
      return;
    }
    const c = eng.chars[0];
    const drawing = c.charging && WEAPONS[c.weapon.id].kind === "bow";
    this.ads += ((drawing ? 1 : 0) - this.ads) * Math.min(1, dt * 7);
    const boom = BOOM - 2.9 * this.ads;
    const shoulder = SHOULDER - 0.32 * this.ads;
    const up = BOOM_UP - 0.95 * this.ads;
    const fov = 68 - 11 * this.ads;
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const elev = elevAt(ROOMS[c.room], c.y);
    const eye = elev + CLASSES[c.cls].eyeHeight;
    const fx = Math.cos(c.yaw);
    const fy = Math.sin(c.yaw);
    const rx = Math.cos(c.yaw - Math.PI / 2);
    const ry = Math.sin(c.yaw - Math.PI / 2);
    const px = c.x - fx * boom + rx * shoulder;
    const py = c.y - fy * boom + ry * shoulder;
    const ph = eye + up - Math.sin(c.pitch) * 2.2 * (1 - this.ads);
    cam.position.set(px, Math.max(elev + 0.5, ph), -py);
    const lookAhead = 7;
    cam.lookAt(
      c.x + fx * lookAhead,
      eye + Math.tan(c.pitch) * lookAhead,
      -(c.y + fy * lookAhead),
    );
  }

  frame(eng: Engine, dt: number, attract: boolean): number {
    this.time += dt;
    this.hold.update(eng, this.time);
    this.horde.update(eng, this.time);
    this.fx.update(eng, this.time);
    this.heroes[0].update(eng.chars[0], this.time, dt, eng.time);
    this.heroes[1].update(eng.chars[1], this.time, dt, eng.time);
    this.placeShadow(this.shadowPlayer, eng.chars[0]);
    this.placeShadow(this.shadowPartner, eng.chars[1]);
    const fireHp = eng.structures.watchfire.hp / eng.structures.watchfire.maxHp;
    this.sceneRoot.updateFire(dt, WATCHFIRE_POS.x, WATCHFIRE_POS.y, fireHp);
    this.aimCamera(eng, attract, dt);
    return this.sceneRoot.render(dt);
  }

  private placeShadow(mesh: THREE.Mesh, c: Character) {
    mesh.visible = c.state !== "gone";
    const elev = elevAt(ROOMS[c.room], c.y);
    mesh.position.set(c.x, elev + 0.02, -c.y);
  }

  stats(): FrameStats {
    return this.sceneRoot.stats();
  }

  dispose() {
    this.sceneRoot.renderer.dispose();
  }
}
