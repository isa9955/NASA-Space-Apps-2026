import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createHash } from "node:crypto";
import { HttpRequest, InvocationContext } from "@azure/functions";
import { Ajv2020 } from "ajv/dist/2020.js";
import siteSchema from "../src/contracts/site.schema.json";
import routeSchema from "../src/contracts/route.schema.json";
const { getRoute } = require("../dist/src/functions/get-route.js");
const { readRoutes } = require("../dist/src/routes.js");
const context = new InvocationContext({ functionName: "route-smoke" });
const ajv = new Ajv2020();
ajv.addSchema(siteSchema, "sites");
ajv.addSchema(routeSchema, "routes");
const validate = ajv.compile({ $ref: "routes#/$defs/response" });
const errorValid = ajv.compile({ $ref: "sites#/$defs/errorResponse" });
const request = (query: string) => new HttpRequest({ method: "GET", url: `http://localhost/api/routes?${query}` });

test("scientific JSON hashes use LF bytes on Windows and Linux", () => {
  const root = join(__dirname, "../../pipeline");
  for (const file of ["site_inputs.json", "site_assessments.json", "routes.geojson", "mission_context.json", "deuteronilus_analysis.json"]) {
    assert.equal(readFileSync(join(root, file)).includes(13), false, `${file} must use LF without CR bytes`);
  }
  const routes = JSON.parse(readFileSync(join(root, "routes.geojson"), "utf8"));
  assert.equal(routes.inputProvenance.assessmentSha256,
    createHash("sha256").update(readFileSync(join(root, "site_assessments.json"))).digest("hex"));
});

test("route API preserves genuine precomputed paths and validates requests", async () => {
  const bytes = readFileSync(join(__dirname, "../../pipeline/routes.geojson"));
  assert.deepEqual(bytes, readFileSync(join(__dirname, "../dist/data/routes.geojson")));
  for (const feature of JSON.parse(bytes.toString()).features) {
    const response = await getRoute(request(`startId=${feature.properties.startId}&siteId=${feature.properties.siteId}`), context);
    assert.equal(response.status, 200);
    assert.ok(validate(response.jsonBody), ajv.errorsText(validate.errors));
    assert.deepEqual(response.jsonBody.route, feature);
    assert.equal(response.jsonBody.route.properties.status, "provisional");
    assert.ok(response.jsonBody.route.geometry.coordinates.length > 2);
    assert.ok(response.jsonBody.route.properties.distanceMeters > 0);
    assert.deepEqual(response.jsonBody.route.geometry.coordinates[0], feature.properties.requestedStart);
    assert.deepEqual(response.jsonBody.route.geometry.coordinates.at(-1), feature.properties.requestedDestination);
    const corrupted = structuredClone(response.jsonBody);
    corrupted.route.properties.status = "unavailable";
    assert.equal(validate(corrupted), false, "Unavailable routes must not claim measured metrics");
  }
  for (const [query, status] of [
    ["", 400], ["startId=arcadia-sample-01&siteId=x&siteId=y", 400],
    ["startId=bad_id&siteId=x", 400], ["startId=x&siteId=x", 404],
    ["startId=arcadia-sample-01&siteId=missing", 404],
    ["startId=arcadia-sample-01&siteId=arcadia-sample-01", 404],
  ] as const) {
    const response = await getRoute(request(query), context);
    assert.equal(response.status, status);
    assert.ok(errorValid(response.jsonBody));
  }
});

test("stale routes cannot be packaged against another assessment snapshot", () => {
  const directory = mkdtempSync(join(tmpdir(), "mars-route-check-"));
  try {
    const routes = JSON.parse(readFileSync(join(__dirname, "../../pipeline/routes.geojson"), "utf8"));
    routes.inputProvenance.assessmentSha256 = "0".repeat(64);
    const file = join(directory, "routes.geojson");
    writeFileSync(file, JSON.stringify(routes));
    assert.throws(() => readRoutes(file, join(__dirname, "../../pipeline/site_assessments.json")), /different assessment snapshot/);
  } finally { rmSync(directory, { recursive: true }); }
});
