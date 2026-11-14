// FAKE walking-scale site for UI development: a 4 × 8 km DTM-like terrain with
// two mesas, ice-rich debris aprons, craters, and patches where the slope
// estimate is uncertain ("blindspots"). Nothing here is a measurement.
// The real data comes from the Python pipeline (HiRISE DTM + uncertainty).
import type { BBox, LonLat } from "../api/schema";
import { KM_PER_DEG } from "../lib/geo";
import { encodePng } from "./png";

const DEG = Math.PI / 180;

export const SITE = {
  id: "arcadia-dtm-mock",
  name: "Arcadia Planitia",
  subtitle: "Exploration zone (mock DTM)",
  center: [-165.2, 42.1] as LonLat,
  widthM: 4000,
  heightM: 8000
};

/** Grid used for zones, routing and conditions. */
export const CELL_M = 20;
export const GW = SITE.widthM / CELL_M; // 200
export const GH = SITE.heightM / CELL_M; // 400

const M_PER_DEG_LAT = KM_PER_DEG * 1000;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos(SITE.center[1] * DEG);

export const BOUNDS: BBox = [
  SITE.center[0] - SITE.widthM / 2 / M_PER_DEG_LON,
  SITE.center[1] - SITE.heightM / 2 / M_PER_DEG_LAT,
  SITE.center[0] + SITE.widthM / 2 / M_PER_DEG_LON,
  SITE.center[1] + SITE.heightM / 2 / M_PER_DEG_LAT
];

/** Local meters (x east, y north, origin at the SW corner) <-> lon/lat. */
export const toLonLat = (x: number, y: number): LonLat => [BOUNDS[0] + x / M_PER_DEG_LON, BOUNDS[1] + y / M_PER_DEG_LAT];
export const toXY = ([lon, lat]: LonLat): [number, number] => [(lon - BOUNDS[0]) * M_PER_DEG_LON, (lat - BOUNDS[1]) * M_PER_DEG_LAT];

// ---- Terrain functions (meters) ---------------------------------------------

interface Mesa {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  rot: number;
  r: number;
  h: number;
}
const MESAS: Mesa[] = [
  { cx: 2650, cy: 5750, hw: 650, hh: 1250, rot: -0.62, r: 320, h: 640 },
  { cx: 3950, cy: 1500, hw: 760, hh: 900, rot: -0.35, r: 300, h: 470 }
];

/** Signed distance (m) to a rotated rounded rectangle; negative inside. */
function sdMesa(x: number, y: number, m: Mesa): number {
  const c = Math.cos(m.rot);
  const s = Math.sin(m.rot);
  const dx = x - m.cx;
  const dy = y - m.cy;
  const px = c * dx + s * dy;
  const py = -s * dx + c * dy;
  const qx = Math.abs(px) - m.hw + m.r;
  const qy = Math.abs(py) - m.hh + m.r;
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - m.r;
  // Lobate, irregular outline instead of a perfect rounded rectangle.
  return d + 110 * Math.sin(x / 380 + y / 290) + 60 * Math.sin(x / 170 - y / 230) + 30 * Math.cos(x / 97 + y / 83);
}

export function mesaDistance(x: number, y: number): number {
  return Math.min(...MESAS.map((m) => sdMesa(x, y, m)));
}

const CRATERS = [
  { x: 1500, y: 2500, r: 130 },
  { x: 2250, y: 3050, r: 85 },
  { x: 900, y: 6900, r: 160 },
  { x: 3300, y: 3300, r: 70 },
  { x: 600, y: 1200, r: 110 }
];

function noise(x: number, y: number): number {
  return (
    14 * Math.sin(x / 310 + 1.3) * Math.cos(y / 270 - 0.4) +
    5 * Math.sin((x + y) / 140 + 2) +
    1.6 * Math.sin(x / 61 + 1.7 * Math.sin(y / 133)) * Math.cos(y / 47 + 1.3 * Math.sin(x / 151)) +
    0.5 * Math.cos(x / 23 + y / 31)
  );
}

export function elevation(x: number, y: number): number {
  let z = -3950 + 0.025 * (SITE.heightM - y) + 40 * Math.sin(x / 1500);
  for (const m of MESAS) {
    const d = sdMesa(x, y, m);
    z += m.h / (1 + Math.exp(d / 210)); // steep scarp
    if (d > 0) z += 70 * Math.exp(-d / 420); // debris apron skirt
  }
  // Ridge and trough along the west edge.
  const x0 = 380 + 0.12 * (y - 4000);
  z += 200 * Math.exp(-(((x - x0) / 460) ** 2)) - 60 * Math.exp(-(((x - x0 - 700) / 420) ** 2));
  for (const c of CRATERS) {
    const r = Math.hypot(x - c.x, y - c.y) / c.r;
    if (r < 1) z += 0.22 * c.r * (r * r - 1);
    z += 0.05 * c.r * Math.exp(-(((r - 1) / 0.22) ** 2));
  }
  return z + noise(x, y);
}

function gradient(x: number, y: number): [number, number] {
  const h = 10;
  return [(elevation(x + h, y) - elevation(x - h, y)) / (2 * h), (elevation(x, y + h) - elevation(x, y - h)) / (2 * h)];
}

export function slopeDeg(x: number, y: number): number {
  const [gx, gy] = gradient(x, y);
  return Math.atan(Math.hypot(gx, gy)) / DEG;
}

const BLIND_BLOBS = [
  { x: 1300, y: 3300, r: 260, a: 10 },
  { x: 1650, y: 2700, r: 230, a: 11 },
  { x: 1950, y: 2150, r: 250, a: 9 },
  { x: 1450, y: 1500, r: 220, a: 8 },
  { x: 1150, y: 4100, r: 180, a: 7 },
  { x: 2350, y: 4250, r: 150, a: 8 },
  // Patches across the demo corridor, so the safe route has something to avoid.
  { x: 1250, y: 5600, r: 140, a: 10 },
  { x: 2000, y: 3850, r: 150, a: 11 },
  { x: 2700, y: 3800, r: 130, a: 10 }
];

/** 1-sigma slope uncertainty (deg). */
export function slopeSigma(x: number, y: number, slope: number, northFacing: boolean): number {
  let s = 0.5 + 0.1 * slope;
  for (const b of BLIND_BLOBS) s += b.a * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.r * b.r));
  if (northFacing && slope > 10) s += 3; // shadowed slopes: weaker stereo matching
  return s;
}

/** Traversability 0–100 from slope. */
export const trav = (slope: number) => Math.max(0, Math.min(100, 100 * (1 - slope / 25)));

// ---- Precomputed grid --------------------------------------------------------

export type Soil = "bedrock" | "mixed" | "loose-sand";

export interface Grid {
  elev: Float32Array;
  slope: Float32Array;
  sigma: Float32Array;
  travNom: Float32Array;
  travWc: Float32Array;
  ice: Float32Array; // 0..1
  dIce: Float32Array; // m to nearest ice-rich cell
  dMesa: Float32Array;
  southFacing: Uint8Array;
  soil: Soil[];
}

export const cellIndex = (i: number, j: number) => j * GW + i;
export const cellCenter = (i: number, j: number): [number, number] => [(i + 0.5) * CELL_M, (j + 0.5) * CELL_M];
export function cellAt(x: number, y: number): [number, number] {
  return [Math.min(GW - 1, Math.max(0, Math.floor(x / CELL_M))), Math.min(GH - 1, Math.max(0, Math.floor(y / CELL_M)))];
}

function iceAt(x: number, y: number, dMesa: number): number {
  const band = dMesa > 60 && dMesa < 950 ? 0.92 - 0.28 * (dMesa / 950) : 0;
  const speck = dMesa < 0 && dMesa > -260 ? 0.55 + 0.15 * Math.sin(x / 37) * Math.cos(y / 29) : 0;
  return Math.max(0, Math.min(1, Math.max(band, speck, 0.12) + 0.05 * Math.sin(x / 90 + y / 70)));
}

function soilAt(x: number, y: number, dMesa: number): Soil {
  if (dMesa < -100) return "bedrock";
  if (Math.hypot(x - 1500, y - 2600) < 1400) return "loose-sand";
  return "mixed";
}

/** Chamfer distance transform (m) from cells where `src` is true. */
function distanceTo(src: (k: number) => boolean): Float32Array {
  const d = new Float32Array(GW * GH).fill(1e9);
  for (let k = 0; k < d.length; k++) if (src(k)) d[k] = 0;
  const a = CELL_M;
  const b = CELL_M * Math.SQRT2;
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const k = cellIndex(i, j);
      if (i > 0) d[k] = Math.min(d[k], d[k - 1] + a);
      if (j > 0) d[k] = Math.min(d[k], d[k - GW] + a);
      if (i > 0 && j > 0) d[k] = Math.min(d[k], d[k - GW - 1] + b);
      if (i < GW - 1 && j > 0) d[k] = Math.min(d[k], d[k - GW + 1] + b);
    }
  for (let j = GH - 1; j >= 0; j--)
    for (let i = GW - 1; i >= 0; i--) {
      const k = cellIndex(i, j);
      if (i < GW - 1) d[k] = Math.min(d[k], d[k + 1] + a);
      if (j < GH - 1) d[k] = Math.min(d[k], d[k + GW] + a);
      if (i < GW - 1 && j < GH - 1) d[k] = Math.min(d[k], d[k + GW + 1] + b);
      if (i > 0 && j < GH - 1) d[k] = Math.min(d[k], d[k + GW - 1] + b);
    }
  return d;
}

let grid: Grid | null = null;
export function getGrid(): Grid {
  if (grid) return grid;
  const n = GW * GH;
  const g: Grid = {
    elev: new Float32Array(n),
    slope: new Float32Array(n),
    sigma: new Float32Array(n),
    travNom: new Float32Array(n),
    travWc: new Float32Array(n),
    ice: new Float32Array(n),
    dIce: new Float32Array(n),
    dMesa: new Float32Array(n),
    southFacing: new Uint8Array(n),
    soil: new Array<Soil>(n)
  };
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const k = cellIndex(i, j);
      const [x, y] = cellCenter(i, j);
      const [gx, gy] = gradient(x, y);
      const s = Math.atan(Math.hypot(gx, gy)) / DEG;
      // Northern hemisphere: ground rising to the north faces south (toward the sun).
      const south = gy > 0.02;
      const sig = slopeSigma(x, y, s, gy < -0.08);
      const dm = mesaDistance(x, y);
      g.elev[k] = elevation(x, y);
      g.slope[k] = s;
      g.sigma[k] = sig;
      g.travNom[k] = trav(s);
      g.travWc[k] = trav(s + 2 * sig);
      g.dMesa[k] = dm;
      g.ice[k] = iceAt(x, y, dm);
      g.southFacing[k] = south ? 1 : 0;
      g.soil[k] = soilAt(x, y, dm);
    }
  g.dIce.set(distanceTo((k) => g.ice[k] >= 0.6));
  grid = g;
  return g;
}

// ---- Zones -------------------------------------------------------------------

interface ZoneRule {
  id: string;
  label: string;
  color: string;
  defaultOn: boolean;
  rule: string;
  /** `slope` is nominal for the nominal mask, worst-case for the robust mask. */
  test: (g: Grid, k: number, slope: number) => boolean;
}

export const ZONE_RULES: ZoneRule[] = [
  {
    id: "habitat",
    label: "Habitat / base",
    color: "#f7d046",
    defaultOn: true,
    rule: "Slope < 6°, within 1.2 km of ice, off the mesas, not loose sand",
    test: (g, k, s) => s < 6 && g.dIce[k] < 1200 && g.dMesa[k] > 150 && g.soil[k] !== "loose-sand"
  },
  {
    id: "landingpad",
    label: "Landing pad",
    color: "#f472b6",
    defaultOn: true,
    rule: "Slope < 3°, at least 600 m from mesas, not on ice",
    test: (g, k, s) => s < 3 && g.dMesa[k] > 600 && g.ice[k] < 0.5
  },
  {
    id: "ice",
    label: "Ice access",
    color: "#38d1f0",
    defaultOn: true,
    rule: "Ice-rich ground (draft interpretation), slope < 15°",
    test: (g, k, s) => g.ice[k] >= 0.6 && s < 15
  },
  {
    id: "greenhouse",
    label: "Greenhouse / crops",
    color: "#6fe08a",
    defaultOn: false,
    rule: "Slope < 8°, within 800 m of ice",
    test: (g, k, s) => s < 8 && g.dIce[k] < 800 && g.dMesa[k] > 100
  },
  {
    id: "datacenter",
    label: "Data center / heavy infrastructure",
    color: "#c4a7ff",
    defaultOn: false,
    rule: "Slope < 5°, firm ground, within 2 km of ice for cooling",
    test: (g, k, s) => s < 5 && g.soil[k] !== "loose-sand" && g.dIce[k] < 2000 && g.dMesa[k] > 200
  },
  {
    id: "solar",
    label: "Solar array",
    color: "#ff9f4a",
    defaultOn: false,
    rule: "Slope < 10°, flat or facing south",
    test: (g, k, s) => s < 10 && (s < 3 || g.southFacing[k] === 1)
  }
];

export interface Zone {
  rule: ZoneRule;
  /** Row 0 = north. 0 fails, 100 lost to blindspots, 255 robust. */
  mask: Uint8Array;
  nominalKm2: number;
  robustKm2: number;
}

let zones: Zone[] | null = null;
export function getZones(): Zone[] {
  if (zones) return zones;
  const g = getGrid();
  const cellKm2 = (CELL_M * CELL_M) / 1e6;
  zones = ZONE_RULES.map((rule) => {
    const mask = new Uint8Array(GW * GH);
    let nom = 0;
    let rob = 0;
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const k = cellIndex(i, j);
        const s = g.slope[k];
        const sWc = s + 2 * g.sigma[k];
        const isNom = rule.test(g, k, s);
        const isRob = isNom && rule.test(g, k, sWc);
        if (isNom) nom++;
        if (isRob) rob++;
        mask[(GH - 1 - j) * GW + i] = isRob ? 255 : isNom ? 100 : 0;
      }
    return { rule, mask, nominalKm2: nom * cellKm2, robustKm2: rob * cellKm2 };
  });
  return zones;
}

// ---- Images ------------------------------------------------------------------

const RAMP: Array<[number, [number, number, number]]> = [
  [0, [214, 158, 110]],
  [0.3, [222, 182, 140]],
  [0.55, [196, 190, 160]],
  [0.8, [170, 182, 165]],
  [1, [214, 220, 210]]
];

function ramp(t: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2])];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export const BASEMAP_W = 400;
export const BASEMAP_H = 800;

let reliefCache: { min: number; max: number } | null = null;
export function relief() {
  if (reliefCache) return reliefCache;
  const g = getGrid();
  let min = Infinity;
  let max = -Infinity;
  for (const z of g.elev) {
    min = Math.min(min, z);
    max = Math.max(max, z);
  }
  reliefCache = { min, max };
  return reliefCache;
}

let basemapPng: Uint8Array | null = null;
/** Elevation-tinted shaded relief, row 0 = north. */
export function getBasemapPng(): Uint8Array {
  if (basemapPng) return basemapPng;
  const { min, max } = relief();
  const px = SITE.widthM / BASEMAP_W;
  const out = new Uint8Array(BASEMAP_W * BASEMAP_H * 3);
  const az = 315 * DEG;
  const alt = 45 * DEG;
  const lx = Math.sin(az) * Math.cos(alt);
  const ly = Math.cos(az) * Math.cos(alt);
  const lz = Math.sin(alt);
  for (let r = 0; r < BASEMAP_H; r++) {
    const y = SITE.heightM - (r + 0.5) * px;
    for (let c = 0; c < BASEMAP_W; c++) {
      const x = (c + 0.5) * px;
      const z = elevation(x, y);
      const zx = (elevation(x + px, y) - elevation(x - px, y)) / (2 * px);
      const zy = (elevation(x, y + px) - elevation(x, y - px)) / (2 * px);
      const norm = Math.hypot(zx, zy, 1);
      const hill = Math.max(0, (-zx * lx - zy * ly + lz) / norm);
      const shade = 0.5 + 0.62 * hill;
      const [cr, cg, cb] = ramp((z - min) / (max - min));
      const o = (r * BASEMAP_W + c) * 3;
      out[o] = Math.min(255, cr * shade);
      out[o + 1] = Math.min(255, cg * shade);
      out[o + 2] = Math.min(255, cb * shade);
    }
  }
  basemapPng = encodePng(BASEMAP_W, BASEMAP_H, 3, out);
  return basemapPng;
}

const maskPngs = new Map<string, Uint8Array>();
export function getMaskPng(id: string): Uint8Array | null {
  const z = getZones().find((zz) => zz.rule.id === id);
  if (!z) return null;
  let png = maskPngs.get(id);
  if (!png) {
    png = encodePng(GW, GH, 1, z.mask);
    maskPngs.set(id, png);
  }
  return png;
}

// ---- Points of interest --------------------------------------------------------

export const SCIENCE_TARGETS = [
  { id: "sci-1", x: 600, y: 6500, label: "Scarp layering exposure" },
  { id: "sci-2", x: 1350, y: 5900, label: "Apron flow lobes" },
  { id: "sci-3", x: 1000, y: 5000, label: "Exposed ice cliff (candidate)" },
  { id: "sci-4", x: 1700, y: 4100, label: "Polygonal ground" },
  { id: "sci-5", x: 2350, y: 3650, label: "Boulder train" },
  { id: "sci-6", x: 2250, y: 3050, label: "Small fresh crater" },
  { id: "sci-7", x: 900, y: 6900, label: "Crater rim outcrop" },
  { id: "sci-8", x: 3200, y: 2700, label: "Lower apron ridges" }
];

export const DEMO_TRAVERSE = { from: [1150, 6400] as [number, number], to: [3150, 3900] as [number, number] };
