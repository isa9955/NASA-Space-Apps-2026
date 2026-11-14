import assert from "node:assert/strict";
import test from "node:test";
import { HttpRequest, InvocationContext } from "@azure/functions";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const { getStarts } = require("../dist/src/functions/get-starts.js");
const {
  getMissionContextResponse,
} = require("../dist/src/functions/get-mission-context.js");
const request = (path: string) =>
  new HttpRequest({ method: "GET", url: `http://localhost/api/${path}` });
const context = new InvocationContext({ functionName: "journey-smoke" });

test("start discovery advertises exactly the packaged route pairs", async () => {
  const result = await getStarts(request("starts"), context);
  assert.equal(result.status, 200);
  const routes = JSON.parse(
    readFileSync(join(__dirname, "../../pipeline/routes.geojson"), "utf8"),
  );
  assert.equal(result.jsonBody.starts.length, routes.starts.length);
  for (const start of result.jsonBody.starts) {
    assert.deepEqual(
      start.destinations,
      routes.features
        .filter((f: any) => f.properties.startId === start.id)
        .map((f: any) => ({
          siteId: f.properties.siteId,
          status: f.properties.status,
        })),
    );
  }
  assert.equal(
    (await getStarts(request("starts?extra=1"), context)).status,
    400,
  );
});

test("THEMIS context retains the historical whole-frame label scope", async () => {
  const result = await getMissionContextResponse(
    request("mission-context"),
    context,
  );
  assert.equal(result.status, 200);
  const original = JSON.parse(
    readFileSync(
      join(__dirname, "../../pipeline/mission_context.json"),
      "utf8",
    ),
  );
  assert.deepEqual(result.jsonBody.context, original);
  assert.equal(original.productId, "I03114002BTR");
  assert.equal(original.schemaVersion, "mission-context/1.1.0");
  assert.equal(original.footprint.geometry.type, "Polygon");
  assert.equal(original.footprint.siteCoverage.length, 3);
  assert.ok(original.footprint.siteCoverage.every((site: any) => site.insideApproximateFootprint));
  assert.match(
    original.labelBrightnessTemperatureRange.scope,
    /whole observation/,
  );
  assert.match(
    original.limitations.join(" "),
    /not a measurement at a candidate/,
  );
});
