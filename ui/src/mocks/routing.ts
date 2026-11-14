// Mock router: A* over the fake site twice.
//   Standard route: nominal slope (trusts the map).
//   Safe route: worst-case slope, penalising uncertain cells (avoids blindspots).
// The real router lives in the Python API and must return the same shape.
import type { LonLat, RouteResponse, RouteVariant, ScoutPoint } from "../api/schema";
import { CELL_M, GH, GW, SCIENCE_TARGETS, cellAt, cellCenter, cellIndex, getGrid, toLonLat, type Grid } from "./site";

class Heap {
  private a: Array<[number, number]> = [];
  get size() {
    return this.a.length;
  }
  push(node: number, pri: number) {
    const a = this.a;
    a.push([pri, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0][1];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const blind = (g: Grid, k: number) => g.travNom[k] - g.travWc[k];

export const standardCost = (g: Grid, k: number) => {
  const s = g.slope[k];
  if (s > 25) return Infinity;
  return (s > 15 ? 10 : 1) * (1 + (100 - g.travNom[k]) / 100);
};

export const safeCost = (g: Grid, k: number) => {
  const s = g.slope[k];
  if (s > 25) return Infinity;
  const b = blind(g, k);
  return (s > 15 ? 10 : 1) * (1 + (1.2 * (100 - g.travWc[k])) / 100) + (b > 50 ? 4 : (b / 50) * 0.8);
};

function astar(g: Grid, cost: (g: Grid, k: number) => number, start: number, goal: number): number[] | null {
  const n = GW * GH;
  const c = new Float64Array(n);
  for (let k = 0; k < n; k++) c[k] = cost(g, k);
  c[start] = Math.min(c[start], 10); // the clicked endpoints are always allowed
  c[goal] = Math.min(c[goal], 10);
  const gi = goal % GW;
  const gj = (goal - gi) / GW;
  const h = (i: number, j: number) => Math.hypot(i - gi, j - gj) * CELL_M;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new Heap();
  best[start] = 0;
  heap.push(start, 0);
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    const ci = cur % GW;
    const cj = (cur - ci) / GW;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const nb = cellIndex(ni, nj);
        if (!Number.isFinite(c[nb])) continue;
        const ng = best[cur] + ((c[cur] + c[nb]) / 2) * Math.hypot(di, dj) * CELL_M;
        if (ng < best[nb]) {
          best[nb] = ng;
          prev[nb] = cur;
          heap.push(nb, ng + h(ni, nj));
        }
      }
  }
  if (!Number.isFinite(best[goal])) return null;
  const path: number[] = [];
  for (let k = goal; k !== -1; k = prev[k]) path.push(k);
  return path.reverse();
}

interface Measured {
  variant: RouteVariant;
  alongM: number[];
}

function measure(g: Grid, kind: "standard" | "safe", cells: number[], from: LonLat, to: LonLat): Measured {
  const coords: LonLat[] = cells.map((k) => {
    const i = k % GW;
    const [x, y] = cellCenter(i, (k - i) / GW);
    return toLonLat(x, y);
  });
  coords[0] = from;
  coords[coords.length - 1] = to;
  let dist = 0;
  let minutes = 0;
  let critical = 0;
  let wcSum = 0;
  const alongM = [0];
  for (let s = 1; s < cells.length; s++) {
    const a = cells[s - 1];
    const b = cells[s];
    const ai = a % GW;
    const bi = b % GW;
    const step = Math.hypot(ai - bi, (a - ai) / GW - (b - bi) / GW) * CELL_M;
    const grade = Math.abs(g.elev[b] - g.elev[a]) / step;
    const kmh = 3.2 * Math.exp(-3 * grade); // hiking-speed model
    dist += step;
    minutes += (step / 1000 / kmh) * 60;
    if (g.travNom[b] - g.travWc[b] > 50) critical += step;
    wcSum += g.travWc[b] * step;
    alongM.push(dist);
  }
  return {
    alongM,
    variant: {
      kind,
      geometry: { type: "LineString", coordinates: coords },
      distanceKm: dist / 1000,
      walkMin: minutes,
      criticalBlindspotPct: dist ? (100 * critical) / dist : 0,
      worstCaseTravPct: dist ? wcSum / dist : g.travWc[cells[0]]
    }
  };
}

function scoutPoints(g: Grid, cells: number[], alongM: number[]): ScoutPoint[] {
  const cand = cells
    .map((k, idx) => ({ k, idx, b: g.travNom[k] - g.travWc[k] }))
    .filter((c) => c.b >= 30)
    .sort((a, b) => b.b - a.b);
  const chosen: typeof cand = [];
  for (const c of cand) {
    if (chosen.length >= 5) break;
    if (chosen.some((o) => Math.abs(alongM[o.idx] - alongM[c.idx]) < 200)) continue;
    chosen.push(c);
  }
  return chosen
    .sort((a, b) => a.idx - b.idx)
    .map((c, r) => {
      const i = c.k % GW;
      const [x, y] = cellCenter(i, (c.k - i) / GW);
      return {
        rank: r + 1,
        location: toLonLat(x, y),
        alongM: Math.round(alongM[c.idx]),
        blindspotPts: Math.round(c.b),
        slopeDeg: Math.round(g.slope[c.k]),
        slopeUncDeg: Math.round(2 * g.sigma[c.k]),
        worstCaseTravPct: Math.round(g.travWc[c.k])
      };
    });
}

function nearbyTargets(cellsA: number[], cellsB: number[]) {
  const pts = [...cellsA, ...cellsB].map((k) => {
    const i = k % GW;
    return cellCenter(i, (k - i) / GW);
  });
  return SCIENCE_TARGETS.filter((t) => pts.some(([x, y]) => Math.hypot(x - t.x, y - t.y) < 350)).map((t) => ({
    id: t.id,
    label: t.label,
    location: toLonLat(t.x, t.y)
  }));
}

const BASE = { schemaVersion: "1.0.0", algorithmVersion: "mock-dual-astar-1" };

export function planRoutes(from: LonLat, to: LonLat, fromXY: [number, number], toXY: [number, number], sources: RouteResponse["sources"]): RouteResponse {
  const t0 = performance.now();
  const g = getGrid();
  const [si, sj] = cellAt(...fromXY);
  const [ti, tj] = cellAt(...toXY);
  const start = cellIndex(si, sj);
  const goal = cellIndex(ti, tj);
  const std = astar(g, standardCost, start, goal);
  const safe = astar(g, safeCost, start, goal);
  if (!std || !safe) {
    return {
      ...BASE,
      status: "unavailable",
      reason: "Terrain steeper than 25° blocks every path between these points.",
      from,
      to,
      computeMs: Math.round(performance.now() - t0),
      standard: null,
      safe: null,
      scoutPoints: [],
      scienceTargets: [],
      sources
    };
  }
  const a = measure(g, "standard", std, from, to);
  const b = measure(g, "safe", safe, from, to);
  return {
    ...BASE,
    status: "ok",
    from,
    to,
    computeMs: Math.round(performance.now() - t0),
    standard: a.variant,
    safe: b.variant,
    scoutPoints: scoutPoints(g, std, a.alongM),
    scienceTargets: nearbyTargets(std, safe),
    sources
  };
}
