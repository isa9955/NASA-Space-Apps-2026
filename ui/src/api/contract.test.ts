// Contract tests: the mock backend must satisfy the schemas, and the client
// must turn bad or failing responses into readable errors.
import { afterEach, describe, expect, it, vi } from "vitest";
import { unzlibSync } from "fflate";
import { ConditionsResponse, ErrorResponse, RegionResponse, RouteResponse } from "./schema";
import { getRegion, getRoute } from "./client";
import { ApiError } from "./errors";
import { handleMockRequest } from "../mocks/server";

const get = (url: string) => {
  const r = handleMockRequest(url);
  return { ...r, json: typeof r.body === "string" ? JSON.parse(r.body) : null };
};

describe("mock backend satisfies the contract", () => {
  const region = RegionResponse.parse(get("/api/region").json);

  it("region: zones, demo traverse, sources", () => {
    expect(region.layers.map((l) => l.id)).toEqual(["habitat", "landingpad", "ice", "greenhouse", "datacenter", "solar"]);
    for (const l of region.layers) {
      expect(l.robustKm2).toBeLessThanOrEqual(l.nominalKm2);
      expect(l.survivesPct).toBeCloseTo(l.nominalKm2 ? (100 * l.robustKm2) / l.nominalKm2 : 0, -1);
    }
    expect(region.demoTraverse).not.toBeNull();
  });

  it("serves valid PNGs for the basemap and every mask, with the declared size", () => {
    for (const url of [region.basemap.url, ...region.layers.map((l) => l.mask.url)]) {
      const r = handleMockRequest(url);
      expect(r.status, url).toBe(200);
      expect(r.contentType).toBe("image/png");
      const png = r.body as Uint8Array;
      expect(Array.from(png.slice(1, 4))).toEqual([80, 78, 71]); // "PNG"
    }
    const mask = region.layers[0].mask;
    const png = handleMockRequest(mask.url).body as Uint8Array;
    const dv = new DataView(png.buffer, png.byteOffset);
    expect(dv.getUint32(16)).toBe(mask.width);
    expect(dv.getUint32(20)).toBe(mask.height);
    // IDAT decompresses to (width + 1 filter byte) * height bytes.
    const idatLen = dv.getUint32(33);
    expect(unzlibSync(png.slice(41, 41 + idatLen)).length).toBe((mask.width + 1) * mask.height);
  });

  it("conditions inside the region", () => {
    const [w, s, e, n] = region.region.bounds;
    const c = ConditionsResponse.parse(get(`/api/conditions?lon=${(w + e) / 2}&lat=${(s + n) / 2}`).json);
    expect(c.radiation.qualifier).toBe("estimated");
  });

  it("demo route: both variants, safe has fewer critical blindspots", () => {
    const { from, to } = region.demoTraverse!;
    const r = RouteResponse.parse(get(`/api/route?from=${from.join(",")}&to=${to.join(",")}`).json);
    expect(r.status).toBe("ok");
    expect(r.standard!.geometry.coordinates[0]).toEqual(from);
    expect(r.safe!.geometry.coordinates.at(-1)).toEqual(to);
    expect(r.safe!.criticalBlindspotPct).toBeLessThan(r.standard!.criticalBlindspotPct);
    expect(r.scoutPoints.map((s) => s.rank)).toEqual(r.scoutPoints.map((_, i) => i + 1));
    const along = r.scoutPoints.map((s) => s.alongM);
    expect([...along].sort((a, b) => a - b)).toEqual(along);
  });

  it("errors use the error envelope", () => {
    for (const url of ["/api/conditions?lon=0&lat=0", "/api/route?from=0,0&to=1,1", "/api/route", "/api/nope"]) {
      const r = get(url);
      expect(r.status, url).toBeGreaterThanOrEqual(400);
      expect(ErrorResponse.safeParse(r.json).success, url).toBe(true);
    }
  });
});

describe("client", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubFetch = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it("returns validated data", async () => {
    stubFetch(200, get("/api/region").json);
    await expect(getRegion()).resolves.toHaveProperty("region.name");
  });

  it("names the bad field when the backend sends the wrong shape", async () => {
    const bad = get("/api/region").json;
    bad.layers[0].color = "yellow";
    stubFetch(200, bad);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getRegion()).rejects.toThrow(/layers\.0\.color/);
  });

  it("passes through the backend error message", async () => {
    stubFetch(400, { error: { code: "OUT_OF_REGION", message: "Place both points inside X." } });
    const err = await getRoute([0, 0], [1, 1]).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("OUT_OF_REGION");
    expect(err.message).toBe("Place both points inside X.");
  });

  it("reports an unreachable backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(getRegion()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
