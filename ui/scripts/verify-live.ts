/** Real HTTP contract checks; requires the Python API and normal Vite proxy. No fixtures. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RegionResponse, ConditionsResponse, RouteResponse, ErrorResponse } from "../src/api/schema";

const base = process.env.LIVE_BASE_URL || "http://127.0.0.1:5173";
async function json(path: string) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  return response.json();
}
const region = RegionResponse.parse(await json("/api/region"));
assert.equal(region.dataBadge.kind, "real");
assert.equal(region.region.id, "deuteronilus-mensae");
assert.equal(region.layers.length, 6);
assert(region.sources.some((source) => source.id === "hirise-dtm" && source.url?.includes("hirise.lpl.arizona.edu")));
assert(region.layers.find((layer) => layer.id === "solar")?.rule.includes("4,324 robust cells"));
const { from, to } = region.demoTraverse!;
const conditions = ConditionsResponse.parse(await json(`/api/conditions?lon=${from[0]}&lat=${from[1]}`));
assert.equal(conditions.elevation.value, -2211);
assert.equal(conditions.radiation.value, null);
assert.equal(conditions.temperature.value, null);
assert.equal(conditions.soil.value, null);
const route = RouteResponse.parse(await json(`/api/route?from=${from.join(",")}&to=${to.join(",")}`));
assert.equal(route.status, "ok");
assert.equal(route.standard?.distanceKm, 5.383);
assert.equal(route.safe?.distanceKm, 5.634);
assert.deepEqual(route.standard?.geometry.coordinates[0], from);
assert.deepEqual(route.safe?.geometry.coordinates.at(-1), to);
assert.equal(route.scoutPoints.length, 5);
assert.equal(route.scienceTargets.length, 6);
for (const url of [region.basemap.url, ...region.layers.map((layer) => layer.mask.url)]) {
  const response = await fetch(new URL(url, base));
  assert.equal(response.status, 200, url);
  assert.equal(response.headers.get("content-type"), "image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
}
for (const path of ["/api/conditions?lon=0&lat=0", "/api/route?from=0,0&to=1,1", "/api/region?extra=1"]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 400);
  ErrorResponse.parse(await response.json());
}
// Select an actually blocked native cell from the real committed grid, not a fixture.
const grid = JSON.parse(readFileSync(new URL("../../api/mars-blindspots/data/deuteronilus/data_grid.json", import.meta.url), "utf8"));
const row = grid.traversability.findIndex((values: number[]) => values.some((value) => value < 0.05));
assert(row >= 0);
const col = grid.traversability[row].findIndex((value: number) => value < 0.05);
const [west, south, east, north] = region.region.bounds;
const blocked = [west + (col + 0.5) / grid.grid_cols * (east - west), north - (row + 0.5) / grid.grid_rows * (north - south)];
const unavailable = RouteResponse.parse(await json(`/api/route?from=${from.join(",")}&to=${blocked.join(",")}`));
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.standard, null);
assert.equal(unavailable.safe, null);
console.log("Real HTTP + UI schemas PASS: terrain, six zone masks, conditions, two routes, five scouts, six science targets, solar warning, unavailable route and errors.");
