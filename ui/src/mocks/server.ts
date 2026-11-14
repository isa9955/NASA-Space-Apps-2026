// Mock backend. Runs inside the Vite dev server (see vite.config.ts) and
// answers /api/* exactly like the Python Functions API will, so the UI's real
// fetch + validation path is exercised during development.
import type { ConditionsResponse, LonLat, RegionResponse } from "../api/schema";
import { inBounds } from "../lib/geo";
import { planRoutes } from "./routing";
import {
  BOUNDS,
  CELL_M,
  DEMO_TRAVERSE,
  SITE,
  cellAt,
  cellIndex,
  getBasemapPng,
  getGrid,
  getMaskPng,
  getZones,
  relief,
  toLonLat,
  toXY
} from "./site";

export interface MockResponse {
  status: number;
  contentType: string;
  body: string | Uint8Array;
}

const SOURCES = [
  { id: "dtm", provider: "MOCK", product: "Synthetic DTM standing in for a HiRISE DTM", version: null, url: null },
  { id: "unc", provider: "MOCK", product: "Synthetic slope uncertainty", version: null, url: null },
  { id: "ice", provider: "MOCK", product: "Draft ice-rich ground interpretation", version: null, url: null },
  { id: "rad", provider: "MOCK", product: "Radiation model anchored to MSL RAD (mock constants)", version: null, url: null }
];

const json = (status: number, body: unknown): MockResponse => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body)
});
const error = (status: number, code: string, message: string) => json(status, { error: { code, message } });

function parsePoint(v: string | null): LonLat | null {
  if (!v) return null;
  const [a, b] = v.split(",").map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

export function regionResponse(): RegionResponse {
  const { min, max } = relief();
  return {
    schemaVersion: "1.0.0",
    region: {
      id: SITE.id,
      name: SITE.name,
      subtitle: SITE.subtitle,
      bounds: BOUNDS,
      dataset: {
        label: `Mock DTM · ${SITE.name}`,
        sizeKm: [SITE.widthM / 1000, SITE.heightM / 1000],
        resolutionM: CELL_M,
        reliefM: Math.round(max - min)
      }
    },
    dataBadge: { label: "Mock data", kind: "mock" },
    basemap: { url: "/api/assets/basemap.png" },
    layers: getZones().map((z) => ({
      id: z.rule.id,
      label: z.rule.label,
      color: z.rule.color,
      defaultOn: z.rule.defaultOn,
      rule: z.rule.rule,
      nominalKm2: Math.round(z.nominalKm2 * 100) / 100,
      robustKm2: Math.round(z.robustKm2 * 100) / 100,
      survivesPct: z.nominalKm2 ? Math.round((100 * z.robustKm2) / z.nominalKm2) : 0,
      mask: { url: `/api/assets/mask-${z.rule.id}.png`, width: 200, height: 400 }
    })),
    demoTraverse: { from: toLonLat(...DEMO_TRAVERSE.from), to: toLonLat(...DEMO_TRAVERSE.to) },
    algorithmVersion: "mock-zones-1",
    sources: SOURCES
  };
}

export function conditionsResponse(p: LonLat): ConditionsResponse {
  const g = getGrid();
  const k = cellIndex(...cellAt(...toXY(p)));
  const elev = g.elev[k];
  return {
    schemaVersion: "1.0.0",
    location: p,
    elevation: { value: Math.round(elev), unit: "m", qualifier: null },
    slope: { value: Math.round(g.slope[k] * 10) / 10, unit: "°", qualifier: null, uncertainty: Math.round(2 * g.sigma[k]) },
    soil: { value: g.soil[k], qualifier: "regional" },
    ice: { value: Math.round(g.ice[k] * 100), unit: "%", qualifier: "estimated" },
    radiation: {
      value: Math.round(0.64 * Math.exp((0.35 * (elev + 4500)) / 11000) * 100) / 100,
      unit: "mSv/day",
      qualifier: "estimated"
    },
    temperature: {
      value: Math.round(-62 - ((elev + 3900) / 1000) * 2.5 + (g.southFacing[k] ? 2 : -1)),
      unit: "°C",
      qualifier: "estimated"
    },
    sources: SOURCES
  };
}

export function handleMockRequest(rawUrl: string): MockResponse {
  const url = new URL(rawUrl, "http://mock.local");
  const path = url.pathname.replace(/^\/api/, "").replace(/\/$/, "");

  if (path === "/region") return json(200, regionResponse());

  if (path === "/assets/basemap.png") return { status: 200, contentType: "image/png", body: getBasemapPng() };
  const m = path.match(/^\/assets\/mask-([\w-]+)\.png$/);
  if (m) {
    const png = getMaskPng(m[1]);
    return png ? { status: 200, contentType: "image/png", body: png } : error(404, "NOT_FOUND", "Unknown layer.");
  }

  if (path === "/conditions") {
    const lon = Number(url.searchParams.get("lon"));
    const lat = Number(url.searchParams.get("lat"));
    if (!url.searchParams.has("lon") || !url.searchParams.has("lat") || !Number.isFinite(lon) || !Number.isFinite(lat))
      return error(400, "INVALID_ARGUMENT", "lon and lat are required numbers.");
    if (!inBounds([lon, lat], BOUNDS)) return error(400, "OUT_OF_REGION", `No data here. Click inside ${SITE.name}.`);
    return json(200, conditionsResponse([lon, lat]));
  }

  if (path === "/route") {
    const from = parsePoint(url.searchParams.get("from"));
    const to = parsePoint(url.searchParams.get("to"));
    if (!from || !to) return error(400, "INVALID_ARGUMENT", "from and to are required as lon,lat.");
    if (!inBounds(from, BOUNDS) || !inBounds(to, BOUNDS))
      return error(400, "OUT_OF_REGION", `Place both points inside ${SITE.name}.`);
    const a = toXY(from);
    const b = toXY(to);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 50) return error(400, "INVALID_ARGUMENT", "Start and end are less than 50 m apart.");
    return json(200, planRoutes(from, to, a, b, SOURCES));
  }

  return error(404, "NOT_FOUND", `No endpoint ${url.pathname}.`);
}
