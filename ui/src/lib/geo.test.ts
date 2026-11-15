import { describe, expect, it } from "vitest";
import { KM_PER_DEG, inBounds, marsDistanceKm, toLeafletBounds } from "./geo";
import { compareRoutes } from "./format";
import { fitAt, pixelToLonLat, robustPatches, tintPixels, ROBUST_ALPHA, FAINT_ALPHA } from "./mask";
import type { RouteVariant } from "../api/schema";

describe("geo", () => {
  it("uses the Mars radius, not Earth's", () => {
    expect(marsDistanceKm([0, 0], [1, 0])).toBeCloseTo(KM_PER_DEG, 2);
    expect(KM_PER_DEG).toBeCloseTo(59.16, 1);
  });
  it("checks bounds and converts to Leaflet order", () => {
    expect(inBounds([1, 1], [0, 0, 2, 2])).toBe(true);
    expect(inBounds([3, 1], [0, 0, 2, 2])).toBe(false);
    expect(toLeafletBounds([10, 20, 30, 40])).toEqual([
      [20, 10],
      [40, 30]
    ]);
  });
});

describe("mask tinting", () => {
  it("maps 0 / 1–127 / 128–255 to transparent / faint / robust", () => {
    const px = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 255, 255, 255, 255]);
    expect(Array.from(tintPixels(px, "#38d1f0"))).toEqual([0, 100, 255]);
    expect(Array.from(px.slice(0, 4))).toEqual([0x38, 0xd1, 0xf0, 0]);
    expect(px[7]).toBe(FAINT_ALPHA);
    expect(px[11]).toBe(ROBUST_ALPHA);
  });
});

describe("zone symbols", () => {
  // 6 × 4 mask: a 4-pixel robust patch (left), a 1-pixel robust patch, a nominal-only pixel.
  const w = 6, h = 4;
  const v = new Uint8Array([
    255, 255, 0, 0, 0, 0,
    255, 255, 0, 0, 255, 0,
    0, 0, 0, 100, 0, 0,
    0, 0, 0, 0, 0, 0
  ]);
  it("finds robust patches, biggest first, with the symbol inside the patch", () => {
    const p = robustPatches(v, w, h, 1, 5);
    expect(p.map((q) => q.pixels)).toEqual([4, 1]);
    expect(v[p[0].y * w + p[0].x]).toBe(255);
    expect(robustPatches(v, w, h, 2, 5)).toHaveLength(1);
  });
  it("maps pixels to lon/lat and looks up the fit at a point", () => {
    const bbox: [number, number, number, number] = [0, 0, 6, 4];
    expect(pixelToLonLat(0, 0, w, h, bbox)).toEqual([0.5, 3.5]);
    const m = { values: v, width: w, height: h };
    expect(fitAt([0.5, 3.5], m, bbox)).toBe("robust");
    expect(fitAt([3.5, 1.5], m, bbox)).toBe("nominal");
    expect(fitAt([5.5, 0.5], m, bbox)).toBeNull();
    expect(fitAt([9, 9], m, bbox)).toBeNull();
  });
});

describe("route comparison text", () => {
  const v = (kind: "standard" | "safe", km: number, crit: number, wc: number): RouteVariant => ({
    kind,
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    distanceKm: km,
    walkMin: 0,
    criticalBlindspotPct: crit,
    worstCaseTravPct: wc
  });
  it("matches the design sentence", () => {
    expect(compareRoutes(v("standard", 2.74, 11, 45), v("safe", 2.88, 3, 50))).toBe(
      "The uncertainty-aware route is +140 m (+5%) longer. It cuts critical-blindspot exposure from 11% to 3% of the path and raises worst-case traversability from 45% to 50%."
    );
  });
  it("handles a safe route that is shorter and no better", () => {
    expect(compareRoutes(v("standard", 3, 5, 60), v("safe", 2.9, 5, 60))).toContain("100 m (3%) shorter");
  });
});
