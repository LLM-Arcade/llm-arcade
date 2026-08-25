// Runtime tileable surface textures for the level geometry: stone block
// courses, timber planks, cobbles, and scrub. Material treatment of the
// hold's surfaces, generated once at boot. A soft radial glow texture
// feeds every additive spell sprite.

import * as THREE from "three";

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function jitter(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stoneTexture(): THREE.Texture {
  return canvasTex(128, (g) => {
    const r = jitter(7);
    g.fillStyle = "#8a5c42";
    g.fillRect(0, 0, 128, 128);
    const rows = 4;
    const h = 128 / rows;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 === 0 ? 0 : 32;
      for (let col = -1; col < 3; col++) {
        const x = col * 64 + off;
        const v = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${Math.round(138 * v)}, ${Math.round(92 * v)}, ${Math.round(66 * v)})`;
        g.fillRect(x + 2, row * h + 2, 60, h - 4);
        // a little weathering per block
        for (let s = 0; s < 6; s++) {
          g.fillStyle = `rgba(60, 40, 28, ${0.12 + r() * 0.1})`;
          g.fillRect(x + 4 + r() * 52, row * h + 4 + r() * (h - 8), 3 + r() * 5, 2 + r() * 3);
        }
      }
    }
    g.fillStyle = "rgba(46, 30, 22, 0.9)";
    for (let row = 0; row <= rows; row++) g.fillRect(0, row * h - 1, 128, 2);
  });
}

export function plankTexture(): THREE.Texture {
  return canvasTex(128, (g) => {
    const r = jitter(31);
    for (let p = 0; p < 4; p++) {
      const v = 0.8 + r() * 0.4;
      g.fillStyle = `rgb(${Math.round(107 * v)}, ${Math.round(74 * v)}, ${Math.round(51 * v)})`;
      g.fillRect(p * 32, 0, 32, 128);
      g.strokeStyle = "rgba(40, 26, 18, 0.8)";
      g.lineWidth = 2;
      g.strokeRect(p * 32 + 1, -2, 30, 132);
      // grain streaks
      g.strokeStyle = `rgba(58, 38, 24, ${0.25 + r() * 0.2})`;
      g.lineWidth = 1;
      for (let s = 0; s < 5; s++) {
        const x = p * 32 + 4 + r() * 24;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + r() * 6 - 3, 40, x + r() * 6 - 3, 88, x, 128);
        g.stroke();
      }
      // a knot or two
      if (r() > 0.5) {
        g.fillStyle = "rgba(48, 30, 20, 0.7)";
        g.beginPath();
        g.ellipse(p * 32 + 8 + r() * 16, r() * 128, 3, 4.5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export function cobbleTexture(): THREE.Texture {
  return canvasTex(128, (g) => {
    const r = jitter(101);
    g.fillStyle = "#6e4c38";
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const v = 0.82 + r() * 0.36;
        g.fillStyle = `rgb(${Math.round(134 * v)}, ${Math.round(96 * v)}, ${Math.round(74 * v)})`;
        const px = x * 16 + (y % 2 === 0 ? 0 : 8);
        g.beginPath();
        g.ellipse(px + 8, y * 16 + 8, 7 + r() * 2, 6 + r() * 2, r() * 0.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export function scrubTexture(): THREE.Texture {
  return canvasTex(128, (g) => {
    const r = jitter(211);
    g.fillStyle = "#3f3b28";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 380; i++) {
      const v = r();
      g.fillStyle = v > 0.7 ? "rgba(95, 88, 52, 0.5)" : "rgba(38, 33, 22, 0.55)";
      g.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 2);
    }
  });
}

// The soft disc every glow sprite shares; tint comes from the material.
export function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
