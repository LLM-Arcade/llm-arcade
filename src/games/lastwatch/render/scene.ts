// Scene setup for the Lastwatch realm: renderer, camera boom, warm night
// lighting, the apocalyptic sky, fog, and the live frame sampler with its
// auto-degrade ladder. Fire is the most reliable light in the hold; the
// moon is dim warm ivory, never movie-blue. All flicker is slow amplitude
// wander: no strobing anywhere (medical constraint, non-negotiable).

import * as THREE from "three";

export const PALETTE = {
  night: 0x171310, // warm ink, never navy
  fogNight: 0x1c1613,
  moon: 0xe8dcc0,
  stone: 0x9c6b4f,
  stoneShade: 0x5e3d2e,
  timber: 0x6b4a33,
  timberDark: 0x4a3222,
  banner: 0x6f6b3f,
  flame: 0xd9a441,
  flameHot: 0xf0c060,
  ember: 0xc4633f,
  gloamHide: 0x2e2620,
  gloamEye: 0xd9a441,
  floor: 0x7a5540,
  floorCourt: 0x86604a,
  grass: 0x4f4a30,
  heal: 0xcfd9a0,
} as const;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // pin to the far plane
}
`;

// The end-of-the-universe sky: warm ink ground haze rising into black,
// a huge low moon, hard white stars that ripple as if seen through deep
// water, and slow aurora bands in ember and olive. Everything drifts on
// long periods; nothing flashes.
const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.1, 1.0);

  // Ground haze warms the horizon like a world still smoldering.
  vec3 ink = vec3(0.055, 0.045, 0.038);
  vec3 horizon = vec3(0.16, 0.09, 0.05);
  vec3 col = mix(horizon, ink, smoothstep(0.0, 0.45, h));

  // Dreamlike refraction: the star field samples through a slow ripple.
  vec2 sky = d.xz / (0.35 + d.y);
  vec2 ripple = vec2(
    noise(sky * 1.3 + uTime * 0.013),
    noise(sky * 1.3 - uTime * 0.011 + 7.0)
  ) - 0.5;
  vec2 warped = sky * 24.0 + ripple * 2.6;
  float star = step(0.994, hash(floor(warped)));
  float twinkle = 0.55 + 0.45 * noise(warped * 0.5 + uTime * 0.05);
  col += star * twinkle * vec3(0.9, 0.85, 0.7) * smoothstep(0.02, 0.25, h);

  // Aurora of the wrong color for an aurora: ember and olive banners.
  float band1 = noise(vec2(sky.x * 1.1 + uTime * 0.008, d.y * 3.0));
  float band2 = noise(vec2(sky.x * 0.7 - uTime * 0.006 + 40.0, d.y * 2.2));
  float veil = smoothstep(0.55, 0.95, band1) * smoothstep(0.1, 0.5, h);
  float veil2 = smoothstep(0.6, 0.95, band2) * smoothstep(0.15, 0.6, h);
  col += veil * vec3(0.20, 0.09, 0.03) * 0.8;
  col += veil2 * vec3(0.10, 0.10, 0.04) * 0.7;

  // The moon: big, low, beautiful, and wrong, its edge smeared by the
  // same ripple that bends the stars.
  vec3 moonDir = normalize(vec3(0.5, 0.38, -0.75));
  float md = distance(d, moonDir) + ripple.x * 0.012;
  float disc = smoothstep(0.085, 0.075, md);
  float glow = smoothstep(0.5, 0.08, md);
  float crater = noise(d.xz * 40.0 + 3.0) * 0.25;
  col += disc * (vec3(0.85, 0.78, 0.62) - crater);
  col += glow * vec3(0.22, 0.16, 0.09) * 0.55;

  gl_FragColor = vec4(col, 1.0);
}
`;

export interface FrameStats {
  avg: number;
  p95: number;
  max: number;
  samples: number;
}

export class SceneRoot {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  moon: THREE.DirectionalLight;
  fireLight: THREE.PointLight;
  torchLight: THREE.PointLight;
  skyMat: THREE.ShaderMaterial;
  renderScale = 1;
  private frameTimes: number[] = [];
  private degradeT = 0;
  private flickerPhase = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(PALETTE.night);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PALETTE.fogNight, 0.028);
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 220);

    // The moon carries just enough to read silhouettes; fire does the rest.
    this.moon = new THREE.DirectionalLight(PALETTE.moon, 0.34);
    this.moon.position.set(30, 42, -45);
    this.scene.add(this.moon);
    this.scene.add(new THREE.AmbientLight(0x241c14, 0.85));

    this.fireLight = new THREE.PointLight(PALETTE.flame, 260, 46, 1.9);
    this.fireLight.position.set(0, 3.2, -6);
    this.scene.add(this.fireLight);
    this.torchLight = new THREE.PointLight(PALETTE.flame, 120, 30, 1.9);
    this.torchLight.position.set(0, 4.5, -26);
    this.scene.add(this.torchLight);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uTime: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), this.skyMat);
    dome.frustumCulled = false;
    this.scene.add(dome);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(
      Math.round(w * this.renderScale),
      Math.round(h * this.renderScale),
      false,
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Sim coordinates are x east, y north on the ground plane; the scene
  // maps that to x east, z SOUTH (three.js -z is "into the screen" north).
  static toWorld(x: number, y: number, elev: number): THREE.Vector3 {
    return new THREE.Vector3(x, elev, -y);
  }

  // Slow warm wander for every flame in the hold. One phase drives them
  // all so the code cannot strobe by accident.
  updateFire(dt: number, fireX: number, fireY: number, fireHp: number) {
    this.flickerPhase += dt;
    const p = this.flickerPhase;
    const wander =
      0.86 + 0.09 * Math.sin(p * 1.7) + 0.05 * Math.sin(p * 0.83 + 1.7);
    const health = 0.35 + 0.65 * fireHp;
    this.fireLight.intensity = 260 * wander * health;
    this.fireLight.position.set(fireX, 3.2, -fireY);
    this.torchLight.intensity = 120 * (0.9 + 0.1 * Math.sin(p * 1.13 + 0.6));
    this.skyMat.uniforms.uTime.value = p;
  }

  render(dt: number): number {
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const ms = performance.now() - t0;
    this.frameTimes.push(ms);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    this.autoDegrade(dt, ms);
    return ms;
  }

  stats(): FrameStats {
    const s = [...this.frameTimes].sort((a, b) => a - b);
    const n = s.length || 1;
    return {
      avg: s.reduce((a, b) => a + b, 0) / n,
      p95: s[Math.floor(n * 0.95)] ?? 0,
      max: s[n - 1] ?? 0,
      samples: n,
    };
  }

  // The ladder from the GDD: render scale first, then fog distance. Sim
  // correctness is never on the ladder.
  private autoDegrade(dt: number, ms: number) {
    if (ms > 14) this.degradeT += dt;
    else this.degradeT = Math.max(0, this.degradeT - dt * 0.5);
    if (this.degradeT > 3) {
      this.degradeT = 0;
      if (this.renderScale > 0.85) this.renderScale = 0.85;
      else if (this.renderScale > 0.75) this.renderScale = 0.75;
      else {
        const fog = this.scene.fog as THREE.FogExp2;
        fog.density = Math.min(0.04, fog.density + 0.004);
      }
      const c = this.renderer.domElement;
      this.resize(c.clientWidth || 800, c.clientHeight || 450);
    }
  }
}
