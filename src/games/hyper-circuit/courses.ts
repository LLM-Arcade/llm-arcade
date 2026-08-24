// Hyper Circuit course geometry. Framework free and node importable so the
// harness can drive it under node type stripping.

export const WORLD = 1536;

export interface CourseDef {
  slug: string;
  name: string;
  points: [number, number][];
  halfWidth: number;
  parLap: number;
  rivalSpeed: number;
  boostPads: number[];
  pitLane: [number, number];
}

export interface Track {
  def: CourseDef;
  pts: Float32Array;
  n: number;
  total: number;
  step: number;
  curv: Float32Array;
}

const SUB = 48; // Catmull-Rom samples per control segment before arc resampling
const TARGET_STEP = 4; // units between uniform arc samples
// A 12-sample arm puts the curvature triangle on a 96 unit chord. Anything
// shorter measures Catmull-Rom's C1 curvature ripple instead of corner radius.
const CURV_SPAN = 12;
const CURV_SMOOTH = 3; // box filter radius over the curvature array
const ALPHA = 0.5; // centripetal knots, so unevenly spaced control points never cusp

const knot = (a: [number, number], b: [number, number], t: number): number =>
  t + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), ALPHA);

// Barry-Goldman pyramid for one Catmull-Rom span, evaluated on centripetal knots.
const span = (
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  u: number,
): [number, number] => {
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const t = t1 + (t2 - t1) * u;

  const mix = (
    a: [number, number],
    b: [number, number],
    ta: number,
    tb: number,
  ): [number, number] => {
    const d = tb - ta || 1;
    const w = (t - ta) / d;
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };

  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
};

export const buildTrack = (def: CourseDef): Track => {
  const cp = def.points;
  const m = cp.length;

  const dense: number[] = [];
  for (let i = 0; i < m; i++) {
    const p0 = cp[(i - 1 + m) % m];
    const p1 = cp[i];
    const p2 = cp[(i + 1) % m];
    const p3 = cp[(i + 2) % m];
    for (let k = 0; k < SUB; k++) {
      const p = span(p0, p1, p2, p3, k / SUB);
      dense.push(p[0], p[1]);
    }
  }

  const dn = dense.length / 2;
  const cum = new Float64Array(dn + 1);
  for (let i = 0; i < dn; i++) {
    const j = (i + 1) % dn;
    cum[i + 1] =
      cum[i] + Math.hypot(dense[2 * j] - dense[2 * i], dense[2 * j + 1] - dense[2 * i + 1]);
  }
  const total = cum[dn];

  const n = Math.max(32, Math.round(total / TARGET_STEP));
  const step = total / n;
  const pts = new Float32Array(2 * n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = i * step;
    while (seg < dn - 1 && cum[seg + 1] < target) seg++;
    const len = cum[seg + 1] - cum[seg] || 1;
    const u = (target - cum[seg]) / len;
    const a = seg;
    const b = (seg + 1) % dn;
    pts[2 * i] = dense[2 * a] + (dense[2 * b] - dense[2 * a]) * u;
    pts[2 * i + 1] = dense[2 * a + 1] + (dense[2 * b + 1] - dense[2 * a + 1]) * u;
  }

  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ia = (i - CURV_SPAN + n) % n;
    const ic = (i + CURV_SPAN) % n;
    const ax = pts[2 * ia];
    const ay = pts[2 * ia + 1];
    const bx = pts[2 * i];
    const by = pts[2 * i + 1];
    const cx = pts[2 * ic];
    const cy = pts[2 * ic + 1];
    const abx = bx - ax;
    const aby = by - ay;
    const bcx = cx - bx;
    const bcy = cy - by;
    const cross = abx * bcy - aby * bcx;
    const denom = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(cx - ax, cy - ay);
    raw[i] = denom > 1e-6 ? Math.abs(2 * cross) / denom : 0;
  }

  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -CURV_SMOOTH; k <= CURV_SMOOTH; k++) sum += raw[(i + k + n) % n];
    curv[i] = sum / (CURV_SMOOTH * 2 + 1);
  }

  return { def, pts, n, total, step, curv };
};

const tangentAt = (t: Track, i: number): [number, number] => {
  const n = t.n;
  const p = (i - 1 + n) % n;
  const q = (i + 1) % n;
  const dx = t.pts[2 * q] - t.pts[2 * p];
  const dy = t.pts[2 * q + 1] - t.pts[2 * p + 1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
};

export const trackPos = (
  t: Track,
  s: number,
): { x: number; y: number; dirX: number; dirY: number } => {
  const n = t.n;
  const f = s / t.step;
  const fl = Math.floor(f);
  const u = f - fl;
  const i = ((fl % n) + n) % n;
  const j = (i + 1) % n;

  const ax = t.pts[2 * i];
  const ay = t.pts[2 * i + 1];
  const bx = t.pts[2 * j];
  const by = t.pts[2 * j + 1];

  const ta = tangentAt(t, i);
  const tb = tangentAt(t, j);
  let dx = ta[0] + (tb[0] - ta[0]) * u;
  let dy = ta[1] + (tb[1] - ta[1]) * u;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = ta[0];
    dy = ta[1];
  } else {
    dx /= len;
    dy /= len;
  }

  return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, dirX: dx, dirY: dy };
};

export const curvatureAt = (t: Track, s: number): number => {
  const n = t.n;
  const f = s / t.step;
  const fl = Math.floor(f);
  const u = f - fl;
  const i = ((fl % n) + n) % n;
  const j = (i + 1) % n;
  return t.curv[i] + (t.curv[j] - t.curv[i]) * u;
};

export const COURSES: CourseDef[] = [
  {
    slug: "alkali-flats",
    name: "Alkali Flats",
    points: [
      [430, 270],
      [830, 230],
      [1180, 300],
      [1310, 620],
      [1240, 980],
      [980, 1260],
      [560, 1290],
      [300, 1080],
      [240, 700],
      [300, 420],
    ],
    halfWidth: 62,
    parLap: 11.5,
    rivalSpeed: 252,
    boostPads: [0.12, 0.55],
    pitLane: [0.86, 0.97],
  },
  {
    slug: "terrace-canyon",
    name: "Terrace Canyon",
    // long top straight, right sweeper, a 145-radius hairpin, an esse onto
    // the bottom-right sweeper, long bottom straight, left-side climb
    points: [
      [560, 240], [800, 225], [1010, 250], [1250, 390], [1345, 640],
      [1330, 900], [1130, 985], [900, 950], [790, 935], [655, 940],
      [570, 968], [517, 1040], [517, 1130], [570, 1202], [655, 1230],
      [790, 1248], [930, 1235], [1060, 1160], [1200, 1120], [1305, 1122],
      [1389, 1185], [1420, 1285], [1385, 1385], [1299, 1445], [1120, 1455],
      [870, 1455], [620, 1420], [410, 1315], [285, 1150], [235, 900],
      [290, 425], [341, 301], [465, 250],
    ],
    halfWidth: 58,
    parLap: 23,
    rivalSpeed: 262,
    boostPads: [0.05, 0.48, 0.8],
    pitLane: [0.9, 0.99],
  },
  {
    slug: "basalt-rim",
    name: "Basalt Rim",
    // right-hand chicane kink up top, wandering narrow bottom section
    points: [
      [284, 326], [469, 253], [719, 230], [968, 266], [1174, 330],
      [1231, 359], [1273, 406], [1327, 627], [1330, 691], [1304, 749],
      [1245, 813], [1213, 868], [1188, 1070], [1173, 1132], [1132, 1180],
      [892, 1256], [654, 1285], [556, 1301], [492, 1296], [336, 1194],
      [293, 1147], [262, 898], [252, 647], [234, 480], [236, 416],
      [258, 356],
    ],
    halfWidth: 46,
    parLap: 16.5,
    rivalSpeed: 268,
    boostPads: [0.3, 0.68],
    pitLane: [0.88, 0.97],
  },
];
